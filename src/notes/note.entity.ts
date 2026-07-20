import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('notes')
@Index(['userId', 'createdAt'])
export class Note {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  /** Tenant scope (nullable until tenancy migration 009 tightens) */
  @Index()
  @Column({ type: 'uuid', nullable: true })
  orgId?: string;

  @Column({ length: 300, nullable: true })
  title: string;

  @Column({ type: 'text' })
  content: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
