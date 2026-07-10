import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * Single-use registration invite code.
 * status: 'active' → usable once | 'used' → consumed | 'revoked' → admin-cancelled
 */
@Entity('invite_codes')
export class InviteCode {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ length: 64 })
  code: string;

  /** Free-text label, e.g. who the invite is for */
  @Column({ length: 200, nullable: true })
  label: string;

  @Column({ length: 20, default: 'active' })
  status: 'active' | 'used' | 'revoked';

  @Column({ nullable: true })
  usedByUserId: string;

  @Column({ nullable: true })
  usedByEmail: string;

  @Column({ type: 'timestamptz', nullable: true })
  usedAt: Date;

  @CreateDateColumn()
  createdAt: Date;
}
