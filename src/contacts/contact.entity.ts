import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * Where a contact came from. Kept so an imported record can always be traced
 * back to the mailbox it came out of, and so a re-import can recognise its own
 * earlier work instead of creating a duplicate.
 */
export type ContactSource = 'manual' | 'google' | 'outlook';

/**
 * Contact — Atom's own address book.
 *
 * Deliberately SEPARATE from AccuLynx contacts. AccuLynx contacts belong to
 * jobs and are governed by the CRM access policy; these are the operator's
 * own people (suppliers, subs, adjusters, referrals) and are org-scoped.
 *
 * Phone and address are free-text on purpose. AccuLynx requires exactly ten
 * digits for a phone and internal numeric IDs for state/country, which is fine
 * for a CRM record but hostile to "just save this number". Normalisation
 * happens on the way OUT to AccuLynx, not on the way in here.
 */
@Entity('contacts')
@Index(['orgId', 'lastName'])
@Index(['userId', 'createdAt'])
export class Contact {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Who created it. */
  @Column()
  userId: string;

  /** Tenant scope — contacts are visible to the whole org, not just the creator. */
  @Index()
  @Column({ type: 'uuid', nullable: true })
  orgId?: string;

  @Column({ length: 120, nullable: true })
  firstName?: string;

  @Column({ length: 120, nullable: true })
  lastName?: string;

  @Column({ length: 200, nullable: true })
  companyName?: string;

  /** Free-text role/label — "adjuster", "supplier", "sub", whatever fits. */
  @Column({ length: 120, nullable: true })
  title?: string;

  @Column({ length: 320, nullable: true })
  email?: string;

  @Column({ length: 60, nullable: true })
  phone?: string;

  @Column({ length: 200, nullable: true })
  street1?: string;

  @Column({ length: 200, nullable: true })
  street2?: string;

  @Column({ length: 120, nullable: true })
  city?: string;

  @Column({ length: 60, nullable: true })
  state?: string;

  @Column({ length: 20, nullable: true })
  zip?: string;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @Column({ type: 'varchar', length: 20, default: 'manual' })
  source: ContactSource;

  /**
   * The provider's own ID for this contact (People API resourceName, Graph id).
   * Lets a repeat import update rather than duplicate. Null for manual entries.
   */
  @Index()
  @Column({ type: 'varchar', length: 200, nullable: true })
  externalId?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  /** "Jane Smith" / "Acme Roofing" / "Unnamed contact" — never blank. */
  get displayName(): string {
    const name = [this.firstName, this.lastName].filter(Boolean).join(' ').trim();
    return name || this.companyName || 'Unnamed contact';
  }
}
