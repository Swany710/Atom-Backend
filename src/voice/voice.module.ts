import { Module } from '@nestjs/common';
import { ConversationsModule } from '../conversations/conversations.module';
import { TranscriptionModule } from '../transcription/transcription.module';
import { ClaudeModule } from '../claude/claude.module';
import { VoiceController } from './voice.controller';
import { VoiceService } from './voice.service';

@Module({
  imports: [ConversationsModule, TranscriptionModule, ClaudeModule],
  controllers: [VoiceController],
  providers: [VoiceService],
  exports: [VoiceService],
})
export class VoiceModule {}
