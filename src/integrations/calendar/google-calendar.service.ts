import { Injectable, Logger } from '@nestjs/common';
import { decryptToken } from '../../crypto.util';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { google } from 'googleapis';
import { EmailConnection } from '../email/email-connection.entity';

export interface CalendarEventItem {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  allDay: boolean;
  location?: string;
  description?: string;
  attendees?: string[];
  meetLink?: string;
  date?: string; // friendly date label
}

export interface CalendarResult {
  success: boolean;
  events?: CalendarEventItem[];
  event?: CalendarEventItem;
  message?: string;
  error?: string;
}

@Injectable()
export class GoogleCalendarService {
  private readonly logger = new Logger(GoogleCalendarService.name);

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(EmailConnection)
    private readonly connectionRepo: Repository<EmailConnection>,
  ) {}

  // ── Build an authenticated OAuth2 client ──────────────────────────────
  private async buildClient(userId = 'default-user') {
    const clientId     = this.config.get<string>('GOOGLE_CLIENT_ID');
    const clientSecret = this.config.get<string>('GOOGLE_CLIENT_SECRET');
    const redirectUri  = this.config.get<string>('GOOGLE_REDIRECT_URI');

    if (!clientId || !clientSecret) {
      throw new Error('Google OAuth not configured (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET missing).');
    }

    const conn = await this.connectionRepo.findOne({ where: { userId, provider: 'gmail' } });
    if (!conn?.refreshToken) {
      throw new Error(
        'Google account not connected. Open Atom Settings → Connect Gmail to authorise Calendar access.',
      );
    }

    const auth = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
    auth.setCredentials({
      refresh_token: conn.refreshToken ? decryptToken(conn.refreshToken) : undefined,
      access_token:  decryptToken(conn.accessToken),
    });
    return auth;
  }

  // ── Format a Google Calendar event ────────────────────────────────────
  private formatEvent(ev: any): CalendarEventItem {
    const allDay   = !!ev.start?.date;
    const startRaw = ev.start?.dateTime ?? ev.start?.date ?? '';
    const endRaw   = ev.end?.dateTime   ?? ev.end?.date   ?? '';
    const start    = startRaw ? new Date(startRaw) : null;

    return {
      id:          ev.id ?? '',
      title:       ev.summary ?? 'Untitled Event',
      startTime:   allDay ? ev.start.date : startRaw,
      endTime:     allDay ? ev.end.date   : endRaw,
      allDay,
      location:    ev.location,
      description: ev.description,
      attendees:   (ev.attendees ?? []).map((a: any) => a.email).filter(Boolean),
      meetLink:    ev.hangoutLink ?? ev.conferenceData?.entryPoints?.[0]?.uri,
      date: start
        ? start.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
        : '',
    };
  }

  // ── Today's events ─────────────────────────────────────────────────────
  async getTodayEvents(userId = 'default-user'): Promise<CalendarResult> {
    try {
      const auth      = await this.buildClient(userId);
      const calendar  = google.calendar({ version: 'v3', auth });
      const now       = new Date();
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const endOfDay   = new Date(startOfDay.getTime() + 86_400_000);

      const res = await calendar.events.list({
        calendarId:   'primary',
        timeMin:       startOfDay.toISOString(),
        timeMax:       endOfDay.toISOString(),
        singleEvents: true,
        orderBy:      'startTime',
        maxResults:   25,
      });

      const events = (res.data.items ?? []).map(e => this.formatEvent(e));
      return { success: true, events, message: `${events.length} event(s) today` };
    } catch (err: any) {
      this.logger.error('getTodayEvents error:', err.message);
      return { success: false, error: err.message };
    }
  }

  // ── Upcoming events (next 7 days) ──────────────────────────────────────
  async getUpcomingEvents(userId = 'default-user', days = 7): Promise<CalendarResult> {
    try {
      const auth     = await this.buildClient(userId);
      const calendar = google.calendar({ version: 'v3', auth });
      const now      = new Date();
      const future   = new Date(now.getTime() + days * 86_400_000);

      const res = await calendar.events.list({
        calendarId:   'primary',
        timeMin:       now.toISOString(),
        timeMax:       future.toISOString(),
        singleEvents: true,
        orderBy:      'startTime',
        maxResults:   50,
      });

      const events = (res.data.items ?? []).map(e => this.formatEvent(e));
      return { success: true, events, message: `${events.length} upcoming event(s)` };
    } catch (err: any) {
      this.logger.error('getUpcomingEvents error:', err.message);
      return { success: false, error: err.message };
    }
  }

  // ── Create an event ────────────────────────────────────────────────────
  async createEvent(
    userId   = 'default-user',
    title:     string,
    startTime: string,
    endTime:   string,
    description?: string,
    location?:    string,
    attendees?:   string[],
  ): Promise<CalendarResult> {
    try {
      const auth     = await this.buildClient(userId);
      const calendar = google.calendar({ version: 'v3', auth });

      const event: any = {
        summary:     title,
        description: description ?? '',
        location:    location    ?? '',
        start: { dateTime: new Date(startTime).toISOString(), timeZone: 'America/Chicago' },
        end:   { dateTime: new Date(endTime).toISOString(),   timeZone: 'America/Chicago' },
        conferenceData: {
          createRequest: { requestId: `atom-${Date.now()}`, conferenceSolutionKey: { type: 'hangoutsMeet' } },
        },
      };

      if (attendees?.length) {
        event.attendees = attendees.map(email => ({ email }));
      }

      const res = await calendar.events.insert({
        calendarId:              'primary',
        requestBody:             event,
        conferenceDataVersion:   1,
        sendNotifications:       true,
      });

      return { success: true, event: this.formatEvent(res.data), message: `Event "${title}" created.` };
    } catch (err: any) {
      this.logger.error('createEvent error:', err.message);
      return { success: false, error: err.message };
    }
  }


  // ── Update an event ────────────────────────────────────────────────────
  async updateEvent(
    userId    = 'default-user',
    eventId:    string,
    updates: {
      title?:       string;
      startTime?:   string;
      endTime?:     string;
      description?: string;
      location?:    string;
      attendees?:   string[];
    },
  ): Promise<CalendarResult> {
    try {
      const auth     = await this.buildClient(userId);
      const calendar = google.calendar({ version: 'v3', auth });

      // Fetch current event first
      const existing = await calendar.events.get({ calendarId: 'primary', eventId });
      const ev: any  = existing.data;

      const patched: any = {
        summary:     updates.title       ?? ev.summary,
        description: updates.description ?? ev.description,
        location:    updates.location    ?? ev.location,
        start: updates.startTime
          ? { dateTime: new Date(updates.startTime).toISOString(), timeZone: 'America/Chicago' }
          : ev.start,
        end: updates.endTime
          ? { dateTime: new Date(updates.endTime).toISOString(), timeZone: 'America/Chicago' }
          : ev.end,
      };

      if (updates.attendees) {
        patched.attendees = updates.attendees.map(email => ({ email }));
      }

      const res = await calendar.events.patch({
        calendarId: 'primary',
        eventId,
        requestBody: patched,
        sendNotifications: true,
      });

      return { success: true, event: this.formatEvent(res.data), message: 'Event updated.' };
    } catch (err: any) {
      this.logger.error('updateEvent error:', err.message);
      return { success: false, error: err.message };
    }
  }

  // ── Delete an event ────────────────────────────────────────────────────
  async deleteEvent(userId = 'default-user', eventId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const auth     = await this.buildClient(userId);
      const calendar = google.calendar({ version: 'v3', auth });
      await calendar.events.delete({ calendarId: 'primary', eventId, sendNotifications: true });
      return { success: true };
    } catch (err: any) {
      this.logger.error('deleteEvent error:', err.message);
      return { success: false, error: err.message };
    }
  }

  // ── Search events by keyword ───────────────────────────────────────────
  async searchEvents(userId = 'default-user', query: string, maxResults = 20): Promise<CalendarResult> {
    try {
      const auth     = await this.buildClient(userId);
      const calendar = google.calendar({ version: 'v3', auth });
      const now      = new Date();

      const res = await calendar.events.list({
        calendarId:   'primary',
        q:            query,
        timeMin:       new Date(now.getTime() - 30 * 86_400_000).toISOString(), // past 30 days
        timeMax:       new Date(now.getTime() + 90 * 86_400_000).toISOString(), // next 90 days
        singleEvents: true,
        orderBy:      'startTime',
        maxResults,
      });

      const events = (res.data.items ?? []).map(e => this.formatEvent(e));
      return { success: true, events, message: `${events.length} event(s) matching "${query}"` };
    } catch (err: any) {
      this.logger.error('searchEvents error:', err.message);
      return { success: false, error: err.message };
    }
  }

  // ── Get a single event by ID ───────────────────────────────────────────
  async getEvent(userId = 'default-user', eventId: string): Promise<CalendarResult> {
    try {
      const auth     = await this.buildClient(userId);
      const calendar = google.calendar({ version: 'v3', auth });
      const res      = await calendar.events.get({ calendarId: 'primary', eventId });
      return { success: true, event: this.formatEvent(res.data), message: 'Event found.' };
    } catch (err: any) {
      this.logger.error('getEvent error:', err.message);
      return { success: false, error: err.message };
    }
  }


  // ── Check connection status ────────────────────────────────────────────
  async getConnectionStatus(userId = 'default-user') {
    const conn = await this.connectionRepo.findOne({ where: { userId, provider: 'gmail' } });
    if (!conn?.refreshToken) {
      return { connected: false, emailAddress: undefined, note: 'Connect Gmail in Settings to enable Calendar.' };
    }
    // Attempt a lightweight API call to verify the token actually works and has calendar access.
    try {
      const auth     = await this.buildClient(userId);
      const calendar = google.calendar({ version: 'v3', auth });
      await calendar.calendarList.list({ maxResults: 1 });
      return { connected: true, emailAddress: conn.emailAddress };
    } catch (err: any) {
      const needsReconnect = err.message?.includes('insufficient') || err.message?.includes('scope') || err.message?.includes('403');
      return {
        connected: false,
        emailAddress: conn.emailAddress,
        note: needsReconnect
          ? 'Re-connect Gmail in Settings to grant Calendar access (missing scope).'
          : 'Calendar check failed — try reconnecting Gmail.',
        error: err.message,
      };
    }
  }
}
