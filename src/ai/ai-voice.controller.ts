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
  Response,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AIVoiceService } from './ai-voice.service';
import { Public } from '../decorators/public.decorator';
import type { Response as ExpressResponse } from 'express';

// ── Request / Response shapes ──────────────────────────────────────────────

interface TextRequest {
  /** Natural language message from the user */
  message: string;
  /** Caller-assigned user identifier (defaults to 'default-user') */
  userId?: string;
  /** Pass an existing conversation ID to continue a thread */
  conversationId?: string;
}

interface TextResponse {
  message: string;
  conversationId: string;
  timestamp: string;
}

interface VoiceResponse {
  message: string;
  transcription: string;
  conversationId: string;
  timestamp: string;
}

interface MulterFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

// ── Controller ─────────────────────────────────────────────────────────────

/**
 * Canonical AI endpoints:
 *
 *   GET  /api/v1/ai/health          – liveness probe (public, no auth)
 *   POST /api/v1/ai/text            – text in → text out
 *   POST /api/v1/ai/voice           – audio file in → JSON or audio/mpeg out
 */
@Controller('api/v1/ai')
export class AIVoiceController {
  constructor(private readonly aiVoiceService: AIVoiceService) {}

  // ── Health (public — used by load-balancers and the test client) ─────────
  @Public()
  @Get('health')
  getHealth() {
    return {
      status: 'ok',
      service: 'Atom AI',
      timestamp: new Date().toISOString(),
    };
  }

  // ── Text ─────────────────────────────────────────────────────────────────
  /**
   * POST /api/v1/ai/text
   * Body: { message, userId?, conversationId? }
   * Returns: { message, conversationId, timestamp }
   */
  @Post('text')
  async handleText(@Body() body: TextRequest): Promise<TextResponse> {
    if (!body?.message?.trim()) {
      throw new BadRequestException('message is required');
    }

    try {
      const result = await this.aiVoiceService.processTextCommand(
        body.message,
        body.userId ?? 'default-user',
        body.conversationId,
      );

      return {
        message: result.response,
        conversationId: result.conversationId,
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      throw new HttpException(
        { message: 'Failed to process text command', error: error.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // ── Voice ─────────────────────────────────────────────────────────────────
  /**
   * POST /api/v1/ai/voice
   * Multipart form-data: audio file in field "audio"
   * Query params: userId?, conversationId?, returnAudio=true|false
   *
   * Returns audio/mpeg when returnAudio=true and TTS succeeded;
   * otherwise returns JSON VoiceResponse.
   * Response headers always include X-Transcription, X-Response-Text, X-Conversation-Id.
   */
  @Post('voice')
  @UseInterceptors(FileInterceptor('audio'))
  async handleVoice(
    @UploadedFile() file: MulterFile,
    @Response() res: ExpressResponse,
    @Query('userId') userId = 'default-user',
    @Query('conversationId') conversationId?: string,
    @Query('returnAudio') returnAudio = 'true',
  ): Promise<void> {
    if (!file) {
      throw new BadRequestException('Audio file is required (field name: audio)');
    }

    try {
      const result = await this.aiVoiceService.processVoiceCommand(
        file.buffer,
        userId,
        conversationId,
      );

      // Always expose metadata headers regardless of response type
      res.setHeader('X-Transcription', result.transcription ?? '');
      res.setHeader('X-Response-Text', result.response ?? '');
      res.setHeader('X-Conversation-Id', result.conversationId ?? '');

      if (returnAudio === 'true' && result.audioResponse) {
        res.setHeader('Content-Type', 'audio/mpeg');
        res.send(result.audioResponse);
        return;
      }

      const body: VoiceResponse = {
        message: result.response,
        transcription: result.transcription ?? '',
        conversationId: result.conversationId,
        timestamp: new Date().toISOString(),
      };
      res.json(body);
    } catch (error: any) {
      throw new HttpException(
        { message: 'Failed to process voice command', error: error.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
