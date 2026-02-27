import {
  Controller,
  Post,
  Body,
  UseInterceptors,
  UploadedFile,
  Get,
  Param,
  Delete,
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
    @Body() body: { userId?: string; conversationId?: string },
  ) {
    if (!file?.buffer || file.size < 1_000) {
      return {
        message: 'Audio too short — please speak for at least one second.',
        transcription: '[Too Short]',
        conversationId: body.conversationId ?? body.userId ?? 'voice-error',
        timestamp: new Date(),
      };
    }
    const userId = body.userId ?? 'default-user';
    const convoId = body.conversationId ?? userId;
    const result = await this.aiVoiceService.processVoiceCommand(file.buffer, userId, convoId);
    return {
      message: result.response,
      transcription: result.transcription,
      conversationId: result.conversationId,
      timestamp: new Date(),
    };
  }
}