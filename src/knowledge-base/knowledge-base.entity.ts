import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('knowledge_base_entries')
export class KnowledgeBaseEntry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ length: 500 })
  title: string;

  /** Full text content — up to ~100 KB */
  @Column({ type: 'text' })
  content: string;

  /** Where this entry came from: 'manual', 'upload', 'preloaded' */
  @Column({ length: 50, default: 'manual' })
  source: string;

  /** Optional category tag: 'company', 'product', 'sop', 'faq', etc. */
  @Column({ length: 100, nullable: true })
  category: string;

  /** Original filename if entry came from a file upload */
  @Column({ length: 255, nullable: true })
  fileName: string;

  /**
   * OpenAI text-embedding-3-small vector (1536 dims).
   * Stored as a raw float array; we do similarity queries via raw SQL.
   * TypeORM doesn't natively understand pgvector, so we declare it as
   * a simple varchar and the service handles serialisation.
   */
  @Column({ type: 'text', nullable: true, select: false })
  embedding: string;   // JSON-serialised number[]

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
