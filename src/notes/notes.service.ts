import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Note } from './note.entity';

export interface NoteResult {
  success: boolean;
  note?: Partial<Note>;
  notes?: Partial<Note>[];
  total?: number;
  message?: string;
  error?: string;
}

/**
 * NotesService — per-user quick notes.
 *
 * Created from the chat (create_note tool — saves instantly, no confirmation)
 * or from the frontend Notes section. All operations are scoped to the
 * calling userId; one user can never read or delete another user's notes.
 */
@Injectable()
export class NotesService {
  private readonly logger = new Logger(NotesService.name);

  constructor(
    @InjectRepository(Note)
    private readonly repo: Repository<Note>,
  ) {}

  private sanitise(n: Note): Partial<Note> {
    return {
      id:        n.id,
      title:     n.title ?? undefined,
      content:   n.content,
      createdAt: n.createdAt,
      updatedAt: n.updatedAt,
    };
  }

  async create(userId: string, content: string, title?: string): Promise<NoteResult> {
    try {
      if (!content?.trim()) return { success: false, error: 'Note content is required.' };
      const note = await this.repo.save(this.repo.create({
        userId,
        content: content.trim(),
        title:   title?.trim() || undefined,
      }));
      this.logger.log(`Note created for ${userId}: ${note.id}`);
      return { success: true, note: this.sanitise(note), message: 'Note saved.' };
    } catch (err: any) {
      this.logger.error('create note error:', err.message);
      return { success: false, error: err.message };
    }
  }

  async list(userId: string, params?: { search?: string; limit?: number }): Promise<NoteResult> {
    try {
      const limit = Math.min(params?.limit ?? 50, 200);
      const qb = this.repo.createQueryBuilder('n')
        .where('n.userId = :userId', { userId })
        .orderBy('n.createdAt', 'DESC')
        .take(limit);

      if (params?.search?.trim()) {
        qb.andWhere('(LOWER(n.content) LIKE :q OR LOWER(n.title) LIKE :q)', {
          q: `%${params.search.trim().toLowerCase()}%`,
        });
      }

      const [notes, total] = await qb.getManyAndCount();
      return { success: true, notes: notes.map(n => this.sanitise(n)), total };
    } catch (err: any) {
      this.logger.error('list notes error:', err.message);
      return { success: false, error: err.message };
    }
  }

  async update(userId: string, id: string, fields: { content?: string; title?: string }): Promise<NoteResult> {
    try {
      const note = await this.repo.findOne({ where: { id, userId } });
      if (!note) return { success: false, error: 'Note not found.' };
      if (fields.content?.trim()) note.content = fields.content.trim();
      if (fields.title !== undefined) note.title = fields.title?.trim() || (null as any);
      const saved = await this.repo.save(note);
      return { success: true, note: this.sanitise(saved), message: 'Note updated.' };
    } catch (err: any) {
      this.logger.error('update note error:', err.message);
      return { success: false, error: err.message };
    }
  }

  async delete(userId: string, id: string): Promise<NoteResult> {
    try {
      const note = await this.repo.findOne({ where: { id, userId } });
      if (!note) return { success: false, error: 'Note not found.' };
      await this.repo.remove(note);
      return { success: true, message: 'Note deleted.' };
    } catch (err: any) {
      this.logger.error('delete note error:', err.message);
      return { success: false, error: err.message };
    }
  }
}
