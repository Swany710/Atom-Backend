import {
  Controller,
  Post,
  Body,
  UseInterceptors,
  UploadedFile,
  Get,
  Param,
  Delete,
  Req,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AIVoiceService } from './ai/ai-voice.service';
import { ChatMemory } from './ai/chat-memory.entity';

// AppController owns conversation history and multipart voice uploads.
// Text chat and health/status live in AIVoiceController (/api/v1/ai/*).
@Controller('api/v1')
export class AppController {
  constructor(
    private readonly config: ConfigService,
    private readonly aiVoiceService: AIVoiceService,
    @InjectRepository(ChatMemory)
    private readonly chatRepo: Repository<ChatMemory>,
  ) {}

  @Get('ai/conversations/:id')
  async getConversation(@Param('id') id: string) {
    const messages = await this.chatRepo.find({
      where: { sessionId: id },
      order: { createdAt: 'ASC' },
    });
    return { conversationId: id, messages, messageCount: messages.length };
  }

  @Delete('ai/conversations/:id')
  async clearConversation(@Param('id') id: string) {
    await this.chatRepo.delete({ sessionId: id });
    return { message: 'Conversation cleared', conversationId: id };
  }

  @Post('ai/voice-command')
  @UseInterceptors(FileInterceptor('audio'))
  async handleVoice(
    @UploadedFile() file: Express.Multer.File,
    @Req() req: any,
    @Body() body: { conversationId?: string },
  ) {
    // Identity always comes from the guard-injected atomUserId, not from client body
    const userId: string = req.atomUserId;

    if (!file?.buffer || file.size < 1_000) {
      return {
        message: 'Audio too short — please speak for at least one second.',
        transcription: '[Too Short]',
        conversationId: body.conversationId ?? userId,
        timestamp: new Date(),
      };
    }

    try {
      const convoId = body.conversationId ?? userId;
      // Pass the actual MIME type so the service saves the temp file with the
      // correct extension (e.g. .webm) — Whisper infers format from extension.
      const result = await this.aiVoiceService.processVoiceCommand(
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
      console.error('❌ handleVoice caught error:', msg);
      return {
        message:        `Sorry, voice processing hit an error: ${msg}`,
        transcription:  '[Error]',
        conversationId: body.conversationId ?? userId,
        timestamp:      new Date(),
      };
    }
  }
}