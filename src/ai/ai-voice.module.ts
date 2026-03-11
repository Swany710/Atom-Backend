// src/ai/ai-voice.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AIVoiceService } from './ai-voice.service';
import { AIVoiceController } from './ai-voice.controller';
import { ConversationOrchestratorService } from './conversation-orchestrator.service';
import { ToolDefinitionsService } from './tool-definitions.service';
import { ToolExecutorService } from './tool-executor.service';
import { VoicePipelineService } from './voice-pipeline.service';
import { ChatMemory } from './chat-memory.entity';
import { CalendarModule } from '../integrations/calendar/calendar.module';
import { EmailModule } from '../integrations/email/email.module';
import { CrmModule } from '../integrations/crm/crm.module';
import { KnowledgeBaseModule } from '../knowledge-base/knowledge-base.module';
import { PendingActionModule } from '../pending-actions/pending-action.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ChatMemory]),
    CalendarModule,
    EmailModule,
    CrmModule,
    KnowledgeBaseModule,
    PendingActionModule,
  ],
  providers: [
    AIVoiceService,
    ConversationOrchestratorService,
    ToolDefinitionsService,
    ToolExecutorService,
    VoicePipelineService,
  ],
  controllers: [AIVoiceController],
  exports:     [AIVoiceService],
})
export class AIVoiceModule {}
