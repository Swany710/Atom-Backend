import { Injectable, Logger } from '@nestjs/common';
import { ClaudeOrchestratorService } from '../claude/claude-orchestrator.service';
import { OpenAiTranscriptionService } from '../transcription/openai-transcription.service';
import { ConversationMemoryService } from '../conversations/conversation-memory.service';
import type { ProcessResult } from './voice.service';

/**
 * VoiceOrchestratorService
 *
 * Owns the full AI pipeline from raw input to final output.
 * VoiceService is a thin facade over this class.
 *
 * Separation of concerns:
 *   ClaudeOrchestratorService  — pure LLM adapter (Anthropic API, tool-use loop, streaming)
 *   VoiceOrchestratorService   — pipeline coordinator (STT → LLM → TTS, memory, latency logging)
 *   VoiceService               — thin public facade for VoiceController
 *
 * ┌────────────────────────────────────────────────────────┐
 * │  Text pipeline                                         │
 * │    user text ──► ClaudeOrchestrator.runChat() ──► text │
 * └────────────────────────────────────────────────────────┘
 *
 * ┌────────────────────────────────────────────────────────┐
 * │  Voice pipeline (standard)                             │
 * │    audio ──► Whisper STT                               │
 * │           ──► ClaudeOrchestrator.runChat()             │
 * │           ──► OpenAI TTS ──► audio/mpeg                │
 * └────────────────────────────────────────────────────────┘
 *
 * ┌────────────────────────────────────────────────────────┐
 * │  Voice pipeline (fast — CHUNK 13)                      │
 * │    audio ──► Whisper STT                               │
 * │           ──► ClaudeOrchestrator.streamChat()          │
 * │           ──► sentence detection                       │
 * │           ──► TTS s1 │                                 │
 * │           ──► TTS s2 │ parallel Promise.all            │
 * │           ──► TTS sN │                                 │
 * │           ──► concat buffers ──► audio/mpeg            │
 * └────────────────────────────────────────────────────────┘
 */
@Injectable()
export class VoiceOrchestratorService {
  private readonly logger = new Logger(VoiceOrchestratorService.name);

  constructor(
    private readonly orchestrator: ClaudeOrchestratorService,
    private readonly transcription: OpenAiTranscriptionService,
    private readonly memory: ConversationMemoryService,
  ) {}

  // -- Text pipeline -------------------------------------------------------

  async processTextCommand(
    message: string,
    userId: string,
    conversationId?: string,
    correlationId?: string,
  ): Promise<ProcessResult> {
    const sessionId = conversationId ?? userId;

    const runOnce = async () => {
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
    };

    try {
      return await runOnce();
    } catch (err) {
      // If Anthropic rejects due to corrupt conversation history (orphaned tool_use blocks
      // that sanitizeHistory missed), clear the session and retry once with a clean slate.
      const msg = err instanceof Error ? err.message : String(err);
      const isHistoryCorrupt =
        msg.includes('tool_use') ||
        (msg.includes('400') && msg.includes('invalid_request_error'));

      if (isHistoryCorrupt) {
        this.logger.warn(
          `[${sessionId}] Anthropic rejected due to corrupt history – clearing session and retrying`,
        );
        await this.memory.clearSession(sessionId);
        return await runOnce();
      }

      throw err;
    }
  }

  async processPrompt(prompt: string, sessionId: string): Promise<string> {
    const { response } = await this.processTextCommand(prompt, sessionId, sessionId);
    return response;
  }

  // -- Voice pipeline (standard) -------------------------------------------

  async processVoiceCommand(
    audioBuffer: Buffer,
    userId: string,
    conversationId?: string,
    mimeType?: string,
  ): Promise<ProcessResult> {
    const sessionId = conversationId ?? userId;
    const fullStart = Date.now();

    // Step 1 — STT: audio → transcription (OpenAI Whisper)
    const sttStart = Date.now();
    const transcribed = await this.transcription.transcribe(audioBuffer, mimeType);
    const sttMs = Date.now() - sttStart;
    this.logger.log(`[LATENCY] STT: ${sttMs}ms | session=${sessionId}`);

    // Step 2 — LLM: transcription → reply (Claude + tool-use loop)
    const llmStart = Date.now();
    const { response: reply, toolCalls, newMessages } = await this.orchestrator.runChat(
      sessionId,
      transcribed,
      userId,
    );
    const llmMs = Date.now() - llmStart;
    this.logger.log(`[LATENCY] LLM: ${llmMs}ms | session=${sessionId} | tools=${toolCalls.length}`);

    await this.memory.appendMessages(sessionId, newMessages);

    // Step 3 — TTS: reply → audio/mpeg (OpenAI TTS)
    const ttsStart = Date.now();
    const audioResponse = await this.transcription.synthesise(reply);
    const ttsMs = Date.now() - ttsStart;
    this.logger.log(`[LATENCY] TTS: ${ttsMs}ms | session=${sessionId}`);

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

  // -- Voice pipeline (fast — CHUNK 13) ------------------------------------

  /**
   * Low-latency voice pipeline using Claude streaming + parallel sentence TTS.
   *
   * How it reduces latency:
   *   Standard:  STT → Claude(full) → TTS(full text)            ~7s total
   *   Fast:      STT → Claude stream → sentence 1 done at ~600ms
   *                  → TTS(s1) starts immediately               (parallel)
   *                  → sentence 2 done at ~1.2s
   *                  → TTS(s2) starts                           (parallel)
   *                  → Claude finishes, all TTS chunks complete
   *                  → concat audio buffers
   *              ~5s total, first audio at ~3.6s
   *
   * Sentence detection:
   *   Splits on sentence-ending punctuation followed by whitespace.
   *   Minimum 15-char guard prevents TTS on "OK." or "Sure."
   *   Any remaining text after stream ends becomes the last TTS chunk.
   *
   * Fallback:
   *   If synthesise() returns undefined for a sentence, that chunk is
   *   silently dropped. The full text response is always returned.
   */
  async processVoiceCommandFast(
    audioBuffer: Buffer,
    userId: string,
    conversationId?: string,
    mimeType?: string,
  ): Promise<ProcessResult> {
    const sessionId = conversationId ?? userId;
    const fullStart = Date.now();

    // ── STT ────────────────────────────────────────────────────────────────
    const sttStart = Date.now();
    const transcribed = await this.transcription.transcribe(audioBuffer, mimeType);
    const sttMs = Date.now() - sttStart;
    this.logger.log(`[LATENCY:FAST] STT: ${sttMs}ms | session=${sessionId}`);

    // ── LLM streaming + parallel sentence TTS ──────────────────────────────
    const llmStart = Date.now();

    let sentenceBuffer = '';
    let fullResponse   = '';
    let sentenceCount  = 0;

    const ttsTasks: Promise<Buffer | undefined>[] = [];

    const SENTENCE_END      = /[.!?](?:\s|$)/;
    const MIN_SENTENCE_CHARS = 15;

    // Consume the async generator — tool-use turns are handled non-streaming
    // inside streamChat; only the final text turn is streamed token-by-token.
    const chatStream = this.orchestrator.streamChat(sessionId, transcribed, userId);

    for await (const chunk of chatStream) {
      fullResponse   += chunk;
      sentenceBuffer += chunk;

      const boundaryMatch = sentenceBuffer.match(/^([\s\S]+?[.!?])(?:\s|$)/);
      if (boundaryMatch && boundaryMatch[1].length >= MIN_SENTENCE_CHARS) {
        const sentence = boundaryMatch[1].trim();
        sentenceBuffer = sentenceBuffer.slice(boundaryMatch[0].length);

        sentenceCount++;
        this.logger.log(
          `[LATENCY:FAST] TTS sentence ${sentenceCount} queued (${sentence.length} chars) | session=${sessionId}`,
        );

        // Fire TTS immediately — do NOT await here.
        // Runs in parallel with the remaining Claude stream.
        ttsTasks.push(this.transcription.synthesise(sentence));
      }
    }

    const llmMs = Date.now() - llmStart;
    this.logger.log(
      `[LATENCY:FAST] LLM stream done: ${llmMs}ms | sentences queued=${sentenceCount} | session=${sessionId}`,
    );

    // Synthesise any remaining text that didn't end with sentence punctuation
    const remaining = sentenceBuffer.trim();
    if (remaining.length >= 5) {
      sentenceCount++;
      ttsTasks.push(this.transcription.synthesise(remaining));
    }

    // ── Await all parallel TTS tasks ───────────────────────────────────────
    const ttsWaitStart = Date.now();
    const audioChunks = await Promise.all(ttsTasks);
    const ttsWaitMs = Date.now() - ttsWaitStart;
    this.logger.log(
      `[LATENCY:FAST] TTS parallel wait: ${ttsWaitMs}ms | chunks=${ttsTasks.length} | session=${sessionId}`,
    );

    const validChunks = audioChunks.filter((b): b is Buffer => b !== undefined);
    const audioResponse = validChunks.length > 0
      ? Buffer.concat(validChunks)
      : undefined;

    // Persist conversation (user + assistant pair; tool pairs handled inside streamChat)
    await this.memory.appendMessages(sessionId, [
      { role: 'user',      content: transcribed  },
      { role: 'assistant', content: fullResponse },
    ]);

    const fullMs = Date.now() - fullStart;
    this.logger.log(
      `[LATENCY:FAST] FULL: ${fullMs}ms | STT=${sttMs}ms LLM=${llmMs}ms TTS_wait=${ttsWaitMs}ms | sentences=${sentenceCount} | session=${sessionId}`,
    );

    return {
      response:       fullResponse.trim(),
      conversationId: sessionId,
      transcription:  transcribed,
      audioResponse,
    };
  }

  // -- TTS only ------------------------------------------------------------

  async generateSpeech(
    text: string,
    voice: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer' = 'nova',
  ): Promise<Buffer> {
    return this.transcription.generateSpeech(text, voice);
  }
}
