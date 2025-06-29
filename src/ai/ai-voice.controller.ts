// src/ai/ai-voice.controller.ts - UPDATED WITH MEMORY SUPPORT
import { Controller, Post, Body, Get, Logger } from '@nestjs/common';
import { AIVoiceService, ConversationPayload } from './ai-voice.service';

export class VoiceCommandDto {
  audio?: string;      // backend expects this
  audioData?: string;  // frontend sends this
  format?: string;
  message?: string;
  conversation?: ConversationPayload; // NEW: conversation context
  userId?: string; // NEW: user identification
}

export class TextCommandDto {
  message: string;
  conversation?: ConversationPayload; // NEW: conversation context
  userId?: string; // NEW: user identification
}

@Controller('ai')
export class AIVoiceController {
  private readonly logger = new Logger(AIVoiceController.name);

  constructor(private readonly aiVoiceService: AIVoiceService) {
    this.logger.log('AI Voice Controller initialized with memory support');
  }

  @Get('status')
  async getStatus() {
    const openaiConfigured = !!process.env.OPENAI_API_KEY;

    return {
      status: 'healthy',
      features: {
        voice_transcription: openaiConfigured,
        ai_processing: openaiConfigured,
        conversation_memory: true, // NEW: memory feature
        persistent_storage: true, // NEW: Supabase storage
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
    this.logger.log('Processing voice command with memory support');
    
    // FIXED: Handle both 'audio' and 'audioData' field names
    const audioData = dto.audio || dto.audioData;
    const userId = dto.userId || 'default-user';
    
    this.logger.log(`Received DTO: ${JSON.stringify({
      hasAudio: !!audioData,
      audioLength: audioData?.length || 0,
      hasMessage: !!dto.message,
      message: dto.message,
      format: dto.format,
      hasConversation: !!dto.conversation,
      conversationSessionId: dto.conversation?.sessionId,
      userId: userId,
      dtoKeys: Object.keys(dto || {})
    })}`);

    try {
      if (dto.message && !audioData) {
        this.logger.log('Processing as text input with memory');
        const result = await this.aiVoiceService.processTextCommand(
          dto.message,
          dto.conversation,
          userId
        );
        
        return {
          success: result.success,
          transcription: result.transcription,
          response: result.response,
          actions: result.actions || [],
          error: result.error,
          timestamp: result.timestamp,
        };
      } else if (audioData) {
        this.logger.log(`Processing as audio input with memory, length: ${audioData.length}`);
        const audioBuffer = Buffer.from(audioData, 'base64');
        this.logger.log(`Audio buffer size: ${audioBuffer.length} bytes`);
        
        const result = await this.aiVoiceService.processVoiceCommand(
          audioBuffer,
          dto.conversation,
          userId
        );
        
        return {
          success: result.success,
          transcription: result.transcription,
          response: result.response,
          actions: result.actions || [],
          error: result.error,
          timestamp: result.timestamp,
        };
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
        actions: [],
        timestamp: new Date().toISOString(),
      };
    }
  }

  @Post('text-command')
  async processTextCommand(@Body() dto: TextCommandDto) {
    this.logger.log('Processing text command with memory support');
    const userId = dto.userId || 'default-user';

    this.logger.log(`Text command: "${dto.message}" for user: ${userId}`);
    this.logger.log(`Has conversation context: ${!!dto.conversation}`);

    try {
      const result = await this.aiVoiceService.processTextCommand(
        dto.message,
        dto.conversation,
        userId
      );

      return {
        success: result.success,
        transcription: result.transcription,
        response: result.response,
        actions: result.actions || [],
        error: result.error,
        timestamp: result.timestamp,
      };

    } catch (error) {
      this.logger.error('Text command failed:', error);
      
      return {
        success: false,
        error: error.message,
        transcription: dto.message,
        response: 'Sorry, I encountered an error processing your request.',
        actions: [],
        timestamp: new Date().toISOString(),
      };
    }
  }

  // Legacy endpoint for backward compatibility
  @Post('process-message')
  async processMessage(@Body() body: { message: string }) {
    this.logger.log('Processing legacy message format');
    
    try {
      const result = await this.aiVoiceService.processMessage(body.message);
      return result;
    } catch (error) {
      this.logger.error('Legacy message processing failed:', error);
      return {
        response: 'Sorry, I encountered an error processing your message.'
      };
    }
  }
}