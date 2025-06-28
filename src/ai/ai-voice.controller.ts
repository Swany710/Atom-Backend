// src/ai/ai-voice.controller.ts
import { Controller, Post, Body, Get, Logger } from '@nestjs/common';
import { AIVoiceService } from './ai-voice.service';

export class VoiceCommandDto {
  audio?: string;
  format?: string;
  message?: string;
}

export class TextCommandDto {
  message: string;
}

@Controller('ai')
export class AIVoiceController {
  private readonly logger = new Logger(AIVoiceController.name);

  constructor(private readonly aiVoiceService: AIVoiceService) {
    this.logger.log('AI Voice Controller initialized');
  }

  @Get('status')
  async getStatus() {
    const openaiConfigured = !!process.env.OPENAI_API_KEY;

    return {
      status: 'healthy',
      features: {
        voice_transcription: openaiConfigured,
        ai_processing: openaiConfigured,
      },
      endpoints: [
        'POST /ai/voice-command',
        'POST /ai/text-command',
        'GET /ai/status',
      ],
      timestamp: new Date().toISOString(),
    };
  }

  @Post('voice-command')
  async processVoiceCommand(@Body() dto: VoiceCommandDto) {
    this.logger.log('Processing voice command');

    try {
      if (dto.message && !dto.audio) {
        const result = await this.aiVoiceService.processMessage(dto.message);
        
        return {
          success: true,
          transcription: dto.message,
          response: result.response,
          timestamp: new Date().toISOString(),
        };
      } else if (dto.audio) {
        const audioBuffer = Buffer.from(dto.audio, 'base64');
        const result = await this.aiVoiceService.processVoiceCommand(audioBuffer);
        
        return result;
      } else {
        throw new Error('No audio or text provided');
      }

    } catch (error) {
      this.logger.error('Voice command failed:', error);
      
      return {
        success: false,
        error: error.message,
        transcription: '',
        response: 'Sorry, I encountered an error processing your request.',
        timestamp: new Date().toISOString(),
      };
    }
  }

  @Post('text-command')
  async processTextCommand(@Body() dto: TextCommandDto) {
    this.logger.log(`Processing text: "${dto.message}"`);

    try {
      const result = await this.aiVoiceService.processMessage(dto.message);

      return {
        success: true,
        message: dto.message,
        response: result.response,
        timestamp: new Date().toISOString(),
      };

    } catch (error) {
      this.logger.error('Text command failed:', error);
      
      return {
        success: false,
        error: error.message,
        response: 'Sorry, I encountered an error.',
        timestamp: new Date().toISOString(),
      };
    }
  }
}