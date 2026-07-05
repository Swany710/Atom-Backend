import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { OutlookTransport } from '../email/outlook.transport';

const GRAPH = 'https://graph.microsoft.com/v1.0';

/** Default timezone for the business — matches the system prompt (Central Time). */
const DEFAULT_TZ = 'America/Chicago';

export interface OutlookCalendarEvent {
  id: string;
  title: string;
  start?: string;
  end?: string;
  location?: string;
  attendees?: string[];
  description?: string;
  isAllDay?: boolean;
  webLink?: string;
}

/**
 * OutlookCalendarService — per-user Outlook/Microsoft 365 calendar via the
 * user's own OAuth connection (delegated token from the Settings → Connect
 * Outlook flow). Requires the Calendars.ReadWrite scope; connections made
 * before that scope was added must be reconnected once.
 *
 * Token handling (decrypt / refresh / re-encrypt) is delegated to
 * OutlookTransport so there is exactly one implementation of it.
 */
@Injectable()
export class OutlookCalendarService {
  private readonly logger = new Logger(OutlookCalendarService.name);

  constructor(private readonly outlook: OutlookTransport) {}

  /** True if the user has an Outlook connection with calendar permission. */
  async hasCalendarAccess(userId?: string): Promise<boolean> {
    if (!(await this.outlook.hasConnection(userId))) return false;
    const scopes = await this.outlook.getGrantedScopes(userId);
    return /calendars\.(read|readwrite)/i.test(scopes);
  }

  /** True if the user has any Outlook connection (even mail-only). */
  async hasConnection(userId?: string): Promise<boolean> {
    return this.outlook.hasConnection(userId);
  }

  private async headers(userId?: string) {
    const token = await this.outlook.getAccessTokenForUser(userId);
    return {
      Authorization: `Bearer ${token}`,
      // Have Graph return event times already converted to CT.
      Prefer: `outlook.timezone="${DEFAULT_TZ}"`,
    };
  }

  private mapEvent = (e: any): OutlookCalendarEvent => ({
    id: e.id,
    title: e.subject,
    start: e.start?.dateTime,
    end: e.end?.dateTime,
    location: e.location?.displayName || undefined,
    attendees: e.attendees?.map((a: any) => a.emailAddress?.address).filter(Boolean),
    description: e.bodyPreview || undefined,
    isAllDay: e.isAllDay,
    webLink: e.webLink,
  });

  /** Graph wants { dateTime, timeZone }. 'Z'-suffixed input is UTC; otherwise CT. */
  private toGraphDateTime(value: string) {
    const isUtc = /z$/i.test(value);
    return {
      dateTime: value.replace(/z$/i, ''),
      timeZone: isUtc ? 'UTC' : DEFAULT_TZ,
    };
  }

  async getUpcomingEvents(userId: string | undefined, days = 7) {
    try {
      const start = new Date();
      const end = new Date(Date.now() + Math.max(days, 1) * 86_400_000);

      const r = await axios.get(`${GRAPH}/me/calendarView`, {
        headers: await this.headers(userId),
        params: {
          startDateTime: start.toISOString(),
          endDateTime: end.toISOString(),
          $orderby: 'start/dateTime',
          $top: 50,
        },
      });

      const events = ((r.data as any).value || []).map(this.mapEvent);
      return {
        success: true,
        events,
        count: events.length,
        message: `Found ${events.length} event(s) in the next ${days} day(s) (Outlook calendar, times in CT)`,
      };
    } catch (error: any) {
      this.logger.error('Outlook getUpcomingEvents failed:', error?.response?.data ?? error.message);
      return { success: false, error: this.friendlyError(error) };
    }
  }

  async searchEvents(userId: string | undefined, query: string, maxResults = 20) {
    try {
      const safe = query.replace(/'/g, "''");
      const r = await axios.get(`${GRAPH}/me/events`, {
        headers: await this.headers(userId),
        params: {
          $filter: `contains(subject,'${safe}')`,
          $orderby: 'start/dateTime desc',
          $top: maxResults,
        },
      });

      const events = ((r.data as any).value || []).map(this.mapEvent);
      return {
        success: true,
        events,
        count: events.length,
        message: `Found ${events.length} Outlook event(s) matching "${query}"`,
      };
    } catch (error: any) {
      this.logger.error('Outlook searchEvents failed:', error?.response?.data ?? error.message);
      return { success: false, error: this.friendlyError(error) };
    }
  }

  async createEvent(
    userId: string | undefined,
    title: string,
    startTime: string,
    endTime: string,
    description?: string,
    location?: string,
    attendees?: string[],
  ) {
    try {
      const body: Record<string, unknown> = {
        subject: title,
        start: this.toGraphDateTime(startTime),
        end: this.toGraphDateTime(endTime),
      };
      if (description) body.body = { contentType: 'Text', content: description };
      if (location) body.location = { displayName: location };
      if (attendees?.length) {
        body.attendees = attendees.map(email => ({
          emailAddress: { address: email },
          type: 'required',
        }));
      }

      const r = await axios.post(`${GRAPH}/me/events`, body, {
        headers: await this.headers(userId),
      });

      const created = this.mapEvent(r.data);
      return {
        success: true,
        event: created,
        message: `Event "${title}" created on your Outlook calendar`,
      };
    } catch (error: any) {
      this.logger.error('Outlook createEvent failed:', error?.response?.data ?? error.message);
      return { success: false, error: this.friendlyError(error) };
    }
  }

  async updateEvent(
    userId: string | undefined,
    eventId: string,
    updates: {
      title?: string;
      startTime?: string;
      endTime?: string;
      description?: string;
      location?: string;
      attendees?: string[];
    },
  ) {
    try {
      const body: Record<string, unknown> = {};
      if (updates.title) body.subject = updates.title;
      if (updates.startTime) body.start = this.toGraphDateTime(updates.startTime);
      if (updates.endTime) body.end = this.toGraphDateTime(updates.endTime);
      if (updates.description) body.body = { contentType: 'Text', content: updates.description };
      if (updates.location) body.location = { displayName: updates.location };
      if (updates.attendees?.length) {
        body.attendees = updates.attendees.map(email => ({
          emailAddress: { address: email },
          type: 'required',
        }));
      }

      const r = await axios.patch(`${GRAPH}/me/events/${eventId}`, body, {
        headers: await this.headers(userId),
      });

      return {
        success: true,
        event: this.mapEvent(r.data),
        message: 'Outlook event updated',
      };
    } catch (error: any) {
      this.logger.error('Outlook updateEvent failed:', error?.response?.data ?? error.message);
      return { success: false, error: this.friendlyError(error) };
    }
  }

  async deleteEvent(userId: string | undefined, eventId: string) {
    try {
      await axios.delete(`${GRAPH}/me/events/${eventId}`, {
        headers: await this.headers(userId),
      });
      return { success: true, message: 'Outlook event deleted' };
    } catch (error: any) {
      this.logger.error('Outlook deleteEvent failed:', error?.response?.data ?? error.message);
      return { success: false, error: this.friendlyError(error) };
    }
  }

  private friendlyError(error: any): string {
    const graphMsg = error?.response?.data?.error?.message;
    const status = error?.response?.status;
    if (status === 403) {
      return 'Outlook calendar permission is missing. Open Settings and reconnect Outlook to grant calendar access.';
    }
    return graphMsg || error.message || 'Outlook calendar request failed';
  }
}
