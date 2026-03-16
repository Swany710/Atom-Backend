import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Query,
  Response,
  Req,
  Param,
} from '@nestjs/common';

import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { VoiceService } from './voice.service';
import { ConversationMemoryService } from '../conversations/conversation-memory.service';
import { Public } from '../decorators/public.decorator';
import type { Response as ExpressResponse } from 'express';

// ── Request / Response shapes ──────────────────────────────────────────────

interface TextRequest {
  message: string;
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
 * VoiceController — all AI + conversation endpoints.
 *
 *   GET    /api/v1/ai/health
 *   POST   /api/v1/ai/text
 *   POST   /api/v1/ai/voice
 *   POST   /api/v1/ai/voice-command   (legacy — kept for frontend backwards compat)
 *   POST   /api/v1/ai/speak
 *   GET    /api/v1/ai/conversations/:id
 *   DELETE /api/v1/ai/conversations/:id
 */
@ApiTags('AI')
@Controller('api/v1/ai')
export class VoiceController {
  constructor(
    private readonly voiceService: VoiceService,
    private readonly memory: ConversationMemoryService,
  ) {}

  private userId(req: any): string {
    return req.atomUserId ?? process.env.OWNER_USER_ID ?? 'owner';
  }

  private safeHeader(value: string, maxLen = 500): string {
    return (value ?? '')
      .replace(/[\r\n\t]/g, ' ')
      .replace(/[^\x20-\x7E]/g, '')
      .trim()
      .slice(0, maxLen);
  }

  // ── Health ────────────────────────────────────────────────────────────────

  @Public()
  @Get('health')
  getHealth() {
    return { status: 'ok', service: 'Atom AI', timestamp: new Date().toISOString() };
  }

  // ── Text ──────────────────────────────────────────────────────────────────

  @Public()
  @Post('text')
  async handleText(@Body() body: TextRequest, @Req() req: any): Promise<TextResponse> {
    if (!body?.message?.trim()) {
      throw new BadRequestException('message is required');
    }

    const userId = this.userId(req);

    try {
      const result = await this.voiceService.processTextCommand(
        body.message,
        userId,
        body.conversationId,
      );

      return {
        message:        result.response,
        conversationId: result.conversationId,
        timestamp:      new Date().toISOString(),
      };
    } catch (error: any) {
      throw new HttpException(
        { message: 'Failed to process text command', error: error.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // ── Voice ─────────────────────────────────────────────────────────────────

  @Public()
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
    const userId = this.userId(req);
    const conversationId = bodyConversationId ?? queryConversationId;

    if (!file) {
      res.status(400).json({ message: 'Audio file is required (field name: audio)' });
      return;
    }

    if (file.size < 1_000) {
      res.json({
        message:        'Audio too short — please speak for at least one second.',
        transcription:  '[Too Short]',
        conversationId: conversationId ?? userId,
        timestamp:      new Date().toISOString(),
      });
      return;
    }

    try {
      const result = await this.voiceService.processVoiceCommand(
        file.buffer,
        userId,
        conversationId,
        file.mimetype,
      );

      res.setHeader('X-Transcription',   this.safeHeader(result.transcription ?? ''));
      res.setHeader('X-Response-Text',   this.safeHeader(result.response ?? ''));
      res.setHeader('X-Conversation-Id', this.safeHeader(result.conversationId ?? ''));

      if (returnAudio === 'true' && result.audioResponse) {
        res.setHeader('Content-Type', 'audio/mpeg');
        res.send(result.audioResponse);
        return;
      }

      const body: VoiceResponse = {
        message:        result.response,
        transcription:  result.transcription ?? '',
        conversationId: result.conversationId,
        timestamp:      new Date().toISOString(),
      };
      res.json(body);
    } catch (error: any) {
      const detail = error instanceof Error ? error.message : String(error);
      res.status(500).json({ message: `Voice processing failed: ${detail}`, error: detail });
    }
  }

  // ── Legacy voice-command (backwards compat) ───────────────────────────────

  @Public()
  @Post('voice-command')
  @UseInterceptors(FileInterceptor('audio'))
  async handleLegacyVoice(
    @UploadedFile() file: Express.Multer.File,
    @Req() req: any,
    @Body() body: { conversationId?: string },
  ) {
    const userId = this.userId(req);

    if (!file?.buffer || file.size < 1_000) {
      return {
        message:        'Audio too short — please speak for at least one second.',
        transcription:  '[Too Short]',
        conversationId: body.conversationId ?? userId,
        timestamp:      new Date(),
      };
    }

    try {
      const convoId = body.conversationId ?? userId;
      const result  = await this.voiceService.processVoiceCommand(
        file.buffer,
        userId,
        convoId,
        file.mimetype,
      );
      return {
        message:        result.response,
        transcription:  result.transcription,
        conversationId: result.conversationId,
        timestamp:      new Date(),
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        message:        `Sorry, voice processing hit an error: ${msg}`,
        transcription:  '[Error]',
        conversationId: body.conversationId ?? userId,
        timestamp:      new Date(),
      };
    }
  }

  // ── Speak (TTS only) ──────────────────────────────────────────────────────

  @Public()
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
      const audio = await this.voiceService.generateSpeech(text, (voice as any) || 'nova');
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Cache-Control', 'no-store');
      res.send(audio);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  // ── Conversation history ──────────────────────────────────────────────────
  //
  // Ownership rule: a session ID is always either:
  //   a) exactly the user's UUID (userId === sessionId), or
  //   b) a compound key starting with the userId (e.g. userId + ':' + topic)
  //
  // Either way, the sessionId must start with the requesting user's ID.
  // This prevents user A from reading or clearing user B's sessions.

  private assertSessionOwnership(sessionId: string, req: any): void {
    const userId = this.userId(req);
    if (!sessionId.startsWith(userId)) {
      throw new ForbiddenException('You do not have access to this conversation');
    }
  }

  @Get('conversations/:id')
  async getConversation(@Param('id') id: string, @Req() req: any) {
    this.assertSessionOwnership(id, req);
    const messages = await this.memory.getRawMessages(id);
    return { conversationId: id, messages, messageCount: messages.length };
  }

  @Delete('conversations/:id')
  async clearConversation(@Param('id') id: string, @Req() req: any) {
    this.assertSessionOwnership(id, req);
    await this.memory.clearSession(id);
    return { message: 'Conversation cleared', conversationId: id };
  }

  // ── OpenAI Realtime ephemeral token ───────────────────────────────────────
  // Frontend requests a short-lived token so the OpenAI API key never
  // leaves the server. Token is valid for 60 seconds.

  @Public()
  @Post('realtime-token')
  async getRealtimeToken(@Req() req: any) {
    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) {
      throw new HttpException('OPENAI_API_KEY not configured', HttpStatus.SERVICE_UNAVAILABLE);
    }

    const today = new Date().toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });
    const systemPrompt = [
      'You are Atom, an AI personal assistant for a roofing and contracting business.',
      'You are proactive, organized, and operate like a world-class executive assistant.',
      `Today is ${today}.`,
      'Keep responses concise and natural for voice conversation. Speak clearly and directly.',
    ].join(' ');

    try {
      const response = await fetch('https://api.openai.com/v1/realtime/sessions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openaiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-realtime-preview-2024-12-17',
          voice: 'alloy',
          instructions: systemPrompt,
          input_audio_transcription: { model: 'whisper-1' },
          turn_detection: {
            type: 'server_vad',
            threshold: 0.8,           // higher = won't trigger on Atom's own audio output
            prefix_padding_ms: 300,
            silence_duration_ms: 800, // wait longer so user isn't cut off mid-sentence
          },
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new HttpException(`OpenAI error: ${errText}`, HttpStatus.BAD_GATEWAY);
      }

      const session = await response.json() as any;
      return {
        clientSecret: session.client_secret?.value ?? session.client_secret,
        sessionId:    session.id,
        expiresAt:    session.expires_at,
      };
    } catch (err: any) {
      if (err instanceof HttpException) throw err;
      throw new HttpException(err.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

}
