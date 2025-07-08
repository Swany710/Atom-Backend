import {
  Controller,
  Post,
  Get,
  Body,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
  HttpException,
  HttpStatus,
  Query,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AIVoiceService } from './ai-voice.service';

// Interfaces for request/response
interface TextCommandRequest {
  message: string;
  userId?: string;
  conversationId?: string;
}

interface VoiceCommandResponse {
  message: string;
  transcription: string;
  conversationId: string;
  timestamp: Date;
}

interface TextCommandResponse {
  message: string;
  conversationId: string;
  timestamp: Date;
}

interface MulterFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

@Controller('api/v1/ai')
export class AIVoiceController {
  constructor(private readonly aiVoiceService: AIVoiceService) {}

  @Get('health')
  getHealth() {
    return { 
      status: 'ok', 
      service: 'AI Voice Service',
      timestamp: new Date().toISOString()
    };
  }

  @Get('status') 
  getStatus() {
    return {
      status: 'available',
      aiService: 'online',
      timestamp: new Date().toISOString()
    };
  }

  @Post('text')
  async handleTextCommand(@Body() body: TextCommandRequest): Promise<TextCommandResponse> {
    if (!body.message) {
      throw new BadRequestException('Message is required');
    }

    try {
      const result = await this.aiVoiceService.processTextCommand(
        body.message,
        body.userId || 'default-user',
        body.conversationId
      );

      return {
        message: result.response,
        conversationId: result.conversationId,
        timestamp: new Date(),
      };
    } catch (error) {
      console.error('Text command error:', error);
      throw new HttpException(
        {
          message: 'Failed to process text command', 
          error: error.message,
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
  @Post('process')
  async processVoiceInput(
    @Body() body: { prompt: string; sessionId: string /* + other fields if needed */ }
  ): Promise<any> {
    const { prompt, sessionId } = body;
    
    if (!sessionId || !prompt) {
      throw new BadRequestException('sessionId and prompt are required');
    }

    const result = await this.aiVoiceService.processPrompt(prompt, sessionId);
    return { response: result };
  }

  @Post('voice')
  @UseInterceptors(FileInterceptor('audio'))
  async handleVoiceCommand(
    @UploadedFile() file: MulterFile,
    @Query('userId') userId: string = 'default-user',
    @Query('conversationId') conversationId?: string
  ): Promise<VoiceCommandResponse> {
    if (!file) {
      throw new BadRequestException('Audio file is required');
    }

    try {
      const result = await this.aiVoiceService.processVoiceCommand(
        file.buffer,
        userId,
        conversationId
      );

      return {
        message: result.response,
        transcription: result.transcription,
        conversationId: result.conversationId,
        timestamp: new Date(),
      };
    } catch (error) {
      console.error('Voice command error:', error);
      throw new HttpException(
        'Failed to process voice command',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
}