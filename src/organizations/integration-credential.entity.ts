import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * IntegrationCredential — org-level API credentials for third-party services.
 *
 * Replaces global env-var credentials (e.g. ACCULYNX_API_KEY) so each customer
 * org connects its OWN accounts. The `credentials` column stores an
 * encrypted JSON blob (via crypto.util AES-256-GCM) — shape depends on the
 * provider, e.g. for AccuLynx: { "apiKey": "..." }.
 *
 * NEVER store plaintext credentials here. Encrypt before save, decrypt on read.
 * Services should cache decrypted credentials in memory keyed by orgId with a
 * short TTL rather than hitting this table on every request.
 */
@Entity('integration_credentials')
@Index(['orgId', 'provider'], { unique: true })
export class IntegrationCredential {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  orgId: string;

  /** Provider key: 'acculynx' (more later) */
  @Column({ length: 50 })
  provider: string;

  /** Encrypted JSON blob — see crypto.util */
  @Column({ type: 'text' })
  credentials: string;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
