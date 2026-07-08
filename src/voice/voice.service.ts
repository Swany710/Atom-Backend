import { Injectable } from '@nestjs/common';
import { VoiceOrchestratorService } from './voice-orchestrator.service';

export interface ProcessResult {
  response: string;
  conversationId: string;
  transcription?: string;
  audioResponse?: Buffer;
  toolCalls?: Array<{ tool: string; args: unknown; result: unknown }>;
}

/**
 * VoiceService — public facade consumed by VoiceController.
 *
 * All pipeline logic lives in VoiceOrchestratorService.
 * This class exists purely to preserve the existing injection interface
 * so VoiceController requires no changes.
 *
 * Dependency chain:
 *   VoiceController
 *     └─► VoiceService          (facade — this file)
 *           └─► VoiceOrchestratorService  (owns STT → LLM → TTS pipeline)
 *                 ├─► ClaudeOrchestratorService  (LLM adapter + tool-use loop)
 *                 ├─► ElevenLabsTranscriptionService  (Scribe STT + ElevenLabs TTS)
 *                 └─► ConversationMemoryService   (PostgreSQL history)
 */
@Injectable()
export class VoiceService {
  constructor(private readonly pipeline: VoiceOrchestratorService) {}

  processTextCommand(
    message: string,
    userId: string,
    conversationId?: string,
    correlationId?: string,
  ) {
    return this.pipeline.processTextCommand(message, userId, conversationId, correlationId);
  }

  processPrompt(prompt: string, sessionId: string) {
    return this.pipeline.processPrompt(prompt, sessionId);
  }

  processVoiceCommand(
    audioBuffer: Buffer,
    userId: string,
    conversationId?: string,
    mimeType?: string,
  ) {
    return this.pipeline.processVoiceCommand(audioBuffer, userId, conversationId, mimeType);
  }

  processVoiceCommandFast(
    audioBuffer: Buffer,
    userId: string,
    conversationId?: string,
    mimeType?: string,
  ) {
    return this.pipeline.processVoiceCommandFast(audioBuffer, userId, conversationId, mimeType);
  }

  generateSpeech(
    text: string,
    voice: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer' = 'nova',
  ) {
    return this.pipeline.generateSpeech(text, voice);
  }
}
