import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, Like } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { KnowledgeBaseEntry } from './knowledge-base.entity';

export interface KbSearchResult {
  id: string;
  title: string;
  content: string;
  source: string;
  category?: string;
  fileName?: string;
  similarity?: number;
  createdAt: Date;
}

export interface KbListResult {
  success: boolean;
  entries?: KbSearchResult[];
  total?: number;
  message?: string;
  error?: string;
}

export interface KbAddResult {
  success: boolean;
  entry?: { id: string; title: string };
  message?: string;
  error?: string;
}

@Injectable()
export class KnowledgeBaseService {
  private readonly logger = new Logger(KnowledgeBaseService.name);
  private readonly openai: OpenAI;
  private readonly EMBEDDING_MODEL = 'text-embedding-3-small';
  private readonly EMBEDDING_DIMS = 1536;

  constructor(
    @InjectRepository(KnowledgeBaseEntry)
    private readonly repo: Repository<KnowledgeBaseEntry>,
    private readonly config: ConfigService,
    private readonly dataSource: DataSource,
  ) {
    this.openai = new OpenAI({
      apiKey: this.config.get<string>('OPENAI_API_KEY'),
    });

    // Ensure pgvector extension exists (best-effort, non-fatal)
    this.ensurePgvector().catch(e =>
      this.logger.warn('pgvector setup skipped:', e.message),
    );
  }

  // ── pgvector bootstrap ───────────────────────────────────────────────────
  private async ensurePgvector() {
    try {
      await this.dataSource.query(`CREATE EXTENSION IF NOT EXISTS vector`);
      this.logger.log('pgvector extension ready');
    } catch (e) {
      this.logger.warn('Could not create pgvector extension (may already exist):', e.message);
    }
  }

  // ── Embed text via OpenAI ────────────────────────────────────────────────
  private async embed(text: string): Promise<number[] | null> {
    try {
      const clean = text.replace(/\n+/g, ' ').slice(0, 8000);
      const res = await this.openai.embeddings.create({
        model: this.EMBEDDING_MODEL,
        input: clean,
      });
      return res.data[0].embedding;
    } catch (err: any) {
      this.logger.error('Embedding failed:', err.message);
      return null;
    }
  }

  // ── Cosine similarity search using pgvector (fallback: text search) ──────
  async search(query: string, limit = 5): Promise<KbSearchResult[]> {
    try {
      const queryVec = await this.embed(query);

      if (queryVec) {
        // Try pgvector cosine similarity
        try {
          const vecStr = `[${queryVec.join(',')}]`;
          const rows: any[] = await this.dataSource.query(
            `SELECT id, title, content, source, category, file_name as "fileName",
                    created_at as "createdAt",
                    1 - (embedding::vector <=> $1::vector) AS similarity
             FROM knowledge_base_entries
             WHERE is_active = true
               AND embedding IS NOT NULL
             ORDER BY embedding::vector <=> $1::vector
             LIMIT $2`,
            [vecStr, limit],
          );
          if (rows.length > 0) {
            return rows.map(r => ({
              ...r,
              similarity: parseFloat(r.similarity ?? 0),
            }));
          }
        } catch (pgErr: any) {
          this.logger.warn('pgvector query failed, falling back to text search:', pgErr.message);
        }
      }

      // Fallback: basic keyword search
      const entries = await this.repo.find({
        where: { isActive: true },
        order: { createdAt: 'DESC' },
        take: limit,
        select: ['id', 'title', 'content', 'source', 'category', 'fileName', 'createdAt'],
      });
      return entries.filter(e =>
        e.title.toLowerCase().includes(query.toLowerCase()) ||
        e.content.toLowerCase().includes(query.toLowerCase()),
      ).slice(0, limit);
    } catch (err: any) {
      this.logger.error('search error:', err.message);
      return [];
    }
  }

  // ── Add a new entry ──────────────────────────────────────────────────────
  async addEntry(params: {
    title: string;
    content: string;
    source?: string;
    category?: string;
    fileName?: string;
  }): Promise<KbAddResult> {
    try {
      const { title, content, source = 'manual', category, fileName } = params;

      if (!title?.trim() || !content?.trim()) {
        return { success: false, error: 'Title and content are required.' };
      }

      const embedding = await this.embed(`${title}\n\n${content}`);

      const entry = this.repo.create({
        title:     title.trim(),
        content:   content.trim(),
        source,
        category:  category?.trim() || undefined,
        fileName:  fileName?.trim() || undefined,
        embedding: embedding ? JSON.stringify(embedding) : undefined,
        isActive:  true,
      });

      const saved = await this.repo.save(entry);

      // Store embedding as pgvector if available
      if (embedding) {
        try {
          const vecStr = `[${embedding.join(',')}]`;
          await this.dataSource.query(
            `UPDATE knowledge_base_entries
             SET embedding = $1
             WHERE id = $2`,
            [vecStr, saved.id],
          );
        } catch (e: any) {
          this.logger.warn('pgvector update failed (will use JSON fallback):', e.message);
        }
      }

      this.logger.log(`KB entry added: "${title}" (${saved.id})`);
      return {
        success: true,
        entry: { id: saved.id, title: saved.title },
        message: `"${title}" added to Knowledge Base.`,
      };
    } catch (err: any) {
      this.logger.error('addEntry error:', err.message);
      return { success: false, error: err.message };
    }
  }

  // ── List / browse entries ────────────────────────────────────────────────
  async listEntries(params?: {
    page?: number;
    pageSize?: number;
    search?: string;
    category?: string;
  }): Promise<KbListResult> {
    try {
      const page     = params?.page     ?? 1;
      const pageSize = params?.pageSize ?? 20;
      const skip     = (page - 1) * pageSize;

      const qb = this.repo.createQueryBuilder('kb')
        .where('kb.isActive = :active', { active: true })
        .orderBy('kb.createdAt', 'DESC')
        .skip(skip)
        .take(pageSize)
        .select([
          'kb.id', 'kb.title', 'kb.content', 'kb.source',
          'kb.category', 'kb.fileName', 'kb.createdAt',
        ]);

      if (params?.search) {
        qb.andWhere(
          '(LOWER(kb.title) LIKE :q OR LOWER(kb.content) LIKE :q)',
          { q: `%${params.search.toLowerCase()}%` },
        );
      }

      if (params?.category) {
        qb.andWhere('kb.category = :cat', { cat: params.category });
      }

      const [entries, total] = await qb.getManyAndCount();

      return {
        success: true,
        entries: entries.map(e => ({
          id:        e.id,
          title:     e.title,
          content:   e.content,
          source:    e.source,
          category:  e.category,
          fileName:  e.fileName,
          createdAt: e.createdAt,
        })),
        total,
      };
    } catch (err: any) {
      this.logger.error('listEntries error:', err.message);
      return { success: false, error: err.message };
    }
  }

  // ── Get single entry ─────────────────────────────────────────────────────
  async getEntry(id: string): Promise<KnowledgeBaseEntry | null> {
    return this.repo.findOne({
      where: { id, isActive: true },
      select: ['id', 'title', 'content', 'source', 'category', 'fileName', 'createdAt', 'updatedAt'],
    });
  }

  // ── Delete entry ─────────────────────────────────────────────────────────
  async deleteEntry(id: string): Promise<{ success: boolean; error?: string }> {
    try {
      await this.repo.update(id, { isActive: false });
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  // ── List categories ──────────────────────────────────────────────────────
  async listCategories(): Promise<string[]> {
    try {
      const rows = await this.repo
        .createQueryBuilder('kb')
        .select('DISTINCT kb.category', 'category')
        .where('kb.isActive = :a', { a: true })
        .andWhere('kb.category IS NOT NULL')
        .getRawMany();
      return rows.map(r => r.category).filter(Boolean);
    } catch {
      return [];
    }
  }
}
