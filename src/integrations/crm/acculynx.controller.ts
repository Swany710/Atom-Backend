import { Controller, Get, Post, Body, Query, Param } from '@nestjs/common';
import { Public } from '../../decorators/public.decorator';
import { AccuLynxService } from './acculynx.service';

@Public()
@Controller('api/v1/integrations/crm')
export class AccuLynxController {
  constructor(private readonly crm: AccuLynxService) {}

  /** GET /api/v1/integrations/crm/status */
  @Get('status')
  getStatus() {
    return this.crm.getStatus();
  }

  /** GET /api/v1/integrations/crm/jobs */
  @Get('jobs')
  getJobs(
    @Query('page')     page     = '1',
    @Query('pageSize') pageSize = '25',
    @Query('status')   status?: string,
    @Query('search')   search?: string,
  ) {
    return this.crm.getJobs({
      page:     parseInt(page, 10)     || 1,
      pageSize: parseInt(pageSize, 10) || 25,
      status,
      search,
    });
  }

  /** GET /api/v1/integrations/crm/jobs/:id */
  @Get('jobs/:id')
  getJob(@Param('id') id: string) {
    return this.crm.getJob(id);
  }

  /** POST /api/v1/integrations/crm/jobs/:id/notes */
  @Post('jobs/:id/notes')
  addNote(
    @Param('id') id: string,
    @Body() body: { note: string; authorName?: string },
  ) {
    return this.crm.addNote(id, body.note, body.authorName);
  }

  /** GET /api/v1/integrations/crm/contacts */
  @Get('contacts')
  getContacts(
    @Query('page')     page     = '1',
    @Query('pageSize') pageSize = '25',
    @Query('search')   search?: string,
  ) {
    return this.crm.getContacts({
      page:     parseInt(page, 10)     || 1,
      pageSize: parseInt(pageSize, 10) || 25,
      search,
    });
  }

  /** POST /api/v1/integrations/crm/leads */
  @Post('leads')
  createLead(@Body() body: {
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
    return this.crm.createLead(body);
  }
}
