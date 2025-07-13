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

@Controller('api/v1')
export class AppController {
  constructor(
    private readonly config: ConfigService,
    private readonly ai: AIVoiceService,
    @InjectRepository(ChatMemory)
    private readonly chatRepo: Repository<ChatMemory>,
  ) {}

  /* --------------------------------------------------------- */
  /*  Health + status                                           */
  /* --------------------------------------------------------- */
  @Get('ai/health')
  getHealth() {
    return {
      status: 'healthy',
      service: 'Atom Backend API',
      timestamp: new Date(),
    };
  }

  @Get('ai/status')
  getStatus() {
    const ok = !!this.config.get('OPENAI_API_KEY');
    return {
      status: ok ? 'available' : 'configuration_error',
      aiService: ok ? 'online' : 'offline',
      mode: ok ? 'openai' : 'error',
      timestamp: new Date(),
    };
  }

  /* --------------------------------------------------------- */
  /*  Text                                                     */
  /* --------------------------------------------------------- */
  @Post('ai/text-command1')
  async handleText(@Body() body: { message: string; userId?: string }) {
    const sessionId = body.userId ?? `anon-${Date.now()}`;
    const reply = await this.ai.processPrompt(body.message, sessionId);

    return {
      message: reply,
      conversationId: sessionId,
      timestamp: new Date(),
      mode: 'openai',
    };
  }

  /* --------------------------------------------------------- */
  /*  Voice                                                    */
  /* --------------------------------------------------------- */
  @Post('ai/voice-command1')
  @UseInterceptors(FileInterceptor('audio'))
  async handleVoice(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { userId?: string },
  ) {
    if (!file?.buffer || file.size < 1_000) {
      return {
        message:
          'Audio recording is too short — please speak for at least one second.',
        transcription: '[Too Short]',
        conversationId: `voice-error-${Date.now()}`,
        timestamp: new Date(),
        mode: 'error',
      };
    }

    const userId = body.userId ?? `anon-${Date.now()}`;
    const result = await this.ai.processVoiceCommand(file.buffer, userId);

    return {
      message: result.response,
      transcription: result.transcription,
      conversationId: result.conversationId,
      timestamp: new Date(),
      mode: 'openai',
    };
  }

  /* --------------------------------------------------------- */
  /*  Conversation history endpoints                           */
  /* --------------------------------------------------------- */
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
    return { message: 'Conversation cleared' };
  }
}
