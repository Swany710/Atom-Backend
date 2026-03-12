import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

// ── Controller ────────────────────────────────────────────────────────────
import { AIVoiceController } from './ai-voice.controller';

// ── Public facade ─────────────────────────────────────────────────────────
import { AIVoiceService } from './ai-voice.service';

// ── Core internal services ────────────────────────────────────────────────
import { ConversationMemoryService }   from './conversation-memory.service';
import { ClaudeTaskOrchestratorService } from './claude-task-orchestrator.service';
import { ToolExecutionService }        from './tool-execution.service';
import { OpenAiVoiceGatewayService }   from './openai-voice-gateway.service';

// ── Supporting services ───────────────────────────────────────────────────
import { ToolDefinitionsService }      from './tool-definitions.service';

// ── Entities ──────────────────────────────────────────────────────────────
import { ChatMemory } from './chat-memory.entity';

// ── Integration modules ───────────────────────────────────────────────────
import { CalendarModule }      from '../integrations/calendar/calendar.module';
import { EmailModule }         from '../integrations/email/email.module';
import { CrmModule }           from '../integrations/crm/crm.module';
import { KnowledgeBaseModule } from '../knowledge-base/knowledge-base.module';
import { PendingActionModule } from '../pending-actions/pending-action.module';
import { AuditModule }         from '../audit/audit.module';

/**
 * AIVoiceModule
 *
 * Wires together the four-service AI split:
 *
 *   OpenAiVoiceGatewayService     — OpenAI STT (Whisper) + TTS only
 *   ClaudeTaskOrchestratorService — Claude tool-use loop (reasoning engine)
 *   ToolExecutionService          — provider dispatch + confirmation gate
 *   ConversationMemoryService     — ChatMemory read/write
 *
 * Data flow:
 *   Voice: OpenAiVoiceGateway → ClaudeTaskOrchestrator → OpenAiVoiceGateway
 *   Text:                        ClaudeTaskOrchestrator
 *   Both: AIVoiceService (facade) → ConversationMemoryService (persistence)
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([ChatMemory]),
    CalendarModule,
    EmailModule,
    CrmModule,
    KnowledgeBaseModule,
    PendingActionModule,
    AuditModule,
  ],
  providers: [
    // ── Facade ──────────────────────────────────────────────────────────
    AIVoiceService,

    // ── Memory layer ────────────────────────────────────────────────────
    ConversationMemoryService,

    // ── Reasoning engine (Claude) ────────────────────────────────────────
    ClaudeTaskOrchestratorService,

    // ── Execution layer ─────────────────────────────────────────────────
    ToolExecutionService,
    ToolDefinitionsService,

    // ── Voice / audio I/O (OpenAI only) ─────────────────────────────────
    OpenAiVoiceGatewayService,
  ],
  controllers: [AIVoiceController],
  exports: [AIVoiceService],
})
export class AIVoiceModule {}
