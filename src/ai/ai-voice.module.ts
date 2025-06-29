// src/ai/ai-voice.module.ts
import { Module } from '@nestjs/common';
import { AIVoiceController } from './ai-voice.controller';
import { AIVoiceService } from './ai-voice.service';
import { ConversationModule } from '../conversation/conversation.module';

@Module({
  imports: [ConversationModule], // Import conversation module for memory
  controllers: [AIVoiceController],
  providers: [AIVoiceService],
  exports: [AIVoiceService],
})
export class AIVoiceModule {}