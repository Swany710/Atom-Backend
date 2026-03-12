/**
 * Conversation-memory persistence tests
 *
 * Verifies that AIVoiceService correctly delegates memory persistence to
 * ConversationMemoryService (appendPair) after every processTextCommand
 * and processVoiceCommand call.
 *
 * Updated to reflect the four-service split:
 *   ClaudeTaskOrchestratorService  — reasoning engine (mocked)
 *   OpenAiVoiceGatewayService      — audio I/O       (mocked)
 *   ConversationMemoryService      — persistence      (mocked — this is what we verify)
 */

import { AIVoiceService } from '../ai-voice.service';
import { ClaudeTaskOrchestratorService } from '../claude-task-orchestrator.service';
import { OpenAiVoiceGatewayService } from '../openai-voice-gateway.service';
import { ConversationMemoryService } from '../conversation-memory.service';

// ── Mock factories ────────────────────────────────────────────────────────────

function makeOrchestratorMock(
  reply = 'AI reply',
): jest.Mocked<Pick<ClaudeTaskOrchestratorService, 'runChat'>> {
  return {
    runChat: jest.fn().mockResolvedValue({ response: reply, toolCalls: [] }),
  };
}

function makeVoiceGatewayMock(
  transcription = 'Transcribed speech',
  audioBuffer?: Buffer,
): jest.Mocked<Pick<OpenAiVoiceGatewayService, 'transcribe' | 'synthesise' | 'generateSpeech'>> {
  return {
    transcribe:     jest.fn().mockResolvedValue(transcription),
    synthesise:     jest.fn().mockResolvedValue(audioBuffer ?? undefined),
    generateSpeech: jest.fn().mockResolvedValue(Buffer.from('mp3')),
  };
}

function makeMemoryMock(): jest.Mocked<Pick<ConversationMemoryService, 'appendPair' | 'appendSingle'>> {
  return {
    appendPair:   jest.fn().mockResolvedValue(undefined),
    appendSingle: jest.fn().mockResolvedValue(undefined),
  };
}

function buildService(
  orchestrator = makeOrchestratorMock(),
  voiceGateway = makeVoiceGatewayMock(),
  memory       = makeMemoryMock(),
): AIVoiceService {
  return new AIVoiceService(
    orchestrator as unknown as ClaudeTaskOrchestratorService,
    voiceGateway as unknown as OpenAiVoiceGatewayService,
    memory       as unknown as ConversationMemoryService,
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AIVoiceService — conversation-memory persistence', () => {

  // ── processTextCommand ────────────────────────────────────────────────────

  describe('processTextCommand', () => {
    it('calls memory.appendPair with user message and assistant reply', async () => {
      const orchestrator = makeOrchestratorMock('Hello from Claude');
      const memory       = makeMemoryMock();
      const svc          = buildService(orchestrator, makeVoiceGatewayMock(), memory);

      await svc.processTextCommand('Hello', 'user-1');

      expect(memory.appendPair).toHaveBeenCalledTimes(1);
      expect(memory.appendPair).toHaveBeenCalledWith('user-1', 'Hello', 'Hello from Claude');
    });

    it('uses userId as sessionId when no conversationId is provided', async () => {
      const memory = makeMemoryMock();
      const svc    = buildService(undefined, undefined, memory);
      await svc.processTextCommand('Hello', 'user-42');
      expect(memory.appendPair).toHaveBeenCalledWith('user-42', 'Hello', 'AI reply');
    });

    it('uses the provided conversationId as sessionId', async () => {
      const memory = makeMemoryMock();
      const svc    = buildService(undefined, undefined, memory);
      await svc.processTextCommand('Hi', 'user-42', 'conv-xyz');
      expect(memory.appendPair).toHaveBeenCalledWith('conv-xyz', 'Hi', 'AI reply');
    });

    it('returns the conversationId from the session', async () => {
      const svc    = buildService();
      const result = await svc.processTextCommand('Hello', 'user-1', 'conv-99');
      expect(result.conversationId).toBe('conv-99');
    });

    it('returns the AI reply as response', async () => {
      const orchestrator = makeOrchestratorMock('The answer is 42');
      const svc          = buildService(orchestrator);
      const result       = await svc.processTextCommand('What is the answer?', 'user-1');
      expect(result.response).toBe('The answer is 42');
    });

    it('persists messages even when tool calls are present', async () => {
      const orchestrator: any = {
        runChat: jest.fn().mockResolvedValue({
          response: 'Done', toolCalls: [{ tool: 'send_email', args: {}, result: 'ok' }],
        }),
      };
      const memory = makeMemoryMock();
      const svc    = buildService(orchestrator, undefined, memory);
      const result = await svc.processTextCommand('Send email', 'user-1');
      expect(memory.appendPair).toHaveBeenCalledTimes(1);
      expect(result.toolCalls).toHaveLength(1);
    });

    it('does NOT include toolCalls in result when none are returned', async () => {
      const result = await buildService().processTextCommand('Hello', 'user-1');
      expect(result.toolCalls).toBeUndefined();
    });
  });

  // ── processVoiceCommand ───────────────────────────────────────────────────

  describe('processVoiceCommand', () => {
    const audioBuffer = Buffer.alloc(5_000);

    it('calls memory.appendPair with transcription and assistant reply', async () => {
      const orchestrator = makeOrchestratorMock('Voice reply');
      const voiceGateway = makeVoiceGatewayMock('Voice transcription');
      const memory       = makeMemoryMock();
      const svc          = buildService(orchestrator, voiceGateway, memory);

      await svc.processVoiceCommand(audioBuffer, 'user-1');

      expect(memory.appendPair).toHaveBeenCalledTimes(1);
      expect(memory.appendPair).toHaveBeenCalledWith(
        'user-1', 'Voice transcription', 'Voice reply',
      );
    });

    it('uses userId as sessionId when no conversationId is provided', async () => {
      const memory = makeMemoryMock();
      await buildService(undefined, undefined, memory).processVoiceCommand(audioBuffer, 'voice-user-99');
      expect(memory.appendPair).toHaveBeenCalledWith('voice-user-99', 'Transcribed speech', 'AI reply');
    });

    it('uses the provided conversationId as sessionId', async () => {
      const memory = makeMemoryMock();
      await buildService(undefined, undefined, memory).processVoiceCommand(audioBuffer, 'user-1', 'voice-conv-55');
      const [sessionId] = (memory.appendPair as jest.Mock).mock.calls[0];
      expect(sessionId).toBe('voice-conv-55');
    });

    it('returns the transcription in the result', async () => {
      const voiceGateway = makeVoiceGatewayMock('My spoken words');
      const result       = await buildService(undefined, voiceGateway).processVoiceCommand(audioBuffer, 'user-1');
      expect(result.transcription).toBe('My spoken words');
    });

    it('includes audioResponse when TTS succeeds', async () => {
      const audioOut     = Buffer.from('mp3-output');
      const voiceGateway = makeVoiceGatewayMock('Text', audioOut);
      const result       = await buildService(undefined, voiceGateway).processVoiceCommand(audioBuffer, 'user-1');
      expect(result.audioResponse).toEqual(audioOut);
    });

    it('omits audioResponse when TTS synthesise returns undefined (soft failure)', async () => {
      const voiceGateway = makeVoiceGatewayMock('Text', undefined);
      const result       = await buildService(undefined, voiceGateway).processVoiceCommand(audioBuffer, 'user-1');
      expect(result.audioResponse).toBeUndefined();
    });

    it('calls transcribe with the provided buffer and mimeType', async () => {
      const voiceGateway = makeVoiceGatewayMock();
      await buildService(undefined, voiceGateway).processVoiceCommand(audioBuffer, 'user-1', undefined, 'audio/webm');
      expect(voiceGateway.transcribe).toHaveBeenCalledWith(audioBuffer, 'audio/webm');
    });

    it('persists messages before TTS so a soft TTS failure does not lose the record', async () => {
      // synthesise returns undefined (gateway swallows TTS errors — never throws)
      const voiceGateway = makeVoiceGatewayMock('speech', undefined);
      const memory       = makeMemoryMock();
      await buildService(undefined, voiceGateway, memory).processVoiceCommand(audioBuffer, 'user-1');
      expect(memory.appendPair).toHaveBeenCalledTimes(1);
    });
  });
});
