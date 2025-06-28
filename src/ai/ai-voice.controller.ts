// src/ai/ai-voice.controller.ts - DEBUG VERSION
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
    
    // DEBUG: Log what we actually received
    this.logger.log(`Received DTO: ${JSON.stringify({
      hasAudio: !!dto.audio,
      audioLength: dto.audio?.length || 0,
      hasMessage: !!dto.message,
      message: dto.message,
      format: dto.format,
      dtoKeys: Object.keys(dto || {}),
      dtoType: typeof dto
    })}`);

    try {
      if (dto.message && !dto.audio) {
        this.logger.log('Processing as text input');
        const result = await this.aiVoiceService.processMessage(dto.message);
        
        return {
          success: true,
          transcription: dto.message,
          response: result.response,
          timestamp: new Date().toISOString(),
        };
      } else if (dto.audio) {
        this.logger.log(`Processing as audio input, length: ${dto.audio.length}`);
        const audioBuffer = Buffer.from(dto.audio, 'base64');
        this.logger.log(`Audio buffer size: ${audioBuffer.length} bytes`);
        
        const result = await this.aiVoiceService.processVoiceCommand(audioBuffer);
        
        return result;
      } else {
        this.logger.error(`No audio or text provided. DTO: ${JSON.stringify(dto)}`);
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