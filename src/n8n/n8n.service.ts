 
// src/n8n/n8n.service.ts
// Copy this entire file content
import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

interface WorkflowResult {
  success: boolean;
  workflowName: string;
  result?: any;
  error?: string;
}

@Injectable()
export class N8NService {
  private readonly logger = new Logger(N8NService.name);

  constructor(
    private httpService: HttpService,
    private configService: ConfigService,
  ) {}

  async executeCalendarWorkflow(data: {
    title: string;
    startDateTime: string;
    endDateTime?: string;
    description?: string;
    attendees?: string[];
    location?: string;
  }): Promise<WorkflowResult> {
    const webhookUrl = this.configService.get('N8N_CALENDAR_WEBHOOK_URL');
    
    if (!webhookUrl) {
      return {
        success: false,
        workflowName: 'calendar',
        error: 'Calendar webhook URL not configured'
      };
    }

    try {
      this.logger.log(`Executing calendar workflow: ${data.title}`);
      
      const response = await firstValueFrom(
        this.httpService.post(webhookUrl, {
          ...data,
          timestamp: new Date().toISOString()
        })
      );

      return {
        success: true,
        workflowName: 'calendar',
        result: response.data
      };
    } catch (error) {
      this.logger.error('Calendar workflow failed:', error.message);
      return {
        success: false,
        workflowName: 'calendar',
        error: error.message
      };
    }
  }

  async executeEmailWorkflow(data: {
    to: string;
    subject: string;
    body: string;
    cc?: string[];
    priority?: string;
  }): Promise<WorkflowResult> {
    const webhookUrl = this.configService.get('N8N_EMAIL_WEBHOOK_URL');
    
    if (!webhookUrl) {
      return {
        success: false,
        workflowName: 'email',
        error: 'Email webhook URL not configured'
      };
    }

    try {
      this.logger.log(`Executing email workflow: ${data.subject}`);
      
      const response = await firstValueFrom(
        this.httpService.post(webhookUrl, {
          ...data,
          timestamp: new Date().toISOString()
        })
      );

      return {
        success: true,
        workflowName: 'email',
        result: response.data
      };
    } catch (error) {
      this.logger.error('Email workflow failed:', error.message);
      return {
        success: false,
        workflowName: 'email',
        error: error.message
      };
    }
  }

  async executeReminderWorkflow(data: {
    title: string;
    message?: string;
    remindAt: string;
    type?: string;
    priority?: string;
  }): Promise<WorkflowResult> {
    const webhookUrl = this.configService.get('N8N_REMINDER_WEBHOOK_URL');
    
    if (!webhookUrl) {
      return {
        success: false,
        workflowName: 'reminder',
        error: 'Reminder webhook URL not configured'
      };
    }

    try {
      this.logger.log(`Executing reminder workflow: ${data.title}`);
      
      const response = await firstValueFrom(
        this.httpService.post(webhookUrl, {
          ...data,
          timestamp: new Date().toISOString()
        })
      );

      return {
        success: true,
        workflowName: 'reminder',
        result: response.data
      };
    } catch (error) {
      this.logger.error('Reminder workflow failed:', error.message);
      return {
        success: false,
        workflowName: 'reminder',
        error: error.message
      };
    }
  }

  async testConnections(): Promise<{ [key: string]: boolean }> {
    const tests = {
      calendar: !!this.configService.get('N8N_CALENDAR_WEBHOOK_URL'),
      email: !!this.configService.get('N8N_EMAIL_WEBHOOK_URL'),
      reminder: !!this.configService.get('N8N_REMINDER_WEBHOOK_URL')
    };

    this.logger.log('N8N connection test results:', tests);
    return tests;
  }
}