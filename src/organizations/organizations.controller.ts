import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { OrganizationsService } from './organizations.service';
import { Roles, RolesGuard } from '../guards/roles.guard';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * OrganizationsController — self-service org management for the CURRENT org.
 * ApiKeyGuard (global) authenticates; RolesGuard enforces owner/admin where
 * needed. All data access is tenant-scoped via TenantContext.
 */
@ApiBearerAuth('bearer')
@ApiTags('Organizations')
@Controller('api/v1/orgs')
@UseGuards(RolesGuard)
export class OrganizationsController {
  constructor(private readonly orgs: OrganizationsService) {}

  /** GET /api/v1/orgs/me — current user's organization */
  @Get('me')
  @ApiOperation({ summary: "Current user's organization" })
  getMyOrg() {
    return this.orgs.getMyOrg();
  }

  /** GET /api/v1/orgs/members — members of the current org */
  @Get('members')
  @ApiOperation({ summary: 'List members of the current organization' })
  getMembers() {
    return this.orgs.getMembers();
  }

  /** POST /api/v1/orgs/invite — org-bound invite (registrant joins as member) */
  @Post('invite')
  @Roles('owner', 'admin')
  @ApiOperation({ summary: 'Create an invite code that joins THIS org as member' })
  createInvite(@Body() body: { label?: string }) {
    return this.orgs.createInvite(body?.label);
  }

  /**
   * PATCH /api/v1/orgs/members/:id/acculynx — map a member to an AccuLynx
   * user (CRM-ACCESS-POLICY.md). Owner/admin only; never self-service.
   * Body: { acculynxUserId: "<uuid>" } or { acculynxUserId: null } to clear.
   */
  @Patch('members/:id/acculynx')
  @Roles('owner', 'admin')
  @ApiOperation({ summary: 'Set (or clear) a member’s AccuLynx user mapping' })
  setAcculynxMapping(
    @Param('id') memberUserId: string,
    @Body() body: { acculynxUserId: string | null },
  ) {
    const v = body?.acculynxUserId;
    if (v !== null && (typeof v !== 'string' || !UUID_RE.test(v))) {
      throw new BadRequestException(
        'acculynxUserId must be a UUID (from GET /integrations/crm/users) or null',
      );
    }
    return this.orgs.setAcculynxMapping(memberUserId, v);
  }
}
