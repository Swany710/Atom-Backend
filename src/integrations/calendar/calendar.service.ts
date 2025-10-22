import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';

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
  private calendar: any;
  private oauth2Client: OAuth2Client;

  constructor(private readonly config: ConfigService) {
    this.initializeGoogleCalendar();
  }

  /**
   * Initialize Google Calendar API client
   * Supports both OAuth 2.0 and Service Account authentication
   */
  private initializeGoogleCalendar() {
    try {
      const clientId = this.config.get<string>('GOOGLE_CLIENT_ID');
      const clientSecret = this.config.get<string>('GOOGLE_CLIENT_SECRET');
      const refreshToken = this.config.get<string>('GOOGLE_REFRESH_TOKEN');

      if (!clientId || !clientSecret) {
        this.logger.warn('Google Calendar credentials not configured. Calendar features will be disabled.');
        return;
      }

      // Initialize OAuth2 client
      this.oauth2Client = new google.auth.OAuth2(
        clientId,
        clientSecret,
        'http://localhost:3000/auth/google/callback' // Redirect URI
      );

      // Set refresh token if available
      if (refreshToken) {
        this.oauth2Client.setCredentials({
          refresh_token: refreshToken,
        });
      }

      // Initialize Calendar API
      this.calendar = google.calendar({
        version: 'v3',
        auth: this.oauth2Client,
      });

      this.logger.log('Google Calendar API initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize Google Calendar API:', error);
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
    if (!this.calendar) {
      return {
        success: false,
        error: 'Calendar API not initialized. Please configure Google credentials.',
      };
    }

    try {
      this.logger.log(`Checking calendar from ${startDate} to ${endDate || startDate}`);

      // Parse dates and ensure they're in ISO format
      const timeMin = new Date(startDate).toISOString();
      const timeMax = endDate
        ? new Date(endDate).toISOString()
        : new Date(new Date(startDate).getTime() + 24 * 60 * 60 * 1000).toISOString(); // +1 day

      const response = await this.calendar.events.list({
        calendarId: 'primary',
        timeMin,
        timeMax,
        singleEvents: true,
        orderBy: 'startTime',
        q: searchQuery, // Search term
        maxResults: 50,
      });

      const items = response.data.items || [];

      const events: CalendarEvent[] = items.map((event: any) => ({
        id: event.id,
        title: event.summary || 'Untitled Event',
        start: event.start?.dateTime || event.start?.date,
        end: event.end?.dateTime || event.end?.date,
        description: event.description,
        location: event.location,
        attendees: event.attendees?.map((a: any) => a.email) || [],
        meetLink: event.hangoutLink || event.conferenceData?.entryPoints?.[0]?.uri,
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
    if (!this.calendar) {
      return {
        success: false,
        error: 'Calendar API not initialized. Please configure Google credentials.',
      };
    }

    try {
      this.logger.log(`Creating calendar event: ${title}`);

      const event = {
        summary: title,
        description,
        location,
        start: {
          dateTime: new Date(startTime).toISOString(),
          timeZone: 'America/New_York', // TODO: Make configurable per user
        },
        end: {
          dateTime: new Date(endTime).toISOString(),
          timeZone: 'America/New_York',
        },
        attendees: attendees?.map(email => ({ email })),
        reminders: {
          useDefault: true,
        },
        // Enable Google Meet for the event
        conferenceData: {
          createRequest: {
            requestId: `meet-${Date.now()}`,
            conferenceSolutionKey: { type: 'hangoutsMeet' },
          },
        },
      };

      const response = await this.calendar.events.insert({
        calendarId: 'primary',
        resource: event,
        conferenceDataVersion: 1, // Enable conference data
        sendUpdates: attendees && attendees.length > 0 ? 'all' : 'none',
      });

      const createdEvent = response.data;

      this.logger.log(`Calendar event created successfully: ${createdEvent.id}`);

      return {
        success: true,
        event: {
          id: createdEvent.id,
          title: createdEvent.summary,
          start: createdEvent.start?.dateTime || createdEvent.start?.date,
          end: createdEvent.end?.dateTime || createdEvent.end?.date,
          description: createdEvent.description,
          location: createdEvent.location,
          attendees: createdEvent.attendees?.map((a: any) => a.email) || [],
          meetLink: createdEvent.hangoutLink,
        },
        message: `Event "${title}" created successfully`,
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
    if (!this.calendar) {
      return {
        success: false,
        error: 'Calendar API not initialized. Please configure Google credentials.',
      };
    }

    try {
      this.logger.log(`Updating calendar event: ${eventId}`);

      // Build update object
      const updateData: any = {};
      if (updates.title) updateData.summary = updates.title;
      if (updates.description) updateData.description = updates.description;
      if (updates.location) updateData.location = updates.location;
      if (updates.start) {
        updateData.start = {
          dateTime: new Date(updates.start).toISOString(),
          timeZone: 'America/New_York',
        };
      }
      if (updates.end) {
        updateData.end = {
          dateTime: new Date(updates.end).toISOString(),
          timeZone: 'America/New_York',
        };
      }
      if (updates.attendees) {
        updateData.attendees = updates.attendees.map(email => ({ email }));
      }

      const response = await this.calendar.events.patch({
        calendarId: 'primary',
        eventId,
        resource: updateData,
        sendUpdates: updates.attendees ? 'all' : 'none',
      });

      const updatedEvent = response.data;

      return {
        success: true,
        event: {
          id: updatedEvent.id,
          title: updatedEvent.summary,
          start: updatedEvent.start?.dateTime || updatedEvent.start?.date,
          end: updatedEvent.end?.dateTime || updatedEvent.end?.date,
          description: updatedEvent.description,
          location: updatedEvent.location,
          attendees: updatedEvent.attendees?.map((a: any) => a.email) || [],
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
  async deleteCalendarEvent(eventId: string, userId?: string): Promise<{ success: boolean; message?: string; error?: string }> {
    if (!this.calendar) {
      return {
        success: false,
        error: 'Calendar API not initialized. Please configure Google credentials.',
      };
    }

    try {
      this.logger.log(`Deleting calendar event: ${eventId}`);

      await this.calendar.events.delete({
        calendarId: 'primary',
        eventId,
        sendUpdates: 'all',
      });

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

  /**
   * Get authorization URL for OAuth flow
   * Use this to get user consent for calendar access
   */
  getAuthUrl(): string {
    const scopes = [
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.events',
    ];

    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      prompt: 'consent', // Force to get refresh token
    });
  }

  /**
   * Exchange authorization code for tokens
   */
  async handleAuthCallback(code: string): Promise<{ success: boolean; tokens?: any; error?: string }> {
    try {
      const { tokens } = await this.oauth2Client.getToken(code);
      this.oauth2Client.setCredentials(tokens);

      this.logger.log('Successfully obtained Google Calendar tokens');
      this.logger.log('IMPORTANT: Save this refresh token to your .env file:');
      this.logger.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`);

      return {
        success: true,
        tokens,
      };
    } catch (error) {
      this.logger.error('Error handling auth callback:', error);
      return {
        success: false,
        error: error.message || 'Failed to exchange auth code',
      };
    }
  }
}
