import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Document } from './entities/document.entity';
import { DocumentChunk } from './entities/document-chunk.entity';
import { EmbeddingService } from './services/embedding.service';
import { UploadDocumentDto } from './dto/upload-document.dto';
import { SearchDocumentsDto } from './dto/search-documents.dto';

/**
 * Knowledge Base Service
 * Handles document upload, chunking, embedding, and vector search
 */
@Injectable()
export class KnowledgeBaseService {
  constructor(
    @InjectRepository(Document)
    private documentRepository: Repository<Document>,
    @InjectRepository(DocumentChunk)
    private chunkRepository: Repository<DocumentChunk>,
    private embeddingService: EmbeddingService,
  ) {}

  /**
   * Upload and process a document
   * @param userId User ID
   * @param uploadDto Document data
   * @returns Created document
   */
  async uploadDocument(
    userId: string,
    uploadDto: UploadDocumentDto,
  ): Promise<Document> {
    // Create document
    const document = this.documentRepository.create({
      ...uploadDto,
      userId,
    });

    await this.documentRepository.save(document);

    // Process document asynchronously
    this.processDocument(document).catch((error) => {
      console.error('Error processing document:', error);
    });

    return document;
  }

  /**
   * Process document: chunk and generate embeddings
   * @param document Document to process
   */
  private async processDocument(document: Document): Promise<void> {
    // Split document into chunks
    const chunks = this.embeddingService.splitTextIntoChunks(document.content);

    // Generate embeddings for all chunks
    const embeddings = await this.embeddingService.generateEmbeddings(
      chunks.map((c) => c.content),
    );

    // Create chunk entities
    const chunkEntities = chunks.map((chunk, index) => {
      return this.chunkRepository.create({
        content: chunk.content,
        chunkIndex: index,
        startPosition: chunk.startPosition,
        endPosition: chunk.endPosition,
        embedding: embeddings[index],
        documentId: document.id,
      });
    });

    // Save all chunks
    await this.chunkRepository.save(chunkEntities);
  }

  /**
   * Search documents using vector similarity
   * @param userId User ID
   * @param searchDto Search parameters
   * @returns Matching document chunks with similarity scores
   */
  async searchDocuments(
    userId: string,
    searchDto: SearchDocumentsDto,
  ): Promise<any[]> {
    // Generate embedding for search query
    const queryEmbedding = await this.embeddingService.generateEmbedding(
      searchDto.query,
    );

    // Perform vector similarity search using pgvector
    // Using cosine distance (1 - cosine similarity)
    const query = `
      SELECT
        dc.id,
        dc.content,
        dc."chunkIndex",
        d.id as "documentId",
        d.title as "documentTitle",
        d.metadata as "documentMetadata",
        d."sourceUrl",
        1 - (dc.embedding <=> $1::vector) as similarity
      FROM document_chunks dc
      INNER JOIN documents d ON dc."documentId" = d.id
      WHERE d."userId" = $2
        AND 1 - (dc.embedding <=> $1::vector) >= $3
      ORDER BY dc.embedding <=> $1::vector
      LIMIT $4
    `;

    const results = await this.chunkRepository.query(query, [
      JSON.stringify(queryEmbedding),
      userId,
      searchDto.threshold || 0.7,
      searchDto.limit || 5,
    ]);

    return results.map((result: any) => ({
      id: result.id,
      content: result.content,
      chunkIndex: result.chunkIndex,
      similarity: parseFloat(result.similarity),
      document: {
        id: result.documentId,
        title: result.documentTitle,
        metadata: result.documentMetadata,
        sourceUrl: result.sourceUrl,
      },
    }));
  }

  /**
   * Get all documents for a user
   * @param userId User ID
   * @returns List of documents
   */
  async getDocuments(userId: string): Promise<Document[]> {
    return this.documentRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Get a specific document
   * @param userId User ID
   * @param documentId Document ID
   * @returns Document
   */
  async getDocument(userId: string, documentId: string): Promise<Document> {
    const document = await this.documentRepository.findOne({
      where: { id: documentId, userId },
    });

    if (!document) {
      throw new NotFoundException('Document not found');
    }

    return document;
  }

  /**
   * Delete a document
   * @param userId User ID
   * @param documentId Document ID
   */
  async deleteDocument(userId: string, documentId: string): Promise<void> {
    const document = await this.getDocument(userId, documentId);

    await this.documentRepository.remove(document);
  }

  /**
   * Get chunks for a document
   * @param userId User ID
   * @param documentId Document ID
   * @returns Document chunks
   */
  async getDocumentChunks(
    userId: string,
    documentId: string,
  ): Promise<DocumentChunk[]> {
    // Verify user owns the document
    await this.getDocument(userId, documentId);

    return this.chunkRepository.find({
      where: { documentId },
      order: { chunkIndex: 'ASC' },
    });
  }

  /**
   * Get statistics for user's knowledge base
   * @param userId User ID
   * @returns Statistics
   */
  async getStatistics(userId: string): Promise<{
    totalDocuments: number;
    totalChunks: number;
    totalSize: number;
  }> {
    const documents = await this.documentRepository.find({
      where: { userId },
    });

    const totalDocuments = documents.length;
    const totalSize = documents.reduce(
      (sum, doc) => sum + (doc.fileSize || 0),
      0,
    );

    const totalChunks = await this.chunkRepository.count({
      where: {
        documentId: documents.length > 0 ? undefined : 'none',
      },
    });

    return {
      totalDocuments,
      totalChunks,
      totalSize,
    };
  }
}
