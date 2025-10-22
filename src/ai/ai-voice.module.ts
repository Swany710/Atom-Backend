// src/ai/ai-voice.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AIVoiceService } from './ai-voice.service';
import { AIVoiceController } from './ai-voice.controller';
import { ChatMemory } from './chat-memory.entity';
import { CalendarModule } from '../integrations/calendar/calendar.module';
import { EmailModule } from '../integrations/email/email.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ChatMemory]),
    CalendarModule,
    EmailModule,
  ],
  providers: [AIVoiceService],
  controllers: [AIVoiceController],
  exports: [AIVoiceService],
})
export class AIVoiceModule {}
