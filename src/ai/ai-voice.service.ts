import { Injectable, Logger } from '@nestjs/common';
import { ClaudeTaskOrchestratorService } from './claude-task-orchestrator.service';
import { OpenAiVoiceGatewayService } from './openai-voice-gateway.service';
import { ConversationMemoryService } from './conversation-memory.service';

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
 * All public endpoints are kept UNCHANGED.  Internal implementation is
 * split across four focused services:
 *
 *   ClaudeTaskOrchestratorService   — Claude API + tool-use loop
 *                                     (sole reasoning / decision engine)
 *   OpenAiVoiceGatewayService       — OpenAI Whisper STT + OpenAI TTS
 *                                     (audio I/O only — no decisions)
 *   ToolExecutionService            — provider dispatch, pending-action gate,
 *                                     audit logging  (injected by orchestrator)
 *   ConversationMemoryService       — ChatMemory persistence + history loading
 *
 * ┌─────────────────────────────────────────────────────┐
 * │  Text pipeline                                      │
 * │    user text  →  Claude  →  text reply              │
 * │                  (tools via ToolExecutionService)   │
 * │                  memory via ConversationMemory      │
 * └─────────────────────────────────────────────────────┘
 *
 * ┌─────────────────────────────────────────────────────┐
 * │  Voice pipeline                                     │
 * │    audio  →  OpenAI Whisper (STT)                   │
 * │           →  Claude  (reasoning + tools)            │
 * │           →  OpenAI TTS  →  audio/mpeg reply        │
 * └─────────────────────────────────────────────────────┘
 */
@Injectable()
export class AIVoiceService {
  private readonly logger = new Logger(AIVoiceService.name);

  constructor(
    private readonly orchestrator: ClaudeTaskOrchestratorService,
    private readonly voiceGateway: OpenAiVoiceGatewayService,
    private readonly memory: ConversationMemoryService,
  ) {}

  // ── Text pipeline ─────────────────────────────────────────────────────────

  /**
   * Process a plain-text user message.
   * Route: user text → ClaudeTaskOrchestratorService → text reply
   *
   * @param message        User message text.
   * @param userId         Authenticated user ID.
   * @param conversationId Optional conversation thread ID (default: userId).
   * @param correlationId  Optional tracing ID for log correlation.
   */
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

    // Persist the exchange after Claude responds
    await this.memory.appendPair(sessionId, message, reply);

    return {
      response:       reply,
      conversationId: sessionId,
      toolCalls:      toolCalls.length > 0 ? toolCalls : undefined,
    };
  }

  /**
   * Convenience overload used internally (e.g. by voice pipeline callers that
   * only need the text reply string).
   */
  async processPrompt(prompt: string, sessionId: string): Promise<string> {
    const { response } = await this.processTextCommand(prompt, sessionId, sessionId);
    return response;
  }

  // ── Voice pipeline ────────────────────────────────────────────────────────

  /**
   * Process a voice recording end-to-end.
   * Route: audio → OpenAI Whisper (STT) → Claude → OpenAI TTS → audio/mpeg
   *
   * Audio synthesis failure is non-fatal — the text response is always returned.
   *
   * @param audioBuffer    Raw audio bytes (WebM / Ogg / MP3 / WAV / MP4).
   * @param userId         Authenticated user ID.
   * @param conversationId Optional conversation thread ID (default: userId).
   * @param mimeType       MIME type hint for correct Whisper file extension.
   */
  async processVoiceCommand(
    audioBuffer: Buffer,
    userId: string,
    conversationId?: string,
    mimeType?: string,
  ): Promise<ProcessResult> {
    // Step 1 — STT: audio → transcription (OpenAI Whisper)
    const transcription = await this.voiceGateway.transcribe(audioBuffer, mimeType);

    // Step 2 — Reasoning: transcription → reply (Claude)
    const sessionId = conversationId ?? userId;
    const { response: reply, toolCalls } = await this.orchestrator.runChat(
      sessionId,
      transcription,
      userId,
    );

    // Persist the exchange
    await this.memory.appendPair(sessionId, transcription, reply);

    // Step 3 — TTS: reply → audio/mpeg (OpenAI TTS)
    // Failure here is intentionally swallowed — the text response is still valid.
    const audioResponse = await this.voiceGateway.synthesise(reply);

    return {
      response:       reply,
      conversationId: sessionId,
      transcription,
      audioResponse,
      toolCalls:      toolCalls.length > 0 ? toolCalls : undefined,
    };
  }

  // ── TTS only ──────────────────────────────────────────────────────────────

  /**
   * Convert arbitrary text to speech (used by POST /ai/speak).
   * Delegates entirely to OpenAiVoiceGatewayService — no Claude involved.
   */
  async generateSpeech(
    text: string,
    voice: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer' = 'nova',
  ): Promise<Buffer> {
    return this.voiceGateway.generateSpeech(text, voice);
  }
}
