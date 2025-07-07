// src/ai/ai-voice.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AIVoiceService } from './ai-voice.service';
import { AIVoiceController } from './ai-voice.controller';
import { ChatMemory } from './chat-memory.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ChatMemory])],
  providers: [AIVoiceService],
  controllers: [AIVoiceController],
})
export class AIVoiceModule {}
