// src/ai/ai-voice.controller.ts
import { 
  Controller, 
  Post, 
  Body, 
  Get,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Logger 
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AIVoiceService } from './ai-voice.service';
import { N8NService } from '../n8n/n8n.service';

interface VoiceCommandDto {
  textInput?: string;
  audioData?: string; // base64 encoded audio
}

interface VoiceCommandResponse {
  success: boolean;
  response: string;
  transcription?: string;
  actions: any[];
  confidence: number;
  timestamp: string;
}

@Controller('ai')
export class AIVoiceController {
  private readonly logger = new Logger(AIVoiceController.name);

  constructor(
    private aiVoiceService: AIVoiceService,
    private n8nService: N8NService,
  ) {}

  @Post('voice-command')
  async processVoiceCommand(@Body() dto: VoiceCommandDto): Promise<VoiceCommandResponse> {
    try {
      let transcription: string | undefined;

      // Handle audio data if provided
      if (dto.audioData) {
        const audioBuffer = Buffer.from(dto.audioData, 'base64');
        transcription = await this.aiVoiceService.transcribeAudio(audioBuffer);
      }

      // Process the command
      const result = await this.aiVoiceService.processVoiceCommand({
        transcription,
        textInput: dto.textInput
      });

      return {
        success: result.success,
        response: result.response,
        transcription,
        actions: result.actions,
        confidence: result.confidence,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      this.logger.error('Voice command processing failed:', error);
      throw new BadRequestException('Failed to process voice command');
    }
  }

  @Post('voice-audio')
  @UseInterceptors(FileInterceptor('audio'))
  async processVoiceAudio(@UploadedFile() file: Express.Multer.File): Promise<VoiceCommandResponse> {
    if (!file) {
      throw new BadRequestException('No audio file provided');
    }

    try {
      // Transcribe the audio
      const transcription = await this.aiVoiceService.transcribeAudio(file.buffer);

      // Process the transcription
      const result = await this.aiVoiceService.processVoiceCommand({
        transcription
      });

      return {
        success: result.success,
        response: result.response,
        transcription,
        actions: result.actions,
        confidence: result.confidence,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      this.logger.error('Audio processing failed:', error);
      throw new BadRequestException('Failed to process audio');
    }
  }

  @Post('text-command')
  async processTextCommand(@Body() body: { message: string }): Promise<VoiceCommandResponse> {
    if (!body.message) {
      throw new BadRequestException('Message is required');
    }

    try {
      const result = await this.aiVoiceService.processVoiceCommand({
        textInput: body.message
      });

      return {
        success: result.success,
        response: result.response,
        actions: result.actions,
        confidence: result.confidence,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      this.logger.error('Text command processing failed:', error);
      throw new BadRequestException('Failed to process text command');
    }
  }

  @Get('test-n8n')
  async testN8NConnections() {
    try {
      const connections = await this.n8nService.testConnections();
      
      return {
        success: true,
        connections,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      this.logger.error('N8N connection test failed:', error);
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  @Post('test-calendar')
  async testCalendarWorkflow(@Body() body: { title: string; startDateTime: string }) {
    try {
      const result = await this.n8nService.executeCalendarWorkflow({
        title: body.title || 'Test Event',
        startDateTime: body.startDateTime || new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        description: 'Test event created via API'
      });

      return {
        success: result.success,
        result: result.result,
        error: result.error,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      this.logger.error('Calendar test failed:', error);
      throw new BadRequestException('Calendar test failed');
    }
  }

  @Post('test-email')
  async testEmailWorkflow(@Body() body: { to: string; subject: string; body: string }) {
    try {
      const result = await this.n8nService.executeEmailWorkflow({
        to: body.to || 'test@example.com',
        subject: body.subject || 'Test Email',
        body: body.body || 'This is a test email sent via the API'
      });

      return {
        success: result.success,
        result: result.result,
        error: result.error,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      this.logger.error('Email test failed:', error);
      throw new BadRequestException('Email test failed');
    }
  }

  @Post('test-reminder')
  async testReminderWorkflow(@Body() body: { title: string; remindAt: string }) {
    try {
      const result = await this.n8nService.executeReminderWorkflow({
        title: body.title || 'Test Reminder',
        remindAt: body.remindAt || new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        message: 'This is a test reminder created via API'
      });

      return {
        success: result.success,
        result: result.result,
        error: result.error,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      this.logger.error('Reminder test failed:', error);
      throw new BadRequestException('Reminder test failed');
    }
  }

  @Get('status')
  async getStatus() {
    try {
      const n8nConnections = await this.n8nService.testConnections();
      
      return {
        status: 'healthy',
        features: {
          voice_transcription: !!process.env.OPENAI_API_KEY,
          ai_processing: !!process.env.OPENAI_API_KEY,
          n8n_calendar: n8nConnections.calendar,
          n8n_email: n8nConnections.email,
          n8n_reminder: n8nConnections.reminder
        },
        endpoints: [
          'POST /api/v1/ai/voice-command - Process voice or text commands',
          'POST /api/v1/ai/voice-audio - Upload audio file',
          'POST /api/v1/ai/text-command - Process text commands',
          'GET /api/v1/ai/test-n8n - Test N8N connections',
          'GET /api/v1/ai/status - Get service status'
        ],
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      this.logger.error('Status check failed:', error);
      return {
        status: 'error',
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }
}