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

  // ── Map raw AccuLynx job → clean shape ──────────────────────────────────
  private mapJob(j: any): AccuLynxJob {
    return {
      jobId:         String(j.jobId ?? j.id ?? ''),
      jobName:       j.name ?? j.jobName ?? j.title ?? 'Unnamed Job',
      status:        j.status ?? j.jobStatus,
      milestone:     j.milestone ?? j.currentMilestone,
      address:       j.address?.line1 ?? j.streetAddress ?? j.address,
      city:          j.address?.city  ?? j.city,
      state:         j.address?.state ?? j.state,
      zip:           j.address?.zip   ?? j.postalCode,
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
      address:   c.address?.line1 ?? c.streetAddress,
      city:      c.address?.city  ?? c.city,
      state:     c.address?.state ?? c.state,
      zip:       c.address?.zip   ?? c.postalCode,
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
      const p: any = { page: params?.page ?? 1, pageSize: params?.pageSize ?? 25 };
      if (params?.status) p.status = params.status;

      let jobs: any[] = [];
      let total = 0;

      if (params?.search) {
        // Use search endpoint for text searches
        const res = await this.client.post('/jobs/search', { searchTerm: params.search });
        jobs  = res.data?.jobs ?? res.data?.items ?? res.data ?? [];
        total = res.data?.total ?? jobs.length;
      } else {
        const res = await this.client.get('/jobs', { params: p });
        jobs  = res.data?.jobs ?? res.data?.items ?? res.data ?? [];
        total = res.data?.total ?? res.data?.totalCount ?? jobs.length;
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
      // AccuLynx v2 comments endpoint
      const res = await this.client.post(`/jobs/${jobId}/comments`, {
        text:   note,
        author: authorName ?? 'Atom AI',
      });
      return { success: true, data: res.data, message: 'Note added successfully' };
    } catch (err: any) {
      this.logger.error('addNote error:', err.message);
      return { success: false, error: err.response?.data?.message ?? err.message };
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
      const p: any = { page: params?.page ?? 1, pageSize: params?.pageSize ?? 25 };
      if (params?.search) p.searchTerm = params.search;

      const res = await this.client.get('/contacts', { params: p });
      const contacts: any[] = res.data?.contacts ?? res.data?.items ?? res.data ?? [];
      const total = res.data?.total ?? res.data?.totalCount ?? contacts.length;
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
      const payload: any = {
        firstName: lead.firstName,
        lastName:  lead.lastName,
        email:     lead.email,
        phone:     lead.phone,
        source:    lead.source ?? 'Atom AI',
        notes:     lead.notes,
      };
      if (lead.address) {
        payload.address = {
          line1: lead.address,
          city:  lead.city,
          state: lead.state,
          zip:   lead.zip,
        };
      }
      const res = await this.client.post('/leads', payload);
      return { success: true, data: res.data, message: 'Lead created successfully' };
    } catch (err: any) {
      this.logger.error('createLead error:', err.message);
      return { success: false, error: err.response?.data?.message ?? err.message };
    }
  }

  // ── Connection status ──────────────────────────────────────────────────────

  async getStatus(): Promise<{ connected: boolean; message?: string }> {
    if (!this.client) return { connected: false, message: 'ACCULYNX_API_KEY not set' };
    try {
      // Light probe — fetch 1 job to verify the key works
      await this.client.get('/jobs', { params: { page: 1, pageSize: 1 } });
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
