import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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

export interface CrmResult<T = any> {
  success: boolean;
  data?:   T;
  total?:  number;
  message?: string;
  error?:   string;
}

@Injectable()
export class AccuLynxService {
  private readonly logger = new Logger(AccuLynxService.name);
  private readonly client: any = null;
  private readonly baseUrl = 'https://api.acculynx.com/api/v2';

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('ACCULYNX_API_KEY');
    if (apiKey) {
      this.client = axios.create({
        baseURL: this.baseUrl,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        timeout: 15_000,
      });
      this.logger.log('AccuLynx client initialised');
    } else {
      this.logger.warn('ACCULYNX_API_KEY not set — CRM features disabled');
    }
  }

  private notConfigured(): CrmResult {
    return {
      success: false,
      error: 'AccuLynx is not connected. Add ACCULYNX_API_KEY to your Railway environment variables.',
    };
  }

  // Contact creation requires contactTypeIds (company-specific UUIDs).
  // Cached for the life of the process — types rarely change.
  private contactTypeIdCache: string[] | null = null;

  private async getDefaultContactTypeIds(): Promise<string[]> {
    if (this.contactTypeIdCache) return this.contactTypeIdCache;
    const res = await this.client.get('/contacts/contact-types');
    const items: any[] = res.data?.items ?? [];
    // Prefer the "Customer" type; fall back to any default, then to the first.
    const preferred =
      items.find(t => (t.name ?? '').toLowerCase() === 'customer') ??
      items.find(t => t.isDefault) ??
      items[0];
    this.contactTypeIdCache = preferred ? [preferred.id] : [];
    return this.contactTypeIdCache;
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
    if (!this.client) return this.notConfigured();
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
        const res = await this.client.post(
          `/jobs/search?pageSize=${Math.min(pageSize, 25)}&includes=contact`,
          { searchTerm: params.search },
        );
        jobs  = res.data?.items ?? res.data?.jobs ?? res.data ?? [];
        total = res.data?.count ?? res.data?.total ?? jobs.length;
      } else {
        p.includes = 'contact';
        const res = await this.client.get('/jobs', { params: p });
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
    if (!this.client) return this.notConfigured();
    try {
      const res = await this.client.get(`/jobs/${jobId}`);
      return { success: true, data: this.mapJob(res.data) };
    } catch (err: any) {
      this.logger.error('getJob error:', err.message);
      return { success: false, error: err.response?.data?.message ?? err.message };
    }
  }

  async addNote(jobId: string, note: string, authorName?: string): Promise<CrmResult> {
    if (!this.client) return this.notConfigured();
    try {
      // AccuLynx v2: POST /jobs/{jobId}/messages { message } — created as a
      // job comment. The API does not accept an author field, so we prefix it.
      const message = authorName ? `[${authorName}] ${note}` : `[Atom AI] ${note}`;
      const res = await this.client.post(`/jobs/${jobId}/messages`, { message });
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
    if (!this.client) return this.notConfigured();
    try {
      const page     = params?.page ?? 1;
      const pageSize = Math.min(params?.pageSize ?? 25, 25); // API caps at 25
      const pageStartIndex = (page - 1) * pageSize;

      let res: any;
      if (params?.search) {
        // AccuLynx v2 contact search is POST /contacts/search and REQUIRES
        // sort + startDate + endDate. GET /contacts has no searchTerm filter.
        res = await this.client.post(
          `/contacts/search?pageSize=${pageSize}&pageStartIndex=${pageStartIndex}`,
          {
            searchTerm: params.search,
            startDate:  '2000-01-01T00:00:00Z',
            endDate:    new Date().toISOString(),
            sort: { sortDirection: 'Descending', sortColumn: 'CreatedDate' },
          },
        );
      } else {
        res = await this.client.get('/contacts', {
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
  }): Promise<CrmResult> {
    if (!this.client) return this.notConfigured();
    try {
      // AccuLynx v2 has no /leads endpoint. The documented flow is:
      //   1. POST /contacts  → create the contact
      //   2. POST /jobs { contact: { id } } → creates a job in milestone
      //      "Lead (Unassigned)"
      // https://apidocs.acculynx.com/reference/postcontacts
      // https://apidocs.acculynx.com/reference/postjob

      // ── 1. Create contact ────────────────────────────────────────────
      // contactTypeIds is REQUIRED by POST /contacts (verified live 2026-07-19:
      // "ContactTypeIds Must contain at least one item.")
      const contactTypeIds = await this.getDefaultContactTypeIds();
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

      const contactRes = await this.client.post('/contacts', contactPayload);
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

      const jobRes = await this.client.post('/jobs', jobPayload);
      return {
        success: true,
        data: { contactId, jobId: jobRes.data?.id, job: jobRes.data },
        message: 'Lead created successfully (contact + job in Lead milestone)',
      };
    } catch (err: any) {
      this.logger.error('createLead error:', err.response?.data ?? err.message);
      return { success: false, error: err.response?.data?.title ?? err.response?.data?.message ?? err.message };
    }
  }

  // ── Connection status ──────────────────────────────────────────────────────

  async getStatus(): Promise<{ connected: boolean; message?: string }> {
    if (!this.client) return { connected: false, message: 'ACCULYNX_API_KEY not set' };
    try {
      // Light probe — fetch 1 job to verify the key works
      await this.client.get('/jobs', { params: { pageSize: 1, pageStartIndex: 0 } });
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
