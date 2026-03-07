import { Controller, Get, Post, Patch, Delete, Body, Query, Param } from '@nestjs/common';
import { Public } from '../../decorators/public.decorator';
import { GoogleCalendarService } from './google-calendar.service';

@Public()
@Controller('api/v1/integrations/calendar')
export class CalendarController {
  constructor(private readonly googleCalendar: GoogleCalendarService) {}

  /** GET /today */
  @Get('today')
  async getToday(@Query('userId') userId = 'default-user') {
    return this.googleCalendar.getTodayEvents(userId);
  }

  /** GET /upcoming */
  @Get('upcoming')
  async getUpcoming(@Query('userId') userId = 'default-user', @Query('days') days = '7') {
    return this.googleCalendar.getUpcomingEvents(userId, parseInt(days, 10) || 7);
  }

  /** GET /search?q=dentist */
  @Get('search')
  async search(@Query('q') q: string, @Query('userId') userId = 'default-user', @Query('maxResults') max = '20') {
    return this.googleCalendar.searchEvents(userId, q ?? '', parseInt(max, 10));
  }

  /** GET /events/:id */
  @Get('events/:id')
  async getEvent(@Param('id') id: string, @Query('userId') userId = 'default-user') {
    return this.googleCalendar.getEvent(userId, id);
  }

  /** POST /events — create */
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
      body.title, body.startTime, body.endTime,
      body.description, body.location, body.attendees,
    );
  }

  /** PATCH /events/:id — update */
  @Patch('events/:id')
  async updateEvent(
    @Param('id') id: string,
    @Body() body: {
      userId?:      string;
      title?:       string;
      startTime?:   string;
      endTime?:     string;
      description?: string;
      location?:    string;
      attendees?:   string[];
    },
  ) {
    return this.googleCalendar.updateEvent(body.userId ?? 'default-user', id, body);
  }

  /** DELETE /events/:id */
  @Delete('events/:id')
  async deleteEvent(@Param('id') id: string, @Query('userId') userId = 'default-user') {
    return this.googleCalendar.deleteEvent(userId, id);
  }

  /** GET /status */
  @Get('status')
  async getStatus(@Query('userId') userId = 'default-user') {
    return this.googleCalendar.getConnectionStatus(userId);
  }
}
