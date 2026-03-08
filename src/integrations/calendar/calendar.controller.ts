import { Req, Controller, Get, Post, Patch, Delete, Body, Query, Param } from '@nestjs/common';
import { GoogleCalendarService } from './google-calendar.service';

@Controller('api/v1/integrations/calendar')
export class CalendarController {
  constructor(private readonly googleCalendar: GoogleCalendarService) {}

  @Get('today')
  async getToday(@Req() req: any) {
    const userId: string = req.atomUserId;
    return this.googleCalendar.getTodayEvents(userId);
  }

  @Get('upcoming')
  async getUpcoming(@Req() req: any, @Query('days') days = '7') {
    const userId: string = req.atomUserId;
    return this.googleCalendar.getUpcomingEvents(userId, parseInt(days, 10) || 7);
  }

  @Get('search')
  async search(@Req() req: any, @Query('q') q: string, @Query('maxResults') max = '20') {
    const userId: string = req.atomUserId;
    return this.googleCalendar.searchEvents(userId, q ?? '', parseInt(max, 10));
  }

  @Get('events/:id')
  async getEvent(@Req() req: any, @Param('id') id: string) {
    const userId: string = req.atomUserId;
    return this.googleCalendar.getEvent(userId, id);
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
    return this.googleCalendar.createEvent(
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
    return this.googleCalendar.updateEvent(userId, id, body);
  }

  @Delete('events/:id')
  async deleteEvent(@Req() req: any, @Param('id') id: string) {
    const userId: string = req.atomUserId;
    return this.googleCalendar.deleteEvent(userId, id);
  }

  /** Sanitised status — no internal config details */
  @Get('status')
  async getStatus(@Req() req: any) {
    const userId: string = req.atomUserId;
    const result = await this.googleCalendar.getConnectionStatus(userId);
    // Never leak internal error details publicly
    return {
      connected:    result.connected,
      emailAddress: result.emailAddress ?? null,
      note:         result.connected ? undefined : 'Calendar not connected',
    };
  }
}
