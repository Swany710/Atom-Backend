import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * Beta-user account.
 *
 * Lightweight — no roles, no orgs, no RBAC yet.
 * Each user owns their own email connections, conversations, and calendar tokens.
 *
 * Authentication flow:
 *   POST /auth/register  → hashed password stored, JWT returned
 *   POST /auth/login     → password verified, JWT returned
 *   All subsequent requests → JWT Bearer token → guard reads sub → sets req.atomUserId
 */
@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ unique: true, length: 255 })
  email: string;

  /** bcryptjs hash — never returned to the client */
  @Column({ name: 'password_hash', type: 'text' })
  passwordHash: string;

  /** Optional display name */
  @Column({ nullable: true, length: 100 })
  displayName?: string;

  /** Whether this account has been verified (email link, manual flip, etc.) */
  @Column({ default: false })
  isVerified: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
