import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IntegrationCredential } from '../../organizations/integration-credential.entity';
import { TenantContextService } from '../../organizations/tenant-context.service';
import { decryptToken, encryptToken } from '../../crypto.util';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const axios = require('axios').default ?? require('axios');

// ── Shape of AccuLynx API responses ────────────────────────────────────────

export interface AccuLynxJob {
  jobId:        string;
  jobName:      string;
  status?:      string;
  milestone?:   string;
  address?:     string;
  city?:        string;
  state?:       string;
  zip?:         string;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  assignedTo?:  string;
  createdDate?: string;
  updatedDate?: string;
  tradeType?:   string;
  notes?:       string;
}

export interface AccuLynxContact {
  contactId:    string;
  firstName:    string;
  lastName:     string;
  email?:       string;
  phone?:       string;
  address?:     string;
  city?:        string;
  state?:       string;
  zip?:         string;
}

export interface AccuLynxUser {
  id:        string;
  firstName: string;
  lastName:  string;
  email?:    string;
  role?:     string;
}

export interface CrmResult<T = any> {
  success: boolean;
  data?:   T;
  total?:  number;
  message?: string;
  error?:   string;
}

export interface JobSettings {
  tradeTypes:    Array<{ id: string; name: string }>;
  workTypes:     Array<{ id: number; name: string }>;
  jobCategories: Array<{ id: number; name: string }>;
  leadSources:   Array<{ id: string; name: string }>;
  priorities:    string[];
}

interface OrgClientCacheEntry {
  client: any | null;
  at: number;
}

/**
 * AccuLynxService — per-org CRM access (TENANCY-DESIGN §3 / CRM-ACCESS-POLICY.md).
 *
 * Credentials resolve per-request from `integration_credentials`
 * (provider 'acculynx', encrypted JSON {"apiKey": "..."}), cached in memory
 * per org with a short TTL. The ACCULYNX_API_KEY env var remains as a
 * transition fallback (your own org) and is used when an org has no stored
 * credential — delete the env var once per-org keys are rolled out.
 */
@Injectable()
export class AccuLynxService {
  private readonly logger = new Logger(AccuLynxService.name);
  private readonly baseUrl = 'https://api.acculynx.com/api/v2';

  /** orgId (or '__env__') → axios client */
  private readonly clientCache = new Map<string, OrgClientCacheEntry>();
  /** orgId (or '__env__') → contactTypeIds */
  private readonly contactTypeCache = new Map<string, string[]>();
  private static readonly CLIENT_TTL_MS = 5 * 60_000;

  constructor(
    private readonly config: ConfigService,
    private readonly tenantContext: TenantContextService,
    @InjectRepository(IntegrationCredential)
    private readonly credRepo: Repository<IntegrationCredential>,
  ) {}

  // ── Client resolution ─────────────────────────────────────────────────────

  private buildClient(apiKey: string): any {
    return axios.create({
      baseURL: this.baseUrl,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      timeout: 15_000,
    });
  }

  /** Resolve the axios client for the current org (null = not connected). */
  private async getClient(): Promise<{ client: any | null; cacheKey: string }> {
    const orgId = this.tenantContext.get()?.orgId;
    const cacheKey = orgId ?? '__env__';

    const hit = this.clientCache.get(cacheKey);
    if (hit && Date.now() - hit.at < AccuLynxService.CLIENT_TTL_MS) {
      return { client: hit.client, cacheKey };
    }

    let apiKey: string | undefined;

    if (orgId) {
      try {
        const cred = await this.credRepo.findOne({
          where: { orgId, provider: 'acculynx', isActive: true },
        });
        if (cred) {
          const parsed = JSON.parse(decryptToken(cred.credentials));
          apiKey = parsed?.apiKey;
        }
      } catch (err: any) {
        this.logger.error(`AccuLynx credential decrypt failed for org ${orgId}: ${err.message}`);
      }
    }

    // Transition fallback: global env key (your own org / pre-tenancy)
    if (!apiKey) {
      apiKey = this.config.get<string>('ACCULYNX_API_KEY');
    }

    const client = apiKey ? this.buildClient(apiKey) : null;
    this.clientCache.set(cacheKey, { client, at: Date.now() });
    if (!client) {
      this.logger.warn(`AccuLynx not configured for org ${orgId ?? '(none)'} — CRM disabled`);
    }
    return { client, cacheKey };
  }

  /** Drop cached client/contact-types for an org (call after credential change). */
  invalidateOrg(orgId: string): void {
    this.clientCache.delete(orgId);
    this.contactTypeCache.delete(orgId);
  }

  /**
   * Store (or replace) the current org's AccuLynx API key.
   * Validates the key against the live API before saving; stored encrypted.
   * Caller authorization (owner/admin) is enforced at the controller.
   */
  async setOrgApiKey(apiKey: string): Promise<CrmResult> {
    const orgId = this.tenantContext.get()?.orgId;
    if (!orgId) {
      return { success: false, error: 'No organization context — cannot store credentials.' };
    }
    if (!apiKey?.trim()) {
      return { success: false, error: 'apiKey is required.' };
    }

    // Validate before saving — a bad key should fail loudly here, not later.
    try {
      const probe = this.buildClient(apiKey.trim());
      await probe.get('/jobs', { params: { pageSize: 1, pageStartIndex: 0 } });
    } catch (err: any) {
      const status = err.response?.status;
      return {
        success: false,
        error: status === 401
          ? 'AccuLynx rejected that API key (401). Check the key at my.acculynx.com/apikeys.'
          : `Could not validate the key against AccuLynx: ${err.message}`,
      };
    }

    const encrypted = encryptToken(JSON.stringify({ apiKey: apiKey.trim() }));
    const existing = await this.credRepo.findOne({
      where: { orgId, provider: 'acculynx' },
    });
    if (existing) {
      existing.credentials = encrypted;
      existing.isActive = true;
      await this.credRepo.save(existing);
    } else {
      await this.credRepo.save(
        this.credRepo.create({ orgId, provider: 'acculynx', credentials: encrypted, isActive: true }),
      );
    }
    this.invalidateOrg(orgId);
    this.logger.log(`AccuLynx credentials updated for org ${orgId}`);
    return { success: true, message: 'AccuLynx connected for your organization.' };
  }

  private notConfigured(): CrmResult {
    return {
      success: false,
      error: 'AccuLynx is not connected. An org owner/admin must add the AccuLynx API key in Settings → Integrations.',
    };
  }

  // ── Map raw AccuLynx job → clean shape ──────────────────────────────────
  private mapJob(j: any): AccuLynxJob {
    return {
      jobId:         String(j.jobId ?? j.id ?? ''),
      jobName:       j.name ?? j.jobName ?? j.title ?? 'Unnamed Job',
      status:        j.status ?? j.jobStatus,
      milestone:     j.milestone ?? j.currentMilestone,
      // AccuLynx v2 returns the job address as locationAddress{street1,...}
      address:       j.locationAddress?.street1 ?? j.address?.line1 ?? j.streetAddress ?? j.address,
      city:          j.locationAddress?.city  ?? j.address?.city  ?? j.city,
      state:         j.locationAddress?.state?.abbreviation ?? j.locationAddress?.state ?? j.address?.state ?? j.state,
      zip:           j.locationAddress?.zipCode ?? j.address?.zip ?? j.postalCode,
      contactName:   j.contact ? `${j.contact.firstName ?? ''} ${j.contact.lastName ?? ''}`.trim() : undefined,
      contactPhone:  j.contact?.phone ?? j.primaryPhone,
      contactEmail:  j.contact?.email ?? j.primaryEmail,
      assignedTo:    j.assignedTo?.name ?? j.assignedRep,
      createdDate:   j.createdDate ?? j.dateCreated,
      updatedDate:   j.modifiedDate ?? j.dateModified,
      tradeType:     j.tradeType ?? j.jobType,
    };
  }

  private mapContact(c: any): AccuLynxContact {
    return {
      contactId: String(c.contactId ?? c.id ?? ''),
      firstName: c.firstName ?? '',
      lastName:  c.lastName  ?? '',
      email:     c.email     ?? c.primaryEmail,
      phone:     c.phone     ?? c.primaryPhone,
      // AccuLynx v2 contacts carry mailingAddress{street1,...}
      address:   c.mailingAddress?.street1 ?? c.address?.line1 ?? c.streetAddress,
      city:      c.mailingAddress?.city  ?? c.address?.city  ?? c.city,
      state:     c.mailingAddress?.state?.abbreviation ?? c.address?.state ?? c.state,
      zip:       c.mailingAddress?.zipCode ?? c.address?.zip ?? c.postalCode,
    };
  }

  // ── Jobs ─────────────────────────────────────────────────────────────────

  async getJobs(params?: {
    page?: number;
    pageSize?: number;
    status?: string;
    search?: string;
  }): Promise<CrmResult<AccuLynxJob[]>> {
    const { client } = await this.getClient();
    if (!client) return this.notConfigured();
    try {
      // AccuLynx v2 paginates with pageSize + pageStartIndex (record offset),
      // not page numbers, and filters by `milestones`, not `status`.
      const page     = params?.page ?? 1;
      const pageSize = params?.pageSize ?? 25;
      const p: any = { pageSize, pageStartIndex: (page - 1) * pageSize };
      if (params?.status) p.milestones = params.status;

      let jobs: any[] = [];
      let total = 0;

      if (params?.search) {
        // POST /jobs/search — pageSize capped at 25 by the API
        const res = await client.post(
          `/jobs/search?pageSize=${Math.min(pageSize, 25)}&includes=contact`,
          { searchTerm: params.search },
        );
        jobs  = res.data?.items ?? res.data?.jobs ?? res.data ?? [];
        total = res.data?.count ?? res.data?.total ?? jobs.length;
      } else {
        p.includes = 'contact';
        const res = await client.get('/jobs', { params: p });
        jobs  = res.data?.items ?? res.data?.jobs ?? res.data ?? [];
        total = res.data?.count ?? res.data?.total ?? res.data?.totalCount ?? jobs.length;
      }

      return { success: true, data: jobs.map(j => this.mapJob(j)), total };
    } catch (err: any) {
      this.logger.error('getJobs error:', err.response?.data ?? err.message);
      return { success: false, error: err.response?.data?.message ?? err.message };
    }
  }

  async getJob(jobId: string): Promise<CrmResult<AccuLynxJob>> {
    const { client } = await this.getClient();
    if (!client) return this.notConfigured();
    try {
      const res = await client.get(`/jobs/${jobId}`);
      return { success: true, data: this.mapJob(res.data) };
    } catch (err: any) {
      this.logger.error('getJob error:', err.message);
      return { success: false, error: err.response?.data?.message ?? err.message };
    }
  }

  /** jobId → {ids, at} — 60s cache so list filtering doesn't hammer AccuLynx.
   *  Short TTL on purpose: rep assignment is an authz input (CRM-ACCESS-POLICY). */
  private readonly repCache = new Map<string, { ids: string[]; at: number }>();
  private static readonly REP_TTL_MS = 60_000;

  /**
   * AccuLynx user IDs assigned as reps on a job (CRM-ACCESS-POLICY.md).
   * IMPORTANT: unassigned jobs return HTTP 404 from this endpoint (verified
   * live 2026-07-19) — that means "no reps", not an error.
   */
  async getJobRepresentativeIds(jobId: string): Promise<CrmResult<string[]>> {
    const { client, cacheKey } = await this.getClient();
    if (!client) return this.notConfigured();

    const key = `${cacheKey}:${jobId}`;
    const hit = this.repCache.get(key);
    if (hit && Date.now() - hit.at < AccuLynxService.REP_TTL_MS) {
      return { success: true, data: hit.ids };
    }

    try {
      const res = await client.get(`/jobs/${jobId}/representatives`);
      const items: any[] = res.data?.items ?? [];
      const ids = items.map(r => r?.user?.id).filter(Boolean);
      this.repCache.set(key, { ids, at: Date.now() });
      return { success: true, data: ids };
    } catch (err: any) {
      if (err.response?.status === 404) {
        this.repCache.set(key, { ids: [], at: Date.now() });
        return { success: true, data: [] }; // unassigned job
      }
      this.logger.error('getJobRepresentativeIds error:', err.message);
      return { success: false, error: err.response?.data?.message ?? err.message };
    }
  }

  /** Assign (or reassign) the company rep on a job. */
  async assignCompanyRep(jobId: string, acculynxUserId: string): Promise<CrmResult> {
    const { client } = await this.getClient();
    if (!client) return this.notConfigured();
    try {
      await client.post(`/jobs/${jobId}/representatives/company`, { id: acculynxUserId });
      return { success: true, message: 'Company representative assigned.' };
    } catch (err: any) {
      this.logger.error('assignCompanyRep error:', err.response?.data ?? err.message);
      return { success: false, error: err.response?.data?.title ?? err.response?.data?.message ?? err.message };
    }
  }

  /** Company user roster — for the admin mapping dropdown. */
  async listCompanyUsers(): Promise<CrmResult<AccuLynxUser[]>> {
    const { client } = await this.getClient();
    if (!client) return this.notConfigured();
    try {
      const users: AccuLynxUser[] = [];
      let start = 0;
      const pageSize = 25;
      // paginate defensively (companies are small; hard cap of 500)
      for (let i = 0; i < 20; i++) {
        const res = await client.get('/users', {
          params: { pageSize, pageStartIndex: start },
        });
        const items: any[] = res.data?.items ?? [];
        users.push(
          ...items.map(u => ({
            id:        u.id,
            firstName: u.firstName ?? '',
            lastName:  u.lastName ?? '',
            email:     u.emailAddress ?? u.email ?? undefined,
            role:      u.role?.name ?? undefined,
          })),
        );
        start += pageSize;
        if (items.length < pageSize || start >= (res.data?.count ?? 0)) break;
      }
      return { success: true, data: users, total: users.length };
    } catch (err: any) {
      this.logger.error('listCompanyUsers error:', err.message);
      return { success: false, error: err.response?.data?.message ?? err.message };
    }
  }

  async addNote(jobId: string, note: string, authorName?: string): Promise<CrmResult> {
    const { client } = await this.getClient();
    if (!client) return this.notConfigured();
    try {
      // AccuLynx v2: POST /jobs/{jobId}/messages { message } — created as a
      // job comment. The API does not accept an author field, so we prefix it.
      const message = authorName ? `[${authorName}] ${note}` : `[Atom AI] ${note}`;
      const res = await client.post(`/jobs/${jobId}/messages`, { message });
      return { success: true, data: res.data, message: 'Note added successfully' };
    } catch (err: any) {
      this.logger.error('addNote error:', err.response?.data ?? err.message);
      return { success: false, error: err.response?.data?.title ?? err.response?.data?.message ?? err.message };
    }
  }

  // ── Contacts ─────────────────────────────────────────────────────────────

  async getContacts(params?: {
    page?: number;
    pageSize?: number;
    search?: string;
  }): Promise<CrmResult<AccuLynxContact[]>> {
    const { client } = await this.getClient();
    if (!client) return this.notConfigured();
    try {
      const page     = params?.page ?? 1;
      const pageSize = Math.min(params?.pageSize ?? 25, 25); // API caps at 25
      const pageStartIndex = (page - 1) * pageSize;

      let res: any;
      if (params?.search) {
        // AccuLynx v2 contact search is POST /contacts/search and REQUIRES
        // sort + startDate + endDate. GET /contacts has no searchTerm filter.
        res = await client.post(
          `/contacts/search?pageSize=${pageSize}&pageStartIndex=${pageStartIndex}`,
          {
            searchTerm: params.search,
            startDate:  '2000-01-01T00:00:00Z',
            endDate:    new Date().toISOString(),
            sort: { sortDirection: 'Descending', sortColumn: 'CreatedDate' },
          },
        );
      } else {
        res = await client.get('/contacts', {
          params: { pageSize, pageStartIndex, includes: 'emailAddress,phoneNumber' },
        });
      }
      const contacts: any[] = res.data?.items ?? res.data?.contacts ?? res.data ?? [];
      const total = res.data?.count ?? res.data?.total ?? res.data?.totalCount ?? contacts.length;
      return { success: true, data: contacts.map(c => this.mapContact(c)), total };
    } catch (err: any) {
      this.logger.error('getContacts error:', err.message);
      return { success: false, error: err.response?.data?.message ?? err.message };
    }
  }

  // ── Company job settings (lookups for full job creation) ─────────────────

  /** cacheKey → settings; 10 min TTL (company settings rarely change) */
  private readonly settingsCache = new Map<string, { data: JobSettings; at: number }>();
  private static readonly SETTINGS_TTL_MS = 10 * 60_000;

  /**
   * Company lookup lists needed to create a fully-specified job:
   * trade types (uuid), work types (int), job categories (int),
   * lead sources (uuid, may have children). Verified live 2026-07-20.
   */
  async getJobSettings(): Promise<CrmResult<JobSettings>> {
    const { client, cacheKey } = await this.getClient();
    if (!client) return this.notConfigured();

    const hit = this.settingsCache.get(cacheKey);
    if (hit && Date.now() - hit.at < AccuLynxService.SETTINGS_TTL_MS) {
      return { success: true, data: hit.data };
    }

    try {
      const [trades, works, cats, sources] = await Promise.all([
        client.get('/company-settings/job-file-settings/trade-types', { params: { pageSize: 100 } }),
        client.get('/company-settings/job-file-settings/work-types',  { params: { pageSize: 100 } }),
        client.get('/company-settings/job-file-settings/job-categories', { params: { pageSize: 100 } }),
        client.get('/company-settings/leads/lead-sources', { params: { pageSize: 100 } }),
      ]);

      // Flatten lead-source children into selectable entries ("Parent — Child")
      const leadSources: Array<{ id: string; name: string }> = [];
      for (const s of sources.data?.items ?? []) {
        leadSources.push({ id: s.id, name: s.name });
        for (const c of s.children ?? []) {
          leadSources.push({ id: c.id, name: `${s.name} — ${c.name}` });
        }
      }

      const data: JobSettings = {
        tradeTypes:    (trades.data?.items ?? []).map((t: any) => ({ id: t.id ?? t.tradeId, name: t.name })),
        workTypes:     (works.data?.items ?? []).map((w: any) => ({ id: w.id, name: w.name })),
        jobCategories: (cats.data?.items ?? []).map((c: any) => ({ id: c.id ?? c.categoryId, name: c.name })),
        leadSources,
        priorities: ['Normal', 'High', 'Urgent'],
      };
      this.settingsCache.set(cacheKey, { data, at: Date.now() });
      return { success: true, data };
    } catch (err: any) {
      this.logger.error('getJobSettings error:', err.message);
      return { success: false, error: err.response?.data?.message ?? err.message };
    }
  }

  /** Case-insensitive name→entry lookup ("roofing" matches "Roofing"). */
  private resolveByName<T extends { id: any; name: string }>(
    list: T[],
    name?: string,
  ): T | undefined {
    if (!name?.trim()) return undefined;
    const n = name.trim().toLowerCase();
    return (
      list.find(e => e.name.toLowerCase() === n) ??
      list.find(e => e.name.toLowerCase().includes(n))
    );
  }

  // ── Contact types (required for POST /contacts) ──────────────────────────

  private async getDefaultContactTypeIds(client: any, cacheKey: string): Promise<string[]> {
    const cached = this.contactTypeCache.get(cacheKey);
    if (cached) return cached;
    const res = await client.get('/contacts/contact-types');
    const items: any[] = res.data?.items ?? [];
    // Prefer the "Customer" type; fall back to any default, then to the first.
    const preferred =
      items.find(t => (t.name ?? '').toLowerCase() === 'customer') ??
      items.find(t => t.isDefault) ??
      items[0];
    const ids = preferred ? [preferred.id] : [];
    this.contactTypeCache.set(cacheKey, ids);
    return ids;
  }

  // ── Create a lead ─────────────────────────────────────────────────────────

  async createLead(lead: {
    firstName:  string;
    lastName:   string;
    email?:     string;
    phone?:     string;
    address?:   string;
    city?:      string;
    state?:     string;
    zip?:       string;
    source?:    string;
    notes?:     string;
    /** Full-job fields — NAMES, resolved to AccuLynx ids via getJobSettings() */
    priority?:    string;   // Normal | High | Urgent
    jobCategory?: string;   // e.g. Residential, Commercial
    workType?:    string;   // e.g. Insurance, Repair, New
    tradeTypes?:  string[]; // e.g. ["Roofing", "Siding"]
    leadSource?:  string;   // company lead source name (matches "source" too)
    /** Auto-assign the new job to this AccuLynx user (creator's mapping) */
    assignToAcculynxUserId?: string;
  }): Promise<CrmResult> {
    const { client, cacheKey } = await this.getClient();
    if (!client) return this.notConfigured();
    try {
      // AccuLynx v2 has no /leads endpoint. The documented flow is:
      //   1. POST /contacts  → create the contact
      //   2. POST /jobs { contact: { id } } → creates a job in milestone
      //      "Lead (Unassigned)"
      //   3. (optional) POST /jobs/{id}/representatives/company → assign rep

      // ── 1. Create contact ────────────────────────────────────────────
      // contactTypeIds is REQUIRED by POST /contacts (verified live 2026-07-19:
      // "ContactTypeIds Must contain at least one item.")
      const contactTypeIds = await this.getDefaultContactTypeIds(client, cacheKey);
      if (contactTypeIds.length === 0) {
        return { success: false, error: 'No contact types configured in AccuLynx — cannot create contact.' };
      }
      const contactPayload: any = {
        firstName: lead.firstName,
        lastName:  lead.lastName,
        contactTypeIds,
      };

      const noteParts: string[] = [];
      if (lead.notes)  noteParts.push(lead.notes);
      noteParts.push(`Source: ${lead.source ?? 'Atom AI'}`);

      if (lead.email) {
        contactPayload.emailAddresses = [
          { address: lead.email, primary: true, type: 'Personal' },
        ];
      }
      if (lead.phone) {
        // API requires exactly 10 digits; otherwise stash it in the note
        const digits = lead.phone.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
        if (/^\d{10}$/.test(digits)) {
          contactPayload.phoneNumbers = [
            { number: digits, primary: true, type: 'Mobile' },
          ];
        } else {
          noteParts.push(`Phone (unparsed): ${lead.phone}`);
        }
      }
      if (lead.address) {
        contactPayload.mailingAddress = {
          street1: lead.address,
          city:    lead.city,
          zipCode: lead.zip,
          // state/country require AccuLynx numeric IDs — omitted; the job's
          // locationAddress below carries the full address as strings.
        };
      }
      contactPayload.note = noteParts.join(' | ');

      const contactRes = await client.post('/contacts', contactPayload);
      const contactId  = contactRes.data?.id;
      if (!contactId) {
        return { success: false, error: 'Contact created but no id returned by AccuLynx.' };
      }

      // ── 2. Create job in milestone Lead ──────────────────────────────
      const jobPayload: any = {
        contact: { id: contactId },
        notes:   noteParts.join(' | ').slice(0, 1000),
      };
      // locationAddress requires street1+city+state+country+zipCode together
      if (lead.address && lead.city && lead.state && lead.zip) {
        jobPayload.locationAddress = {
          street1: lead.address,
          city:    lead.city,
          state:   lead.state,
          country: 'US',
          zipCode: lead.zip,
        };
      }

      // ── 2b. Full-job fields: resolve names → company-specific ids ────
      // Unresolvable names are noted, never fatal — the lead still lands.
      const unresolved: string[] = [];
      if (lead.priority || lead.jobCategory || lead.workType ||
          lead.tradeTypes?.length || lead.leadSource || lead.source) {
        const settings = await this.getJobSettings();
        if (settings.success && settings.data) {
          const s = settings.data;

          if (lead.priority) {
            const p = s.priorities.find(x => x.toLowerCase() === lead.priority!.trim().toLowerCase());
            if (p) jobPayload.priority = p;
            else unresolved.push(`priority "${lead.priority}"`);
          }
          if (lead.jobCategory) {
            const c = this.resolveByName(s.jobCategories, lead.jobCategory);
            if (c) jobPayload.jobCategory = { id: c.id };
            else unresolved.push(`job category "${lead.jobCategory}"`);
          }
          if (lead.workType) {
            const w = this.resolveByName(s.workTypes, lead.workType);
            if (w) jobPayload.workType = { id: w.id };
            else unresolved.push(`work type "${lead.workType}"`);
          }
          if (lead.tradeTypes?.length) {
            const resolved = lead.tradeTypes
              .map(name => {
                const t = this.resolveByName(s.tradeTypes, name);
                if (!t) unresolved.push(`trade type "${name}"`);
                return t;
              })
              .filter(Boolean) as Array<{ id: string }>;
            if (resolved.length) jobPayload.tradeTypes = resolved.map(t => ({ id: t.id }));
          }
          // leadSource: explicit field wins; fall back to matching `source`
          const sourceName = lead.leadSource ?? lead.source;
          if (sourceName) {
            const src = this.resolveByName(s.leadSources, sourceName);
            if (src) jobPayload.leadSource = { id: src.id };
            else if (lead.leadSource) unresolved.push(`lead source "${lead.leadSource}"`);
          }
        }
      }

      const jobRes = await client.post('/jobs', jobPayload);
      const jobId = jobRes.data?.id;

      // ── 3. Auto-assign the creator as company rep (best-effort) ──────
      let assigned = false;
      if (jobId && lead.assignToAcculynxUserId) {
        try {
          await client.post(`/jobs/${jobId}/representatives/company`, {
            id: lead.assignToAcculynxUserId,
          });
          assigned = true;
        } catch (assignErr: any) {
          this.logger.warn(
            `Lead ${jobId} created but rep auto-assign failed: ${assignErr.response?.data?.title ?? assignErr.message}`,
          );
        }
      }

      const unresolvedNote = unresolved.length
        ? ` Note: could not match ${unresolved.join(', ')} to this company's AccuLynx settings — set manually if needed.`
        : '';
      return {
        success: true,
        data: { contactId, jobId, job: jobRes.data, assigned },
        message: (assigned
          ? 'Lead created and assigned to you (contact + job in Lead milestone).'
          : 'Lead created successfully (contact + job in Lead milestone).') + unresolvedNote,
      };
    } catch (err: any) {
      this.logger.error('createLead error:', err.response?.data ?? err.message);
      return { success: false, error: err.response?.data?.title ?? err.response?.data?.message ?? err.message };
    }
  }

  // ── Connection status ──────────────────────────────────────────────────────

  async getStatus(): Promise<{ connected: boolean; message?: string }> {
    const { client } = await this.getClient();
    if (!client) return { connected: false, message: 'AccuLynx API key not configured for this organization' };
    try {
      // Light probe — fetch 1 job to verify the key works
      await client.get('/jobs', { params: { pageSize: 1, pageStartIndex: 0 } });
      return { connected: true };
    } catch (err: any) {
      const status = err.response?.status;
      return {
        connected: false,
        message: status === 401 ? 'Invalid API key' : err.message,
      };
    }
  }
}
