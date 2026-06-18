import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from '@microsoft/microsoft-graph-client';
import { ClientSecretCredential } from '@azure/identity';
import 'isomorphic-fetch';

export interface CalendarEvent {
  id?: string;
  title: string;
  start: string;
  end: string;
  description?: string;
  location?: string;
  attendees?: string[];
  meetLink?: string;
}

export interface CheckCalendarResult {
  success: boolean;
  events?: CalendarEvent[];
  count?: number;
  message?: string;
  error?: string;
}

export interface CreateEventResult {
  success: boolean;
  event?: CalendarEvent;
  message?: string;
  error?: string;
}

@Injectable()
export class CalendarService {
  private readonly logger = new Logger(CalendarService.name);
  private graphClient: Client;

  constructor(private readonly config: ConfigService) {
    this.initializeMicrosoftGraph();
  }

  /**
   * Initialize Microsoft Graph API client
   * Uses Azure AD OAuth 2.0 with client credentials or delegated permissions
   */
  private initializeMicrosoftGraph() {
    try {
      const tenantId = this.config.get<string>('MICROSOFT_TENANT_ID');
      const clientId = this.config.get<string>('MICROSOFT_CLIENT_ID');
      const clientSecret = this.config.get<string>('MICROSOFT_CLIENT_SECRET');

      if (!tenantId || !clientId || !clientSecret) {
        this.logger.warn('Microsoft Calendar credentials not configured. Calendar features will be disabled.');
        return;
      }

      // Create credential for app-only authentication
      const credential = new ClientSecretCredential(
        tenantId,
        clientId,
        clientSecret
      );

      // Initialize Graph client
      this.graphClient = Client.initWithMiddleware({
        authProvider: {
          getAccessToken: async () => {
            const token = await credential.getToken('https://graph.microsoft.com/.default');
            return token.token;
          },
        },
      });

      this.logger.log('Microsoft Graph API (Calendar) initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize Microsoft Graph API:', error);
    }
  }

  /**
   * Check calendar for events within a date range
   */
  async checkCalendar(
    startDate: string,
    endDate?: string,
    searchQuery?: string,
    userId?: string,
  ): Promise<CheckCalendarResult> {
    if (!this.graphClient) {
      return {
        success: false,
        error: 'Calendar API not initialized. Please configure Microsoft credentials.',
      };
    }

    try {
      this.logger.log(`Checking calendar from ${startDate} to ${endDate || startDate}`);

      // Parse dates and ensure they're in ISO format
      const timeMin = new Date(startDate).toISOString();
      const timeMax = endDate
        ? new Date(endDate).toISOString()
        : new Date(new Date(startDate).getTime() + 24 * 60 * 60 * 1000).toISOString();

      // Build filter query
      let filter = `start/dateTime ge '${timeMin}' and end/dateTime le '${timeMax}'`;

      // Get user ID from config or use default
      const userPrincipalName = userId || this.config.get<string>('MICROSOFT_USER_EMAIL');

      // Fetch calendar events
      let request = this.graphClient
        .api(`/users/${userPrincipalName}/calendar/events`)
        .filter(filter)
        .orderby('start/dateTime')
        .top(50)
        .select('subject,start,end,location,attendees,onlineMeetingUrl,bodyPreview,id');

      // Add search if provided
      if (searchQuery) {
        request = request.search(`"${searchQuery}"`);
      }

      const response = await request.get();
      const items = response.value || [];

      const events: CalendarEvent[] = items.map((event: any) => ({
        id: event.id,
        title: event.subject || 'Untitled Event',
        start: event.start?.dateTime,
        end: event.end?.dateTime,
        description: event.bodyPreview,
        location: event.location?.displayName,
        attendees: event.attendees?.map((a: any) => a.emailAddress.address) || [],
        meetLink: event.onlineMeetingUrl,
      }));

      this.logger.log(`Found ${events.length} calendar events`);

      return {
        success: true,
        events,
        count: events.length,
        message: events.length > 0
          ? `Found ${events.length} event(s)`
          : 'No events found for the specified time period',
      };
    } catch (error) {
      this.logger.error('Error checking calendar:', error);
      return {
        success: false,
        error: error.message || 'Failed to check calendar',
      };
    }
  }

  /**
   * Create a new calendar event
   */
  async createCalendarEvent(
    title: string,
    startTime: string,
    endTime: string,
    description?: string,
    attendees?: string[],
    location?: string,
    userId?: string,
  ): Promise<CreateEventResult> {
    if (!this.graphClient) {
      return {
        success: false,
        error: 'Calendar API not initialized. Please configure Microsoft credentials.',
      };
    }

    try {
      this.logger.log(`Creating calendar event: ${title}`);

      const userPrincipalName = userId || this.config.get<string>('MICROSOFT_USER_EMAIL');

      const event = {
        subject: title,
        body: {
          contentType: 'text',
          content: description || '',
        },
        start: {
          dateTime: new Date(startTime).toISOString(),
          timeZone: 'UTC',
        },
        end: {
          dateTime: new Date(endTime).toISOString(),
          timeZone: 'UTC',
        },
        location: location ? {
          displayName: location,
        } : undefined,
        attendees: attendees?.map(email => ({
          emailAddress: { address: email },
          type: 'required',
        })),
        isOnlineMeeting: true, // Enable Teams meeting
        onlineMeetingProvider: 'teamsForBusiness',
      };

      const response = await this.graphClient
        .api(`/users/${userPrincipalName}/calendar/events`)
        .post(event);

      this.logger.log(`Calendar event created successfully: ${response.id}`);

      return {
        success: true,
        event: {
          id: response.id,
          title: response.subject,
          start: response.start?.dateTime,
          end: response.end?.dateTime,
          description: response.bodyPreview,
          location: response.location?.displayName,
          attendees: response.attendees?.map((a: any) => a.emailAddress.address) || [],
          meetLink: response.onlineMeetingUrl,
        },
        message: `Event "${title}" created successfully with Teams meeting link`,
      };
    } catch (error) {
      this.logger.error('Error creating calendar event:', error);
      return {
        success: false,
        error: error.message || 'Failed to create calendar event',
      };
    }
  }

  /**
   * Update an existing calendar event
   */
  async updateCalendarEvent(
    eventId: string,
    updates: Partial<CalendarEvent>,
    userId?: string,
  ): Promise<CreateEventResult> {
    if (!this.graphClient) {
      return {
        success: false,
        error: 'Calendar API not initialized. Please configure Microsoft credentials.',
      };
    }

    try {
      this.logger.log(`Updating calendar event: ${eventId}`);

      const userPrincipalName = userId || this.config.get<string>('MICROSOFT_USER_EMAIL');

      // Build update object
      const updateData: any = {};
      if (updates.title) updateData.subject = updates.title;
      if (updates.description) {
        updateData.body = {
          contentType: 'text',
          content: updates.description,
        };
      }
      if (updates.location) {
        updateData.location = {
          displayName: updates.location,
        };
      }
      if (updates.start) {
        updateData.start = {
          dateTime: new Date(updates.start).toISOString(),
          timeZone: 'UTC',
        };
      }
      if (updates.end) {
        updateData.end = {
          dateTime: new Date(updates.end).toISOString(),
          timeZone: 'UTC',
        };
      }
      if (updates.attendees) {
        updateData.attendees = updates.attendees.map(email => ({
          emailAddress: { address: email },
          type: 'required',
        }));
      }

      const response = await this.graphClient
        .api(`/users/${userPrincipalName}/calendar/events/${eventId}`)
        .patch(updateData);

      return {
        success: true,
        event: {
          id: response.id,
          title: response.subject,
          start: response.start?.dateTime,
          end: response.end?.dateTime,
          description: response.bodyPreview,
          location: response.location?.displayName,
          attendees: response.attendees?.map((a: any) => a.emailAddress.address) || [],
          meetLink: response.onlineMeetingUrl,
        },
        message: 'Event updated successfully',
      };
    } catch (error) {
      this.logger.error('Error updating calendar event:', error);
      return {
        success: false,
        error: error.message || 'Failed to update calendar event',
      };
    }
  }

  /**
   * Delete a calendar event
   */
  async deleteCalendarEvent(
    eventId: string,
    userId?: string,
  ): Promise<{ success: boolean; message?: string; error?: string }> {
    if (!this.graphClient) {
      return {
        success: false,
        error: 'Calendar API not initialized. Please configure Microsoft credentials.',
      };
    }

    try {
      this.logger.log(`Deleting calendar event: ${eventId}`);

      const userPrincipalName = userId || this.config.get<string>('MICROSOFT_USER_EMAIL');

      await this.graphClient
        .api(`/users/${userPrincipalName}/calendar/events/${eventId}`)
        .delete();

      return {
        success: true,
        message: 'Event deleted successfully',
      };
    } catch (error) {
      this.logger.error('Error deleting calendar event:', error);
      return {
        success: false,
        error: error.message || 'Failed to delete calendar event',
      };
    }
  }
}
