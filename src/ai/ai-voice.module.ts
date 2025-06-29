// src/ai/ai-voice.module.ts - FULL RAILWAY VERSION WITH MEMORY
import { Module } from '@nestjs/common';
import { AIVoiceController } from './ai-voice.controller';
import { AIVoiceService } from './ai-voice.service';
import { ConversationModule } from '../conversation/conversation.module';

@Module({
  imports: [ConversationModule], // Import conversation module for Railway PostgreSQL memory
  controllers: [AIVoiceController],
  providers: [AIVoiceService],
  exports: [AIVoiceService],
})
export class AIVoiceModule {}