import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export type UserRole = 'owner' | 'admin' | 'member';

/**
 * User account.
 *
 * Each user belongs to exactly one organization (the tenant boundary — see
 * TENANCY-DESIGN.md). orgId is nullable only during the tenancy rollout;
 * migration 008 backfills it and 009 makes it NOT NULL.
 *
 * Roles:
 *   owner  — billing, delete org, manage integrations, invite/remove users
 *   admin  — manage integrations, invite users, manage org KB
 *   member — use the assistant; owns only their own connections/conversations
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

  /** Tenant this user belongs to (nullable until migration 009 tightens) */
  @Index()
  @Column({ type: 'uuid', nullable: true })
  orgId?: string;

  /** Role within the org */
  @Column({ length: 20, default: 'member' })
  role: UserRole;

  /**
   * AccuLynx user this Atom account maps to (see CRM-ACCESS-POLICY.md).
   * Set ONLY by org owner/admin — never self-service (anti-spoofing).
   * NULL = no CRM job scoping possible; members get no CRM access.
   */
  @Column({ type: 'uuid', nullable: true })
  acculynxUserId?: string;

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
