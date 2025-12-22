import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  Index,
} from 'typeorm';
import { Document } from './document.entity';

/**
 * Document Chunk Entity
 * Represents a chunk of a document with its embedding for vector search
 */
@Entity('document_chunks')
export class DocumentChunk {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('text')
  content: string;

  @Column({ type: 'int' })
  chunkIndex: number;

  @Column({ type: 'int' })
  startPosition: number;

  @Column({ type: 'int' })
  endPosition: number;

  /**
   * Vector embedding for semantic search
   * Using pgvector extension: vector(1536) for OpenAI text-embedding-3-small
   */
  @Column({
    type: 'vector',
    length: 1536,
    nullable: true,
  })
  @Index('document_chunks_embedding_idx', { synchronize: false })
  embedding: number[];

  @ManyToOne(() => Document, { onDelete: 'CASCADE' })
  @Index()
  document: Document;

  @Column()
  documentId: string;

  @CreateDateColumn()
  createdAt: Date;
}
