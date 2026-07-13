import { Req, Controller, Get, Post, Patch, Delete, Body, Query, Param } from '@nestjs/common';

import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { GoogleCalendarService } from './google-calendar.service';
import { OutlookCalendarService } from './outlook-calendar.service';

/**
 * Calendar REST API used by the frontend Calendar panels.
 *
 * PROVIDER ROUTING — mirrors ToolExecutionService.calendarProviderFor():
 *   1. Google Calendar if the user connected Google
 *   2. Outlook calendar if the user connected Outlook
 * Previously this controller was hardwired to Google, so Outlook users saw
 * "Calendar not connected" in the panels even though chat worked.
 */
@ApiBearerAuth('bearer')
@ApiTags('Calendar')
@Controller('api/v1/integrations/calendar')
export class CalendarController {
  constructor(
    private readonly googleCalendar: GoogleCalendarService,
    private readonly outlookCalendar: OutlookCalendarService,
  ) {}

  private async providerFor(userId: string): Promise<'google' | 'outlook' | 'none'> {
    try {
      const status = await this.googleCalendar.getConnectionStatus(userId);
      if (status.connected) return 'google';
    } catch { /* fall through */ }
    try {
      if (await this.outlookCalendar.hasConnection(userId)) return 'outlook';
    } catch { /* fall through */ }
    return 'none';
  }

  private notConnected() {
    return {
      success: false,
      events:  [],
      error:   'No calendar connected. Connect Google or Outlook in Settings.',
    };
  }

  @Get('today')
  async getToday(@Req() req: any) {
    const userId: string = req.atomUserId;
    const provider = await this.providerFor(userId);
    if (provider === 'google')  return this.googleCalendar.getTodayEvents(userId);
    if (provider === 'outlook') return this.outlookCalendar.getUpcomingEvents(userId, 1);
    return this.notConnected();
  }

  @Get('upcoming')
  async getUpcoming(@Req() req: any, @Query('days') days = '7') {
    const userId: string = req.atomUserId;
    const n = parseInt(days, 10) || 7;
    const provider = await this.providerFor(userId);
    if (provider === 'google')  return this.googleCalendar.getUpcomingEvents(userId, n);
    if (provider === 'outlook') return this.outlookCalendar.getUpcomingEvents(userId, n);
    return this.notConnected();
  }

  @Get('search')
  async search(@Req() req: any, @Query('q') q: string, @Query('maxResults') max = '20') {
    const userId: string = req.atomUserId;
    const n = parseInt(max, 10) || 20;
    const provider = await this.providerFor(userId);
    if (provider === 'google')  return this.googleCalendar.searchEvents(userId, q ?? '', n);
    if (provider === 'outlook') return this.outlookCalendar.searchEvents(userId, q ?? '', n);
    return this.notConnected();
  }

  @Get('events/:id')
  async getEvent(@Req() req: any, @Param('id') id: string) {
    const userId: string = req.atomUserId;
    const provider = await this.providerFor(userId);
    if (provider === 'google') return this.googleCalendar.getEvent(userId, id);
    // Outlook service has no single-event fetch; the panels don't use this
    // endpoint, but keep the response shape sane rather than 500ing.
    return { success: false, error: 'Single-event lookup is only available for Google Calendar.' };
  }

  @Post('events')
  async createEvent(
    @Req() req: any,
    @Body() body: {
      title:        string;
      startTime:    string;
      endTime:      string;
      description?: string;
      location?:    string;
      attendees?:   string[];
    },
  ) {
    const userId: string = req.atomUserId;
    const provider = await this.providerFor(userId);
    if (provider === 'none') return this.notConnected();
    const svc = provider === 'google' ? this.googleCalendar : this.outlookCalendar;
    return svc.createEvent(
      userId,
      body.title, body.startTime, body.endTime,
      body.description, body.location, body.attendees,
    );
  }

  @Patch('events/:id')
  async updateEvent(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: {
      title?:       string;
      startTime?:   string;
      endTime?:     string;
      description?: string;
      location?:    string;
      attendees?:   string[];
    },
  ) {
    const userId: string = req.atomUserId;
    const provider = await this.providerFor(userId);
    if (provider === 'none') return this.notConnected();
    const svc = provider === 'google' ? this.googleCalendar : this.outlookCalendar;
    return svc.updateEvent(userId, id, body);
  }

  @Delete('events/:id')
  async deleteEvent(@Req() req: any, @Param('id') id: string) {
    const userId: string = req.atomUserId;
    const provider = await this.providerFor(userId);
    if (provider === 'none') return this.notConnected();
    const svc = provider === 'google' ? this.googleCalendar : this.outlookCalendar;
    return svc.deleteEvent(userId, id);
  }

  /** Sanitised status — no internal config details */
  @Get('status')
  async getStatus(@Req() req: any) {
    const userId: string = req.atomUserId;
    const provider = await this.providerFor(userId);

    if (provider === 'google') {
      const result = await this.googleCalendar.getConnectionStatus(userId);
      return {
        connected:    result.connected,
        provider:     'google',
        emailAddress: result.emailAddress ?? null,
      };
    }
    if (provider === 'outlook') {
      return { connected: true, provider: 'outlook', emailAddress: null };
    }
    return { connected: false, provider: null, emailAddress: null, note: 'Calendar not connected' };
  }
}
