import { Req, Controller, Get, Post, Put, Body, Query, Param, UseGuards } from '@nestjs/common';

import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AccuLynxService } from './acculynx.service';
import { CrmAccessPolicyService } from './crm-access-policy.service';
import { Roles, RolesGuard } from '../../guards/roles.guard';

@ApiBearerAuth('bearer')
@ApiTags('CRM')
@Controller('api/v1/integrations/crm')
@UseGuards(RolesGuard)
export class AccuLynxController {
  constructor(
    private readonly crm: AccuLynxService,
    private readonly policy: CrmAccessPolicyService,
  ) {}

  /** GET /api/v1/integrations/crm/status */
  @Get('status')
  getStatus() {
    return this.crm.getStatus();
  }

  /**
   * PUT /api/v1/integrations/crm/credentials — store the org's AccuLynx API
   * key (validated against the live API, stored encrypted). Owner/admin only.
   */
  @Put('credentials')
  @Roles('owner', 'admin')
  @ApiOperation({ summary: "Set the organization's AccuLynx API key" })
  setCredentials(@Body() body: { apiKey: string }) {
    return this.crm.setOrgApiKey(body?.apiKey);
  }

  /**
   * GET /api/v1/integrations/crm/users — AccuLynx company roster, for the
   * member-mapping dropdown (CRM-ACCESS-POLICY.md). Owner/admin only.
   */
  @Get('users')
  @Roles('owner', 'admin')
  @ApiOperation({ summary: 'AccuLynx company user roster (for mapping members)' })
  listUsers() {
    return this.crm.listCompanyUsers();
  }

  /**
   * GET /api/v1/integrations/crm/jobs — members always see only their
   * assigned jobs; owner/admin see all unless ?mine=true ("My jobs" view).
   */
  @Get('jobs')
  async getJobs(
    @Query('page')     page     = '1',
    @Query('pageSize') pageSize = '25',
    @Query('status')   status?: string,
    @Query('search')   search?: string,
    @Query('mine')     mine?: string,
  ) {
    const denied = await this.policy.checkCrmAccess();
    if (denied) return denied;
    const result = await this.crm.getJobs({
      page:     parseInt(page, 10)     || 1,
      pageSize: parseInt(pageSize, 10) || 25,
      status,
      search,
    });
    return this.policy.filterJobList(result, mine === 'true' || mine === '1');
  }

  /** GET /api/v1/integrations/crm/jobs/:id */
  @Get('jobs/:id')
  async getJob(@Param('id') id: string) {
    const denied = await this.policy.checkJobAccess(id);
    if (denied) return denied;
    return this.crm.getJob(id);
  }

  /** POST /api/v1/integrations/crm/jobs/:id/notes */
  @Post('jobs/:id/notes')
  async addNote(
    @Param('id') id: string,
    @Body() body: { note: string; authorName?: string },
  ) {
    const denied = await this.policy.checkJobAccess(id);
    if (denied) return denied;
    return this.crm.addNote(id, body.note, body.authorName);
  }

  /** GET /api/v1/integrations/crm/contacts */
  @Get('contacts')
  async getContacts(
    @Query('page')     page     = '1',
    @Query('pageSize') pageSize = '25',
    @Query('search')   search?: string,
  ) {
    const denied = await this.policy.checkCrmAccess();
    if (denied) return denied;
    return this.crm.getContacts({
      page:     parseInt(page, 10)     || 1,
      pageSize: parseInt(pageSize, 10) || 25,
      search,
    });
  }

  /** POST /api/v1/integrations/crm/leads — auto-assigns to the creator's mapped AccuLynx user */
  @Post('leads')
  async createLead(@Body() body: {
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
  }) {
    const denied = await this.policy.checkCrmAccess();
    if (denied) return denied;
    const assignToAcculynxUserId = await this.policy.callerAcculynxUserId();
    return this.crm.createLead({ ...body, assignToAcculynxUserId });
  }
}
