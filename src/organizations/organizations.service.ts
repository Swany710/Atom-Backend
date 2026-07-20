import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Organization } from './organization.entity';
import { User } from '../users/user.entity';
import { InviteCode } from '../auth/invite-code.entity';
import { InviteCodesService } from '../auth/invite-codes.service';
import { TenantContextService } from './tenant-context.service';

/**
 * OrganizationsService — org info + member management for the CURRENT org.
 * All methods are scoped by TenantContext; there is deliberately no
 * cross-org lookup here (admin dashboard uses its own API-key-gated module).
 */
@Injectable()
export class OrganizationsService {
  constructor(
    @InjectRepository(Organization)
    private readonly orgRepo: Repository<Organization>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly inviteCodes: InviteCodesService,
    private readonly tenantContext: TenantContextService,
  ) {}

  /** Current user's organization */
  async getMyOrg(): Promise<Organization> {
    const orgId = this.tenantContext.orgIdOrFail();
    const org = await this.orgRepo.findOne({ where: { id: orgId } });
    if (!org) throw new NotFoundException('Organization not found');
    return org;
  }

  /** Members of the current org (safe fields only) */
  async getMembers(): Promise<
    Array<Pick<User, 'id' | 'email' | 'displayName' | 'role' | 'acculynxUserId' | 'createdAt'>>
  > {
    const orgId = this.tenantContext.orgIdOrFail();
    const users = await this.userRepo.find({
      where: { orgId },
      order: { createdAt: 'ASC' },
    });
    return users.map(u => ({
      id: u.id,
      email: u.email,
      displayName: u.displayName,
      role: u.role,
      acculynxUserId: u.acculynxUserId,
      createdAt: u.createdAt,
    }));
  }

  /** Issue an org-bound invite: registrant joins THIS org as 'member'. */
  async createInvite(label?: string): Promise<InviteCode> {
    const orgId = this.tenantContext.orgIdOrFail();
    return this.inviteCodes.create(label, orgId);
  }

  /**
   * Map a member of the current org to an AccuLynx user (CRM-ACCESS-POLICY.md).
   * Caller must be owner/admin (enforced by RolesGuard on the controller).
   * Pass null to clear the mapping.
   */
  async setAcculynxMapping(
    memberUserId: string,
    acculynxUserId: string | null,
  ): Promise<{ success: boolean }> {
    const orgId = this.tenantContext.orgIdOrFail();
    const member = await this.userRepo.findOne({
      where: { id: memberUserId, orgId }, // org check: no cross-org mapping
    });
    if (!member) throw new NotFoundException('User not found in your organization');

    member.acculynxUserId = acculynxUserId ?? undefined;
    if (acculynxUserId === null) {
      // TypeORM skips undefined on save — explicit update to clear
      await this.userRepo.update({ id: member.id }, { acculynxUserId: null as any });
    } else {
      await this.userRepo.save(member);
    }
    return { success: true };
  }
}
