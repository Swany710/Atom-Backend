import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import * as path from 'path';
import * as os from 'os';
import { writeFile, unlink } from 'fs/promises';
import { createReadStream } from 'fs';
import { providerAudio } from '../utils/provider-call';

/**
 * OpenAiTranscriptionService
 *
 * OpenAI is used EXCLUSIVELY for audio I/O:
 *   - Speech-to-Text  :  audio buffer → transcription string  (Whisper)
 *   - Text-to-Speech  :  text string  → audio/mpeg buffer     (OpenAI TTS)
 *
 * OpenAI is NOT used for reasoning, tool selection, or orchestration —
 * all decision-making flows through ClaudeOrchestratorService.
 */
@Injectable()
export class OpenAiTranscriptionService {
  private readonly openai: OpenAI;
  private readonly logger = new Logger(OpenAiTranscriptionService.name);

  constructor(private readonly config: ConfigService) {
    this.openai = new OpenAI({
      apiKey: this.config.get<string>('OPENAI_API_KEY'),
    });
  }

  // ── STT — Speech-to-Text ─────────────────────────────────────────────────

  /**
   * Transcribe an audio buffer using OpenAI Whisper.
   */
  async transcribe(audioBuffer: Buffer, mimeType?: string): Promise<string> {
    const ext = mimeType?.includes('webm') ? '.webm'
              : mimeType?.includes('ogg')  ? '.ogg'
              : mimeType?.includes('wav')  ? '.wav'
              : mimeType?.includes('mp4')  ? '.mp4'
              : '.mp3';

    const tmpPath = path.join(os.tmpdir(), `voice-${Date.now()}${ext}`);
    await writeFile(tmpPath, audioBuffer);

    try {
      const { text } = await providerAudio(
        () => this.openai.audio.transcriptions.create({
          file:  createReadStream(tmpPath) as any,
          model: 'whisper-1',
        }),
        'openai.transcriptions.create',
      );

      const transcription = text?.trim();
      if (!transcription) throw new Error('Whisper returned empty transcription');
      return transcription;

    } finally {
      await unlink(tmpPath).catch(() =>
        this.logger.warn(`Temp file not removed: ${tmpPath}`),
      );
    }
  }

  // ── TTS — Text-to-Speech ─────────────────────────────────────────────────

  /**
   * Convert a Claude reply to audio/mpeg (optional — used in voice pipeline).
   * Returns undefined on failure so audio failures do NOT break the text response.
   */
  async synthesise(
    text: string,
    voice: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer' = 'alloy',
  ): Promise<Buffer | undefined> {
    const cleaned = this.cleanForTts(text);

    try {
      const speechResponse = await providerAudio(
        () => this.openai.audio.speech.create({
          model: 'tts-1',
          voice,
          input: cleaned || 'I had nothing to say.',
        }),
        'openai.audio.speech.create',
      );
      return Buffer.from(await speechResponse.arrayBuffer());
    } catch (err) {
      this.logger.warn(
        `TTS generation failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return undefined;
    }
  }

  /**
   * Standalone TTS — converts any text to audio/mpeg.
   * Used by the POST /api/v1/ai/speak endpoint.
   * Unlike synthesise(), this throws on failure.
   */
  async generateSpeech(
    text: string,
    voice: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer' = 'nova',
  ): Promise<Buffer> {
    const cleaned = this.cleanForTts(text);

    const speechResponse = await providerAudio(
      () => this.openai.audio.speech.create({
        model: 'tts-1',
        voice,
        input: cleaned || 'I had nothing to say.',
      }),
      'openai.audio.speech.create',
    );
    return Buffer.from(await speechResponse.arrayBuffer());
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private cleanForTts(text: string): string {
    return text
      .replace(/```[\s\S]*?```/g, '')
      .replace(/\*\*|__|\*|_|~~|`/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .trim()
      .slice(0, 4096);
  }
}
