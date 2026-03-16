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
 * |  Voice pipeline (standard)                              |
 * |    audio --> Whisper (STT)                              |
 * |           --> Claude (reasoning + tools)                |
 * |           --> OpenAI TTS --> audio/mpeg reply           |
 * +---------------------------------------------------------+
 *
 * +---------------------------------------------------------+
 * |  Voice pipeline (fast - CHUNK 13)                       |
 * |    audio --> Whisper (STT)                              |
 * |           --> Claude STREAM (tokens as they arrive)     |
 * |           --> sentence detection                        |
 * |           --> TTS sentence 1 |                          |
 * |           --> TTS sentence 2 | parallel Promise.all     |
 * |           --> TTS sentence N |                          |
 * |           --> concat audio buffers --> audio/mpeg       |
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

  // -- Text pipeline -------------------------------------------------------

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

  // -- Voice pipeline (standard) -------------------------------------------

  async processVoiceCommand(
    audioBuffer: Buffer,
    userId: string,
    conversationId?: string,
    mimeType?: string,
  ): Promise<ProcessResult> {
    const sessionId = conversationId ?? userId;
    const fullStart = Date.now();

    // Step 1 - STT: audio -> transcription (OpenAI Whisper)
    const sttStart = Date.now();
    const transcribed = await this.transcription.transcribe(audioBuffer, mimeType);
    const sttMs = Date.now() - sttStart;
    this.logger.log(`[LATENCY] STT: ${sttMs}ms | session=${sessionId}`);

    // Step 2 - LLM: transcription -> reply (Claude)
    const llmStart = Date.now();
    const { response: reply, toolCalls, newMessages } = await this.orchestrator.runChat(
      sessionId,
      transcribed,
      userId,
    );
    const llmMs = Date.now() - llmStart;
    this.logger.log(`[LATENCY] LLM: ${llmMs}ms | session=${sessionId} | tools=${toolCalls.length}`);

    await this.memory.appendMessages(sessionId, newMessages);

    // Step 3 - TTS: reply -> audio/mpeg (OpenAI TTS)
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

  // -- Voice pipeline (fast - CHUNK 13) ------------------------------------

  /**
   * Low-latency voice pipeline using Claude streaming + parallel sentence TTS.
   *
   * How it reduces latency:
   *   Standard path:  STT --> Claude(full) --> TTS(full text)
   *                   time = STT + Claude + TTS  (sequential, ~7s)
   *
   *   Fast path:      STT --> Claude stream --> sentence 1 done at ~600ms
   *                        --> TTS(s1) starts immediately           (parallel)
   *                        --> sentence 2 done at ~1.2s
   *                        --> TTS(s2) starts                       (parallel)
   *                        --> Claude finishes, TTS chunks complete
   *                        --> concat audio buffers
   *                   time = STT + max(Claude, last TTS)  (~5s, first audio at ~3.6s)
   *
   * Sentence detection:
   *   Splits on sentence-ending punctuation followed by whitespace.
   *   Minimum sentence length of 15 chars avoids firing TTS on "OK." or "Sure."
   *   Any remaining text after the stream ends becomes the final TTS chunk.
   *
   * Fallback:
   *   If TTS for any sentence fails (synthesise() returns undefined), that
   *   audio chunk is silently dropped. The text response is always returned.
   */
  async processVoiceCommandFast(
    audioBuffer: Buffer,
    userId: string,
    conversationId?: string,
    mimeType?: string,
  ): Promise<ProcessResult> {
    const sessionId = conversationId ?? userId;
    const fullStart = Date.now();

    // ── STT (unchanged from standard pipeline) ───────────────────────────
    const sttStart = Date.now();
    const transcribed = await this.transcription.transcribe(audioBuffer, mimeType);
    const sttMs = Date.now() - sttStart;
    this.logger.log(`[LATENCY:FAST] STT: ${sttMs}ms | session=${sessionId}`);

    // ── LLM streaming + parallel sentence TTS ────────────────────────────
    const llmStart = Date.now();

    // Buffer accumulates tokens until a sentence boundary is detected.
    // Each completed sentence immediately fires a TTS request (non-awaited).
    let sentenceBuffer = '';
    let fullResponse   = '';
    let sentenceCount  = 0;

    // All TTS promises are collected here and awaited together at the end.
    // Running them concurrently means sentence 1 audio may be ready before
    // Claude has even finished generating sentence 3.
    const ttsTasks: Promise<Buffer | undefined>[] = [];

    // Sentence boundary: ends with . ! or ? followed by whitespace or end of text.
    // Min length guard prevents micro-sentences like "Ok." from spawning a TTS call.
    const SENTENCE_END = /[.!?](?:\s|$)/;
    const MIN_SENTENCE_CHARS = 15;

    const chatStream = this.orchestrator.streamChat(sessionId, transcribed, userId);

    for await (const chunk of chatStream) {
      fullResponse   += chunk;
      sentenceBuffer += chunk;

      // Check if the buffer contains at least one sentence boundary
      const boundaryMatch = sentenceBuffer.match(/^([\s\S]+?[.!?])(?:\s|$)/);
      if (boundaryMatch && boundaryMatch[1].length >= MIN_SENTENCE_CHARS) {
        const sentence = boundaryMatch[1].trim();
        // Everything after the sentence boundary stays in the buffer
        sentenceBuffer = sentenceBuffer.slice(boundaryMatch[0].length);

        sentenceCount++;
        this.logger.log(
          `[LATENCY:FAST] TTS sentence ${sentenceCount} queued (${sentence.length} chars) | session=${sessionId}`,
        );

        // Fire TTS immediately - do NOT await here
        // It runs in parallel with the remaining Claude stream
        ttsTasks.push(this.transcription.synthesise(sentence));
      }
    }

    const llmMs = Date.now() - llmStart;
    this.logger.log(`[LATENCY:FAST] LLM stream done: ${llmMs}ms | sentences queued=${sentenceCount} | session=${sessionId}`);

    // Synthesise any remaining text that didn't end with punctuation
    const remaining = sentenceBuffer.trim();
    if (remaining.length >= 5) {
      sentenceCount++;
      ttsTasks.push(this.transcription.synthesise(remaining));
    }

    // ── Await all parallel TTS tasks ─────────────────────────────────────
    // By the time we get here, the first sentence's TTS may already be done.
    const ttsWaitStart = Date.now();
    const audioChunks = await Promise.all(ttsTasks);
    const ttsWaitMs = Date.now() - ttsWaitStart;
    this.logger.log(
      `[LATENCY:FAST] TTS parallel wait: ${ttsWaitMs}ms | chunks=${ttsTasks.length} | session=${sessionId}`,
    );

    // Concatenate valid audio buffers in sentence order
    const validChunks = audioChunks.filter((b): b is Buffer => b !== undefined);
    const audioResponse = validChunks.length > 0
      ? Buffer.concat(validChunks)
      : undefined;

    // Persist conversation (simplified - user + assistant only, no tool pairs)
    await this.memory.appendMessages(sessionId, [
      { role: 'user',      content: transcribed   },
      { role: 'assistant', content: fullResponse  },
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
