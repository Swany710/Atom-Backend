// src/ai/ai-voice.controller.ts
import { Controller, Post, Body, Get, BadRequestException, Logger } from '@nestjs/common';
import { AIVoiceService } from './ai-voice.service';
import { N8NService } from '../n8n/n8n.service';

@Controller('ai')
export class AIVoiceController {
  private readonly logger = new Logger(AIVoiceController.name);

  constructor(
    private aiVoiceService: AIVoiceService,
    private n8nService: N8NService,
  ) {}

  @Post('voice-command')
  async processVoiceCommand(@Body() dto: any) {
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

  @Post('text-command')
  async processTextCommand(@Body() body: { message: string }) {
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
@Get('test')
async simpleTest() {
  return { 
    message: 'AI Controller is working!', 
    timestamp: new Date().toISOString() 
  };
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
