import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export type OrgPlan = 'beta' | 'starter' | 'pro';

/**
 * Organization — the tenant boundary for Atom.
 *
 * Every customer company gets exactly one organization. Users belong to
 * exactly one org (users.orgId). All tenant-scoped data (email connections,
 * conversations, KB entries, notes, scheduled tasks, …) carries an orgId.
 *
 * Design notes (see TENANCY-DESIGN.md at repo root):
 *   - Single-org-per-user model. If multi-org membership is ever needed,
 *     users.orgId becomes the "default org" and a membership join table is
 *     added — no IDs change.
 *   - `slug` is reserved for future per-org subdomains; unique, URL-safe.
 *   - `plan` hangs billing off the org later (Stripe), not the user.
 */
@Entity('organizations')
export class Organization {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 255 })
  name: string;

  @Index({ unique: true })
  @Column({ length: 100, unique: true })
  slug: string;

  @Column({ length: 50, default: 'beta' })
  plan: OrgPlan;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
