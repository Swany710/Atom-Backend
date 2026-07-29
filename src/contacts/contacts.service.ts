import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Brackets } from 'typeorm';
import { Contact, ContactSource } from './contact.entity';
import { OrgResolverService } from '../organizations/org-resolver.service';
import { TenantContextService } from '../organizations/tenant-context.service';

export interface ContactInput {
  firstName?:   string;
  lastName?:    string;
  companyName?: string;
  title?:       string;
  email?:       string;
  phone?:       string;
  street1?:     string;
  street2?:     string;
  city?:        string;
  state?:       string;
  zip?:         string;
  notes?:       string;
  source?:      ContactSource;
  externalId?:  string;
}

export interface ContactResult {
  success:   boolean;
  contact?:  Partial<Contact>;
  contacts?: Partial<Contact>[];
  total?:    number;
  message?:  string;
  error?:    string;
  /** Set when a create was refused because the person already exists. */
  duplicateOf?: Partial<Contact>;
}

/**
 * ContactsService — Atom's own address book.
 *
 * Org-scoped, not user-scoped: a contact added by one person is visible to the
 * whole company, which is the point of a shared address book. Notes are
 * per-user; contacts are not.
 *
 * Kept separate from AccuLynx contacts on purpose. Those belong to jobs and are
 * gated by the CRM access policy; these are the operator's own people.
 */
@Injectable()
export class ContactsService {
  private readonly logger = new Logger(ContactsService.name);

  constructor(
    @InjectRepository(Contact)
    private readonly repo: Repository<Contact>,
    private readonly orgResolver: OrgResolverService,
    private readonly tenantContext: TenantContextService,
  ) {}

  // ── Helpers ───────────────────────────────────────────────────────────────

  private sanitise(c: Contact): Partial<Contact> {
    return {
      id:          c.id,
      firstName:   c.firstName   ?? undefined,
      lastName:    c.lastName    ?? undefined,
      companyName: c.companyName ?? undefined,
      title:       c.title       ?? undefined,
      email:       c.email       ?? undefined,
      phone:       c.phone       ?? undefined,
      street1:     c.street1     ?? undefined,
      street2:     c.street2     ?? undefined,
      city:        c.city        ?? undefined,
      state:       c.state       ?? undefined,
      zip:         c.zip         ?? undefined,
      notes:       c.notes       ?? undefined,
      source:      c.source,
      createdAt:   c.createdAt,
      updatedAt:   c.updatedAt,
      // Not a column — computed, but callers (and the UI) want it.
      ...({ displayName: c.displayName } as any),
    };
  }

  /** Digits only, so "(555) 123-4567" and "555-123-4567" compare equal. */
  private static phoneKey(phone?: string): string | undefined {
    const d = phone?.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
    return d && d.length >= 7 ? d : undefined;
  }

  private trimAll(input: ContactInput): ContactInput {
    const out: any = {};
    for (const [k, v] of Object.entries(input)) {
      out[k] = typeof v === 'string' ? v.trim() || undefined : v;
    }
    return out;
  }

  /**
   * Org for the current request, falling back to a DB lookup for the user.
   *
   * Uses get() rather than orgIdOrFail() — a missing org is normal in API-key
   * mode and for pre-tenancy accounts, and should degrade to user-scoping
   * rather than throwing.
   */
  private async currentOrgId(userId: string): Promise<string | undefined> {
    return this.tenantContext.get()?.orgId ?? await this.orgResolver.orgIdForUser(userId);
  }

  // ── Duplicate detection ───────────────────────────────────────────────────

  /**
   * Find an existing contact that is probably the same person.
   *
   * Matching, in order of confidence:
   *   1. same externalId (a re-import of the same provider record)
   *   2. same email
   *   3. same phone digits
   *   4. same first+last name
   *
   * This is what stops "import my contacts" turning the address book into a
   * pile of near-identical rows.
   */
  async findDuplicate(orgId: string | undefined, input: ContactInput): Promise<Contact | null> {
    const qb = this.repo.createQueryBuilder('c');
    qb.where(orgId ? 'c.orgId = :orgId' : 'c.orgId IS NULL', { orgId });

    const email    = input.email?.toLowerCase();
    const phoneKey = ContactsService.phoneKey(input.phone);
    const first    = input.firstName?.toLowerCase();
    const last     = input.lastName?.toLowerCase();

    qb.andWhere(new Brackets(w => {
      let any = false;
      if (input.externalId) { w.orWhere('c.externalId = :ext', { ext: input.externalId }); any = true; }
      if (email)            { w.orWhere('LOWER(c.email) = :email', { email }); any = true; }
      if (phoneKey) {
        // Compare digits-only on both sides.
        w.orWhere(
          `regexp_replace(COALESCE(c.phone,''), '\\D', '', 'g') LIKE :pk`,
          { pk: `%${phoneKey}` },
        );
        any = true;
      }
      if (first && last) {
        w.orWhere('(LOWER(c.firstName) = :first AND LOWER(c.lastName) = :last)', { first, last });
        any = true;
      }
      if (!any) w.orWhere('1 = 0');   // nothing identifying → no match
    }));

    return qb.getOne();
  }

  // ── CRUD ──────────────────────────────────────────────────────────────────

  async create(userId: string, input: ContactInput, opts?: { allowDuplicate?: boolean }): Promise<ContactResult> {
    try {
      const data = this.trimAll(input);

      if (!data.firstName && !data.lastName && !data.companyName) {
        return { success: false, error: 'A contact needs at least a first name, last name, or company name.' };
      }
      if (data.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(data.email)) {
        return { success: false, error: `"${data.email}" does not look like an email address.` };
      }

      const orgId = await this.currentOrgId(userId);

      if (!opts?.allowDuplicate) {
        const dup = await this.findDuplicate(orgId, data);
        if (dup) {
          return {
            success: false,
            error: `${dup.displayName} is already in your contacts.`,
            duplicateOf: this.sanitise(dup),
          };
        }
      }

      const saved = await this.repo.save(this.repo.create({
        ...data,
        userId,
        orgId,
        source: data.source ?? 'manual',
      }));

      this.logger.log(`Contact created (${saved.source}) for org ${orgId ?? 'none'}: ${saved.id}`);
      return { success: true, contact: this.sanitise(saved), message: `${saved.displayName} added to contacts.` };
    } catch (err: any) {
      this.logger.error('create contact error:', err.message);
      return { success: false, error: err.message };
    }
  }

  async list(userId: string, params?: { search?: string; limit?: number }): Promise<ContactResult> {
    try {
      const orgId = await this.currentOrgId(userId);
      const limit = Math.min(Math.max(params?.limit ?? 100, 1), 500);

      const qb = this.repo.createQueryBuilder('c');
      qb.where(orgId ? 'c.orgId = :orgId' : 'c.userId = :userId', { orgId, userId });

      const search = params?.search?.trim();
      if (search) {
        qb.andWhere(new Brackets(w => {
          const q = `%${search.toLowerCase()}%`;
          w.where('LOWER(c.firstName) LIKE :q', { q })
           .orWhere('LOWER(c.lastName) LIKE :q', { q })
           .orWhere('LOWER(c.companyName) LIKE :q', { q })
           .orWhere('LOWER(c.email) LIKE :q', { q })
           .orWhere('LOWER(c.city) LIKE :q', { q })
           .orWhere(`regexp_replace(COALESCE(c.phone,''), '\\D', '', 'g') LIKE :pq`,
                    { pq: `%${search.replace(/\D/g, '')}%` });
        }));
      }

      qb.orderBy('c.lastName', 'ASC').addOrderBy('c.firstName', 'ASC').take(limit);

      const [rows, total] = await qb.getManyAndCount();
      return { success: true, contacts: rows.map(r => this.sanitise(r)), total };
    } catch (err: any) {
      this.logger.error('list contacts error:', err.message);
      return { success: false, error: err.message };
    }
  }

  async get(userId: string, id: string): Promise<ContactResult> {
    const orgId = await this.currentOrgId(userId);
    const found = await this.repo.findOne({ where: { id } });
    if (!found || (orgId ? found.orgId !== orgId : found.userId !== userId)) {
      return { success: false, error: 'Contact not found.' };
    }
    return { success: true, contact: this.sanitise(found) };
  }

  async update(userId: string, id: string, input: ContactInput): Promise<ContactResult> {
    try {
      const existing = await this.get(userId, id);
      if (!existing.success) return existing;

      const data = this.trimAll(input);
      if (data.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(data.email)) {
        return { success: false, error: `"${data.email}" does not look like an email address.` };
      }

      // Never let an update rewrite provenance.
      delete (data as any).source;
      delete (data as any).externalId;

      await this.repo.update({ id }, data as any);
      const saved = await this.repo.findOne({ where: { id } });
      return { success: true, contact: this.sanitise(saved!), message: 'Contact updated.' };
    } catch (err: any) {
      this.logger.error('update contact error:', err.message);
      return { success: false, error: err.message };
    }
  }

  async remove(userId: string, id: string): Promise<ContactResult> {
    const existing = await this.get(userId, id);
    if (!existing.success) return existing;
    await this.repo.delete({ id });
    return { success: true, message: 'Contact deleted.' };
  }
}
