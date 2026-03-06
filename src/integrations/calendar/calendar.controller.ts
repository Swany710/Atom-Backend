import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import { Public } from '../../decorators/public.decorator';
import { GoogleCalendarService } from './google-calendar.service';

@Public()
@Controller('api/v1/integrations/calendar')
export class CalendarController {
  constructor(private readonly googleCalendar: GoogleCalendarService) {}

  /** GET /api/v1/integrations/calendar/today */
  @Get('today')
  async getToday(@Query('userId') userId = 'default-user') {
    return this.googleCalendar.getTodayEvents(userId);
  }

  /** GET /api/v1/integrations/calendar/upcoming */
  @Get('upcoming')
  async getUpcoming(
    @Query('userId') userId = 'default-user',
    @Query('days') days = '7',
  ) {
    return this.googleCalendar.getUpcomingEvents(userId, parseInt(days, 10) || 7);
  }

  /** POST /api/v1/integrations/calendar/events */
  @Post('events')
  async createEvent(
    @Body() body: {
      userId?:      string;
      title:        string;
      startTime:    string;
      endTime:      string;
      description?: string;
      location?:    string;
      attendees?:   string[];
    },
  ) {
    return this.googleCalendar.createEvent(
      body.userId ?? 'default-user',
      body.title,
      body.startTime,
      body.endTime,
      body.description,
      body.location,
      body.attendees,
    );
  }

  /** GET /api/v1/integrations/calendar/status */
  @Get('status')
  async getStatus(@Query('userId') userId = 'default-user') {
    return this.googleCalendar.getConnectionStatus(userId);
  }
}
