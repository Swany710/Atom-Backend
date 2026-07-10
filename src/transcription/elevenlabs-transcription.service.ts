import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { providerAudio } from '../utils/provider-call';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const axios = require('axios').default ?? require('axios');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const FormData = require('form-data');

/**
 * ElevenLabsTranscriptionService
 *
 * ElevenLabs is used EXCLUSIVELY for audio I/O (replaces OpenAI Whisper/TTS —
 * see openai-transcription.service.ts, retained for easy rollback):
 *   - Speech-to-Text  :  audio buffer → transcription string  (Scribe)
 *   - Text-to-Speech  :  text string  → audio/mpeg buffer     (ElevenLabs TTS)
 *
 * ElevenLabs is NOT used for reasoning, tool selection, or orchestration —
 * all decision-making flows through ClaudeOrchestratorService.
 *
 * Env vars:
 *   ELEVENLABS_API_KEY    (required)
 *   ELEVENLABS_VOICE_ID   (optional — overrides the voice-name mapping)
 *   ELEVENLABS_TTS_MODEL  (optional — default eleven_turbo_v2_5)
 *   ELEVENLABS_STT_MODEL  (optional — default scribe_v1)
 *
 * The public method signatures are IDENTICAL to OpenAiTranscriptionService,
 * including the OpenAI voice names ('alloy'…'shimmer') still sent by the
 * frontend — they are mapped to comparable ElevenLabs premade voices below,
 * so no caller (voice pipeline, controller, frontend) needs to change.
 */

/** OpenAI voice name → comparable ElevenLabs premade voice ID. */
const VOICE_MAP: Record<string, string> = {
  alloy:   'EXAVITQu4vr4xnSDxMaL', // Sarah    — neutral female
  echo:    'JBFqnCBsd6RMkjVDRZzb', // George   — warm male
  fable:   'onwK4e9ZLuTAKqWW03F9', // Daniel   — British male
  onyx:    'nPczCjzI2devNBz1zQrb', // Brian    — deep male
  nova:    '21m00Tcm4TlvDq8ikWAM', // Rachel   — warm female (default)
  shimmer: 'pFZP5JQG7iQjIQuC4Bku', // Lily     — soft female
};
const DEFAULT_VOICE_ID = VOICE_MAP.nova;

@Injectable()
export class ElevenLabsTranscriptionService {
  private readonly logger = new Logger(ElevenLabsTranscriptionService.name);
  private readonly apiKey: string;
  private readonly ttsModel: string;
  private readonly sttModel: string;
  private readonly voiceOverride?: string;
  private readonly baseUrl = 'https://api.elevenlabs.io/v1';

  constructor(private readonly config: ConfigService) {
    this.apiKey        = this.config.get<string>('ELEVENLABS_API_KEY') ?? '';
    this.ttsModel      = this.config.get<string>('ELEVENLABS_TTS_MODEL') || 'eleven_turbo_v2_5';
    this.sttModel      = this.config.get<string>('ELEVENLABS_STT_MODEL') || 'scribe_v1';
    this.voiceOverride = this.config.get<string>('ELEVENLABS_VOICE_ID') || undefined;
    if (!this.apiKey) {
      this.logger.warn('ELEVENLABS_API_KEY not set — voice features disabled');
    }
  }

  private voiceIdFor(voice?: string): string {
    return this.voiceOverride ?? VOICE_MAP[voice ?? 'nova'] ?? DEFAULT_VOICE_ID;
  }

  // ── STT — Speech-to-Text (ElevenLabs Scribe) ─────────────────────────────

  /**
   * Transcribe an audio buffer.
   * POST /v1/speech-to-text (multipart: file + model_id) → { text, ... }
   */
  async transcribe(audioBuffer: Buffer, mimeType?: string): Promise<string> {
    if (!this.apiKey) throw new Error('ELEVENLABS_API_KEY not configured');

    const ext = mimeType?.includes('webm') ? '.webm'
              : mimeType?.includes('ogg')  ? '.ogg'
              : mimeType?.includes('wav')  ? '.wav'
              : mimeType?.includes('mp4')  ? '.mp4'
              : '.mp3';

    const form = new FormData();
    form.append('model_id', this.sttModel);
    form.append('file', audioBuffer, {
      filename:    `voice${ext}`,
      contentType: mimeType || 'audio/mpeg',
    });

    // axios is require()'d (any), so providerAudio<T> infers T=unknown — annotate.
    const res: any = await providerAudio(
      () => axios.post(`${this.baseUrl}/speech-to-text`, form, {
        headers: { 'xi-api-key': this.apiKey, ...form.getHeaders() },
        timeout: 30_000,
        maxBodyLength: Infinity,
      }),
      'elevenlabs.speech_to_text',
    );

    const transcription = (res.data?.text as string | undefined)?.trim();
    if (!transcription) throw new Error('ElevenLabs returned empty transcription');
    return transcription;
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
    try {
      return await this.tts(text, voice);
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
    return this.tts(text, voice);
  }

  /** POST /v1/text-to-speech/{voiceId} → audio/mpeg bytes */
  private async tts(text: string, voice?: string): Promise<Buffer> {
    if (!this.apiKey) throw new Error('ELEVENLABS_API_KEY not configured');
    const cleaned = this.cleanForTts(text);

    const res: any = await providerAudio(
      () => axios.post(
        `${this.baseUrl}/text-to-speech/${this.voiceIdFor(voice)}`,
        {
          text:     cleaned || 'I had nothing to say.',
          model_id: this.ttsModel,
        },
        {
          headers: {
            'xi-api-key':  this.apiKey,
            'Content-Type': 'application/json',
            Accept:        'audio/mpeg',
          },
          responseType: 'arraybuffer',
          timeout: 30_000,
        },
      ),
      'elevenlabs.text_to_speech',
    );

    return Buffer.from(res.data);
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
