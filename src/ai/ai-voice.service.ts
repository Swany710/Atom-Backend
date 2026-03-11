import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChatMemory } from './chat-memory.entity';
import { ConversationOrchestratorService } from './conversation-orchestrator.service';
import { VoicePipelineService } from './voice-pipeline.service';

export interface ProcessResult {
  response: string;
  conversationId: string;
  transcription?: string;
  audioResponse?: Buffer;
  toolCalls?: Array<{ tool: string; args: unknown; result: unknown }>;
}

/**
 * AIVoiceService — public facade consumed by AIVoiceController.
 *
 * Controller endpoints remain unchanged.  Internal implementation is
 * split across focused services:
 *
 *   ConversationOrchestratorService — Claude API + tool-use loop
 *   ToolDefinitionsService          — Anthropic tool schemas
 *   ToolExecutorService             — provider dispatch + pending-action gate + audit
 *   VoicePipelineService            — Whisper STT + OpenAI TTS
 *   PendingActionService            — confirmation records
 *   AuditService                    — write audit log
 */
@Injectable()
export class AIVoiceService {
  private readonly logger = new Logger(AIVoiceService.name);

  constructor(
    @InjectRepository(ChatMemory)
    private readonly chatRepo: Repository<ChatMemory>,
    private readonly orchestrator: ConversationOrchestratorService,
    private readonly voicePipeline: VoicePipelineService,
  ) {}

  // ── Text pipeline ─────────────────────────────────────────────────────────

  async processTextCommand(
    message: string,
    userId: string,
    conversationId?: string,
    correlationId?: string,
  ): Promise<ProcessResult> {
    const sessionId = conversationId ?? userId;

    const { response: reply, toolCalls } = await this.orchestrator.runChat(
      sessionId,
      message,
      userId,
      correlationId,
    );

    await this.chatRepo.save([
      { sessionId, role: 'user',      content: message },
      { sessionId, role: 'assistant', content: reply },
    ]);

    return {
      response:       reply,
      conversationId: sessionId,
      toolCalls:      toolCalls.length > 0 ? toolCalls : undefined,
    };
  }

  async processPrompt(prompt: string, sessionId: string): Promise<string> {
    const { response } = await this.processTextCommand(prompt, sessionId, sessionId);
    return response;
  }

  // ── Voice pipeline ────────────────────────────────────────────────────────

  async processVoiceCommand(
    audioBuffer: Buffer,
    userId: string,
    conversationId?: string,
    mimeType?: string,
  ): Promise<ProcessResult> {
    // 1) Transcribe
    const transcription = await this.voicePipeline.transcribe(audioBuffer, mimeType);

    // 2) Run through Claude
    const sessionId = conversationId ?? userId;
    const { response: reply, toolCalls } = await this.orchestrator.runChat(
      sessionId,
      transcription,
      userId,
    );

    await this.chatRepo.save([
      { sessionId, role: 'user',      content: transcription },
      { sessionId, role: 'assistant', content: reply },
    ]);

    // 3) TTS (optional — failure does not break the response)
    const audioResponse = await this.voicePipeline.synthesise(reply);

    return {
      response:       reply,
      conversationId: sessionId,
      transcription,
      audioResponse,
      toolCalls:      toolCalls.length > 0 ? toolCalls : undefined,
    };
  }

  // ── TTS only ──────────────────────────────────────────────────────────────

  async generateSpeech(
    text: string,
    voice: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer' = 'nova',
  ): Promise<Buffer> {
    return this.voicePipeline.generateSpeech(text, voice);
  }
}
