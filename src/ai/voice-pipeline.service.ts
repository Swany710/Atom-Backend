import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import * as path from 'path';
import * as os from 'os';
import { writeFile, unlink } from 'fs/promises';
import { createReadStream } from 'fs';
import { providerAudio } from '../utils/provider-call';

export interface TranscriptionResult {
  text: string;
}

/**
 * VoicePipelineService
 *
 * Handles the OpenAI audio layer only:
 *   - STT: audio buffer → transcription text (Whisper)
 *   - TTS: text → audio/mpeg buffer (OpenAI TTS)
 *
 * Does NOT touch Claude or conversation logic.
 * Callers (AIVoiceService) wire STT → Claude → TTS.
 */
@Injectable()
export class VoicePipelineService {
  private readonly openai: OpenAI;
  private readonly logger = new Logger(VoicePipelineService.name);

  constructor(private readonly config: ConfigService) {
    this.openai = new OpenAI({ apiKey: this.config.get<string>('OPENAI_API_KEY') });
  }

  /**
   * Transcribe an audio buffer using OpenAI Whisper.
   * Writes a temp file (Whisper requires a stream), transcribes, cleans up.
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

  /**
   * Generate text-to-speech audio from a reply string.
   * Returns undefined on failure (audio is optional — text response still works).
   */
  async synthesise(
    text: string,
    voice: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer' = 'alloy',
  ): Promise<Buffer | undefined> {
    const cleaned = text
      .replace(/```[\s\S]*?```/g, '')
      .replace(/\*\*|__|\*|_|~~|`/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .trim()
      .slice(0, 4096);

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
      this.logger.warn(`TTS generation failed: ${err instanceof Error ? err.message : String(err)}`);
      return undefined;
    }
  }

  /**
   * Standalone TTS — converts any text to audio/mpeg.
   * Used by the /ai/speak endpoint.  Throws on failure (caller handles the error response).
   */
  async generateSpeech(
    text: string,
    voice: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer' = 'nova',
  ): Promise<Buffer> {
    const cleaned = text
      .replace(/```[\s\S]*?```/g, '')
      .replace(/\*\*|__|\*|_|~~|`/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .trim()
      .slice(0, 4096);

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
}
