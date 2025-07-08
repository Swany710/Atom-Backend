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
import { AIVoiceService } from './ai/ai-voice.service';
import { FileInterceptor } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChatMemory } from './ai/chat-memory.entity';
import FormData from 'form-data';
import axios from 'axios';

@Controller('api/v1')
export class AppController {
  constructor(
    private configService: ConfigService,
    private readonly aiVoiceService: AIVoiceService,
    @InjectRepository(ChatMemory)
    private chatRepo: Repository<ChatMemory>
  ) {}

  @Get('ai/health')
  getHealth() {
    return {
      status: 'healthy',
      timestamp: new Date(),
      service: 'Atom Backend API',
    };
  }

  @Get('ai/status')
  getStatus() {
    const apiKey = this.configService.get('OPENAI_API_KEY');
    const isConfigured = !!apiKey && apiKey.startsWith('sk-');

    return {
      status: isConfigured ? 'available' : 'configuration_error',
      aiService: isConfigured ? 'online' : 'offline',
      mode: isConfigured ? 'openai' : 'error',
      timestamp: new Date(),
    };
  }

  // ✅ UPGRADED: Text commands now use shared memory
  @Post('ai/text-command1')
  async processTextCommand1(@Body() body: { message: string; userId?: string }) {
    try {
      const sessionId = body.userId ?? `anon-${Date.now()}`;
      const aiResponse = await this.aiVoiceService.processPrompt(body.message, sessionId);

      return {
        message: aiResponse,
        conversationId: sessionId,
        timestamp: new Date(),
        mode: 'openai',
      };
    } catch (error) {
      console.error('❌ Text processing error:', error.message);
      return {
        message: `I'm experiencing technical difficulties: ${error.message}`,
        conversationId: `error-${Date.now()}`,
        timestamp: new Date(),
        mode: 'error',
        error: error.message,
      };
    }
  }

  // ✅ Already upgraded: Voice uses sessionId from userId
  @Post('ai/voice-command1')
  @UseInterceptors(FileInterceptor('audio'))
  async processVoiceCommand1(@UploadedFile() file: any, @Body() body: any) {
    // ... leave this unchanged, you already handled it properly ...
    // (No in-memory storage here — you're calling aiVoiceService.processPrompt with sessionId)
  }

  // ✅ Now reads conversation history from DB
  @Get('ai/conversations/:id')
  async getConversation(@Param('id') id: string) {
    const messages = await this.chatRepo.find({
      where: { sessionId: id },
      order: { createdAt: 'ASC' },
    });

    return {
      conversationId: id,
      messages,
      messageCount: messages.length,
      timestamp: new Date(),
    };
  }

  // ✅ Clears history from database
  @Delete('ai/conversations/:id')
  async clearConversation(@Param('id') id: string) {
    await this.chatRepo.delete({ sessionId: id });
    return { message: 'Conversation cleared', timestamp: new Date() };
  }

  // ✅ Lists all session IDs with counts
  @Get('ai/conversations')
  async getAllConversations() {
    const results = await this.chatRepo
      .createQueryBuilder('chat')
      .select('chat.sessionId', 'id')
      .addSelect('COUNT(*)', 'messageCount')
      .addSelect('MAX(chat.createdAt)', 'lastTimestamp')
      .groupBy('chat.sessionId')
      .orderBy('lastTimestamp', 'DESC')
      .getRawMany();

    return {
      conversations: results.map((row) => ({
        id: row.id,
        messageCount: parseInt(row.messageCount, 10),
        lastMessage: row.lastTimestamp,
      })),
    };
  }
}
