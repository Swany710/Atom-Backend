import { Module } from '@nestjs/common';
import { ConversationsModule } from '../conversations/conversations.module';
import { TranscriptionModule } from '../transcription/transcription.module';
import { ClaudeModule } from '../claude/claude.module';
import { VoiceController } from './voice.controller';
import { VoiceService } from './voice.service';
import { VoiceOrchestratorService } from './voice-orchestrator.service';

@Module({
  imports: [ConversationsModule, TranscriptionModule, ClaudeModule],
  controllers: [VoiceController],
  providers: [VoiceOrchestratorService, VoiceService],
  exports: [VoiceService, VoiceOrchestratorService],
})
export class VoiceModule {}
