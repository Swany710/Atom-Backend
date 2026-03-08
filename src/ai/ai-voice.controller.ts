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
  Req,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AIVoiceService } from './ai-voice.service';
import { Public } from '../decorators/public.decorator';
import type { Response as ExpressResponse } from 'express';

// ── Request / Response shapes ──────────────────────────────────────────────

interface TextRequest {
  /** Natural language message from the user */
  message: string;
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
   * Body: { message, conversationId? }
   * Returns: { message, conversationId, timestamp }
   */
  @Post('text')
  async handleText(@Body() body: TextRequest, @Req() req: any): Promise<TextResponse> {
    if (!body?.message?.trim()) {
      throw new BadRequestException('message is required');
    }

    // userId comes from the guard-injected atomUserId, never from the request body
    const userId: string = req.atomUserId;

    try {
      const result = await this.aiVoiceService.processTextCommand(
        body.message,
        userId,
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
   * Multipart form-data fields:
   *   audio          – audio file (required)
   *   conversationId – optional; pass to continue a thread
   *
   * Query param:
   *   returnAudio=true  – respond with audio/mpeg (TTS) instead of JSON
   *                       default is false (JSON)
   *
   * Always returns JSON unless ?returnAudio=true is explicitly set.
   * Response headers always include X-Transcription, X-Response-Text, X-Conversation-Id.
   * userId is always taken from the guard-injected req.atomUserId (never trusted from client).
   */
  @Post('voice')
  @UseInterceptors(FileInterceptor('audio'))
  async handleVoice(
    @UploadedFile() file: MulterFile,
    @Response() res: ExpressResponse,
    @Req() req: any,
    @Body('conversationId') bodyConversationId?: string,
    @Query('conversationId') queryConversationId?: string,
    @Query('returnAudio') returnAudio = 'false',
  ): Promise<void> {
    // userId comes from the guard-injected atomUserId, never from client input
    const userId: string = req.atomUserId;
    const conversationId = bodyConversationId ?? queryConversationId;

    if (!file) {
      res.status(400).json({ message: 'Audio file is required (field name: audio)' });
      return;
    }

    if (file.size < 1_000) {
      res.json({
        message: 'Audio too short — please speak for at least one second.',
        transcription: '[Too Short]',
        conversationId: conversationId ?? userId,
        timestamp: new Date().toISOString(),
      });
      return;
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
      res.status(500).json({
        message: 'Failed to process voice command',
        error: error.message,
      });
    }
  }

  // ── POST /ai/speak  ─────────────────────────────────────────────────────
  // Converts text to speech and returns audio/mpeg binary.
  // Body: { text: string, voice?: string }
  @Post('speak')
  async speak(
    @Body('text') text: string,
    @Body('voice') voice: string,
    @Response() res: ExpressResponse,
  ) {
    if (!text?.trim()) {
      return res.status(400).json({ error: 'text is required' });
    }
    try {
      const audio = await this.aiVoiceService.generateSpeech(
        text,
        (voice as any) || 'nova',
      );
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Cache-Control', 'no-store');
      res.send(audio);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
}
