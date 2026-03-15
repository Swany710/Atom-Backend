import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * ChatMemory — stores the rolling conversation history for each session.
 *
 * Schema notes:
 *   - UUID primary key (matches the migration DDL — do NOT change to serial/number)
 *   - Explicit table name 'chat_memory' so TypeORM never auto-derives a different name
 *   - sessionId is indexed for fast per-session queries
 */
@Entity('chat_memory')
export class ChatMemory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column()
  sessionId: string;

  @Column({ type: 'text' })
  role: string; // 'user' | 'assistant'

  @Column({ type: 'text' })
  content: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
