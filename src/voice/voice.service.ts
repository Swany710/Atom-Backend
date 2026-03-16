import { Injectable, Logger } from '@nestjs/common';
import { ClaudeOrchestratorService } from '../claude/claude-orchestrator.service';
import { OpenAiTranscriptionService } from '../transcription/openai-transcription.service';
import { ConversationMemoryService } from '../conversations/conversation-memory.service';

export interface ProcessResult {
  response: string;
  conversationId: string;
  transcription?: string;
  audioResponse?: Buffer;
  toolCalls?: Array<{ tool: string; args: unknown; result: unknown }>;
}

/**
 * VoiceService - public facade consumed by VoiceController.
 *
 * +---------------------------------------------------------+
 * |  Text pipeline                                          |
 * |    user text --> Claude --> text reply                  |
 * +---------------------------------------------------------+
 *
 * +---------------------------------------------------------+
 * |  Voice pipeline                                         |
 * |    audio --> OpenAI Whisper (STT)                       |
 * |           --> Claude  (reasoning + tools)               |
 * |           --> OpenAI TTS --> audio/mpeg reply           |
 * +---------------------------------------------------------+
 */
@Injectable()
export class VoiceService {
  private readonly logger = new Logger(VoiceService.name);

  constructor(
    private readonly orchestrator: ClaudeOrchestratorService,
    private readonly transcription: OpenAiTranscriptionService,
    private readonly memory: ConversationMemoryService,
  ) {}

  // ── Text pipeline ────────────────────────────────────────────────────────────

  async processTextCommand(
    message: string,
    userId: string,
    conversationId?: string,
    correlationId?: string,
  ): Promise<ProcessResult> {
    const sessionId = conversationId ?? userId;

    const { response: reply, toolCalls, newMessages } = await this.orchestrator.runChat(
      sessionId,
      message,
      userId,
      correlationId,
    );

    await this.memory.appendMessages(sessionId, newMessages);

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

  // ── Voice pipeline ───────────────────────────────────────────────────────────

  async processVoiceCommand(
    audioBuffer: Buffer,
    userId: string,
    conversationId?: string,
    mimeType?: string,
  ): Promise<ProcessResult> {
    const sessionId = conversationId ?? userId;
    const fullStart = Date.now();

    // ── Step 1: STT — audio → transcription (OpenAI Whisper) ─────────────────
    const sttStart = Date.now();
    const transcribed = await this.transcription.transcribe(audioBuffer, mimeType);
    const sttMs = Date.now() - sttStart;
    this.logger.log(`[LATENCY] STT: ${sttMs}ms | session=${sessionId}`);

    // ── Step 2: LLM — transcription → reply (Claude) ──────────────────────────
    const llmStart = Date.now();
    const { response: reply, toolCalls, newMessages } = await this.orchestrator.runChat(
      sessionId,
      transcribed,
      userId,
    );
    const llmMs = Date.now() - llmStart;
    this.logger.log(`[LATENCY] LLM: ${llmMs}ms | session=${sessionId} | tools=${toolCalls.length}`);

    await this.memory.appendMessages(sessionId, newMessages);

    // ── Step 3: TTS — reply → audio/mpeg (OpenAI TTS) ────────────────────────
    const ttsStart = Date.now();
    const audioResponse = await this.transcription.synthesise(reply);
    const ttsMs = Date.now() - ttsStart;
    this.logger.log(`[LATENCY] TTS: ${ttsMs}ms | session=${sessionId}`);

    // ── Full request summary ──────────────────────────────────────────────────
    const fullMs = Date.now() - fullStart;
    this.logger.log(
      `[LATENCY] FULL REQUEST: ${fullMs}ms | STT=${sttMs}ms LLM=${llmMs}ms TTS=${ttsMs}ms | session=${sessionId}`,
    );

    return {
      response:       reply,
      conversationId: sessionId,
      transcription:  transcribed,
      audioResponse,
      toolCalls:      toolCalls.length > 0 ? toolCalls : undefined,
    };
  }

  // ── TTS only ─────────────────────────────────────────────────────────────────

  async generateSpeech(
    text: string,
    voice: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer' = 'nova',
  ): Promise<Buffer> {
    return this.transcription.generateSpeech(text, voice);
  }
}
