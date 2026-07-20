import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../users/user.entity';
import { TenantContextService } from '../../organizations/tenant-context.service';
import { AccuLynxService, AccuLynxJob, CrmResult } from './acculynx.service';

/**
 * CrmAccessPolicyService — per-user job scoping (CRM-ACCESS-POLICY.md).
 *
 * Hardcoded policy:
 *   owner/admin        → all jobs, read + write
 *   member (mapped)    → only jobs where an assigned rep matches their
 *                        admin-set users.acculynxUserId
 *   member (unmapped)  → NO CRM access (fail closed)
 *
 * Enforcement lives here (backend) because the AccuLynx API key is
 * account-scoped — AccuLynx itself cannot restrict per user. The key never
 * leaves the backend, so these checks are a hard gate, not advisory.
 *
 * Unassigned jobs: /representatives returns 404 → treated as "no reps" →
 * members are denied, owner/admin allowed.
 */
@Injectable()
export class CrmAccessPolicyService {
  private readonly logger = new Logger(CrmAccessPolicyService.name);

  constructor(
    private readonly tenantContext: TenantContextService,
    private readonly accuLynx: AccuLynxService,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  private static readonly DENIED_UNMAPPED: CrmResult = {
    success: false,
    error:
      'You do not have CRM access yet. Ask your organization admin to link ' +
      'your Atom account to your AccuLynx user (Settings → Members).',
  };

  private static readonly DENIED_NOT_YOURS: CrmResult = {
    success: false,
    error: 'That job is not assigned to you, so you cannot view or update it.',
  };

  /** Full-visibility roles */
  private isPrivileged(): boolean {
    const role = this.tenantContext.role();
    return role === 'owner' || role === 'admin';
  }

  /** The caller's AccuLynx mapping (undefined = unmapped). */
  async callerAcculynxUserId(): Promise<string | undefined> {
    const userId = this.tenantContext.userId();
    if (!userId || userId === 'dev-user') return undefined;
    const user = await this.userRepo.findOne({ where: { id: userId } });
    return user?.acculynxUserId ?? undefined;
  }

  /**
   * Gate for job-targeted operations (get job, add note, future updates).
   * Returns null when allowed, or a CrmResult error to return to the caller.
   */
  async checkJobAccess(jobId: string): Promise<CrmResult | null> {
    if (this.isPrivileged()) return null;

    const mapping = await this.callerAcculynxUserId();
    if (!mapping) return CrmAccessPolicyService.DENIED_UNMAPPED;

    const reps = await this.accuLynx.getJobRepresentativeIds(jobId);
    if (!reps.success) return reps; // upstream error — surface it
    if ((reps.data ?? []).includes(mapping)) return null;

    return CrmAccessPolicyService.DENIED_NOT_YOURS;
  }

  /**
   * Gate for non-job-specific CRM operations (list jobs, contacts, create
   * lead). Members need a mapping; owner/admin always pass.
   */
  async checkCrmAccess(): Promise<CrmResult | null> {
    if (this.isPrivileged()) return null;
    const mapping = await this.callerAcculynxUserId();
    return mapping ? null : CrmAccessPolicyService.DENIED_UNMAPPED;
  }

  /**
   * The caller's pipeline: jobs grouped by milestone, scoped to their
   * assigned jobs (mine) — the default for day/week planning. Owner/admin
   * can request scope 'all' for the whole company.
   */
  async getMyPipeline(
    accuLynx: AccuLynxService,
    scope: 'mine' | 'all' = 'mine',
  ): Promise<CrmResult<Record<string, AccuLynxJob[]>>> {
    const denied = await this.checkCrmAccess();
    if (denied) return denied as CrmResult<Record<string, AccuLynxJob[]>>;

    const milestones = ['Lead', 'Prospect', 'Approved', 'Completed', 'Invoiced'];
    const wantAll = scope === 'all' && this.isPrivileged();
    const grouped: Record<string, AccuLynxJob[]> = {};
    let total = 0;

    for (const m of milestones) {
      let result = await accuLynx.getJobs({ status: m, pageSize: 25 });
      if (!wantAll) result = await this.filterJobList(result, true);
      if (!result.success) {
        // Unmapped user etc. — surface the denial once
        return { success: false, error: result.error };
      }
      grouped[m] = result.data ?? [];
      total += grouped[m].length;
    }

    return {
      success: true,
      data: grouped,
      total,
      message: wantAll
        ? 'Company-wide pipeline by milestone (first 25 jobs per stage).'
        : 'Your assigned jobs by milestone (first 25 per stage).',
    };
  }

  /**
   * Post-filter a job list for members: keep only jobs where the caller is
   * an assigned rep. Owner/admin lists pass through untouched — unless
   * `force` is set (the "My jobs" view), which applies the caller's mapping
   * regardless of role. Rep lookups are 60s-cached in AccuLynxService.
   */
  async filterJobList(
    result: CrmResult<AccuLynxJob[]>,
    force = false,
  ): Promise<CrmResult<AccuLynxJob[]>> {
    if (!result.success || (this.isPrivileged() && !force)) return result;

    const mapping = await this.callerAcculynxUserId();
    if (!mapping) {
      return force && this.isPrivileged()
        ? {
            success: false,
            error:
              'Your account is not linked to an AccuLynx user yet — link it in Team & Access to use the My Jobs view.',
          }
        : CrmAccessPolicyService.DENIED_UNMAPPED;
    }

    const jobs = result.data ?? [];
    const kept: AccuLynxJob[] = [];
    for (const job of jobs) {
      const reps = await this.accuLynx.getJobRepresentativeIds(job.jobId);
      if (reps.success && (reps.data ?? []).includes(mapping)) kept.push(job);
    }
    return {
      success: true,
      data: kept,
      total: kept.length,
      message:
        kept.length < jobs.length
          ? `Showing your assigned jobs only (${kept.length} of ${jobs.length} on this page).`
          : result.message,
    };
  }
}
