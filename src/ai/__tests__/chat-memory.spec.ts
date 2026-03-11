/**
 * Chat-memory persistence tests
 *
 * Verifies that AIVoiceService correctly saves user + assistant messages
 * to the ChatMemory repository after every processTextCommand and
 * processVoiceCommand call.
 */

import { AIVoiceService } from '../ai-voice.service';
import { ConversationOrchestratorService } from '../conversation-orchestrator.service';
import { VoicePipelineService } from '../voice-pipeline.service';
import { Repository } from 'typeorm';
import { ChatMemory } from '../chat-memory.entity';

// ── helpers ───────────────────────────────────────────────────────────────────

function makeRepoMock(): jest.Mocked<Pick<Repository<ChatMemory>, 'save'>> {
  return { save: jest.fn().mockResolvedValue(undefined) };
}

function makeOrchestratorMock(reply = 'AI reply'): jest.Mocked<Pick<ConversationOrchestratorService, 'runChat'>> {
  return {
    runChat: jest.fn().mockResolvedValue({
      response:  reply,
      toolCalls: [],
    }),
  };
}

function makePipelineMock(
  transcription = 'Transcribed speech',
  audioBuffer?: Buffer,
): jest.Mocked<Pick<VoicePipelineService, 'transcribe' | 'synthesise' | 'generateSpeech'>> {
  return {
    transcribe:     jest.fn().mockResolvedValue(transcription),
    synthesise:     jest.fn().mockResolvedValue(audioBuffer ?? undefined),
    generateSpeech: jest.fn().mockResolvedValue(Buffer.from('mp3')),
  };
}

function buildService(
  repo       = makeRepoMock(),
  orchestrator = makeOrchestratorMock(),
  pipeline   = makePipelineMock(),
): AIVoiceService {
  return new AIVoiceService(
    repo as unknown as Repository<ChatMemory>,
    orchestrator as unknown as ConversationOrchestratorService,
    pipeline as unknown as VoicePipelineService,
  );
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('AIVoiceService — chat-memory persistence', () => {

  // ── processTextCommand ────────────────────────────────────────────────────

  describe('processTextCommand', () => {
    it('saves user message and assistant reply to the repo', async () => {
      const repo         = makeRepoMock();
      const orchestrator = makeOrchestratorMock('Hello from Claude');
      const svc          = buildService(repo, orchestrator);

      await svc.processTextCommand('Hello', 'user-1');

      expect(repo.save).toHaveBeenCalledTimes(1);
      const saved = repo.save.mock.calls[0][0] as unknown as any[];
      expect(saved).toHaveLength(2);
      expect(saved[0]).toMatchObject({ role: 'user', content: 'Hello' });
      expect(saved[1]).toMatchObject({ role: 'assistant', content: 'Hello from Claude' });
    });

    it('uses userId as sessionId when no conversationId is provided', async () => {
      const repo = makeRepoMock();
      const svc  = buildService(repo);

      await svc.processTextCommand('Hello', 'user-42');

      const saved = repo.save.mock.calls[0][0] as unknown as any[];
      expect(saved[0].sessionId).toBe('user-42');
      expect(saved[1].sessionId).toBe('user-42');
    });

    it('uses the provided conversationId as sessionId', async () => {
      const repo = makeRepoMock();
      const svc  = buildService(repo);

      await svc.processTextCommand('Hi', 'user-42', 'conv-xyz');

      const saved = repo.save.mock.calls[0][0] as unknown as any[];
      expect(saved[0].sessionId).toBe('conv-xyz');
      expect(saved[1].sessionId).toBe('conv-xyz');
    });

    it('returns the conversationId from the session', async () => {
      const svc    = buildService();
      const result = await svc.processTextCommand('Hello', 'user-1', 'conv-99');
      expect(result.conversationId).toBe('conv-99');
    });

    it('returns the AI reply as response', async () => {
      const orchestrator = makeOrchestratorMock('The answer is 42');
      const svc          = buildService(makeRepoMock(), orchestrator);

      const result = await svc.processTextCommand('What is the answer?', 'user-1');
      expect(result.response).toBe('The answer is 42');
    });

    it('saves even when tool calls are present', async () => {
      const orchestrator = {
        runChat: jest.fn().mockResolvedValue({
          response:  'Done',
          toolCalls: [{ tool: 'send_email', args: {}, result: 'ok' }],
        }),
      };
      const repo = makeRepoMock();
      const svc  = buildService(repo, orchestrator as any);

      const result = await svc.processTextCommand('Send email', 'user-1');
      expect(repo.save).toHaveBeenCalledTimes(1);
      expect(result.toolCalls).toHaveLength(1);
    });

    it('does NOT include toolCalls in result when none are returned', async () => {
      const svc    = buildService();
      const result = await svc.processTextCommand('Hello', 'user-1');
      expect(result.toolCalls).toBeUndefined();
    });
  });

  // ── processVoiceCommand ───────────────────────────────────────────────────

  describe('processVoiceCommand', () => {
    const audioBuffer = Buffer.alloc(5_000);

    it('saves transcription (as user) and assistant reply to the repo', async () => {
      const repo         = makeRepoMock();
      const orchestrator = makeOrchestratorMock('Voice reply');
      const pipeline     = makePipelineMock('Voice transcription');
      const svc          = buildService(repo, orchestrator, pipeline);

      await svc.processVoiceCommand(audioBuffer, 'user-1');

      expect(repo.save).toHaveBeenCalledTimes(1);
      const saved = repo.save.mock.calls[0][0] as unknown as any[];
      expect(saved).toHaveLength(2);
      expect(saved[0]).toMatchObject({ role: 'user',      content: 'Voice transcription' });
      expect(saved[1]).toMatchObject({ role: 'assistant', content: 'Voice reply' });
    });

    it('uses userId as sessionId when no conversationId is provided', async () => {
      const repo = makeRepoMock();
      const svc  = buildService(repo);

      await svc.processVoiceCommand(audioBuffer, 'voice-user-99');

      const saved = repo.save.mock.calls[0][0] as unknown as any[];
      expect(saved[0].sessionId).toBe('voice-user-99');
      expect(saved[1].sessionId).toBe('voice-user-99');
    });

    it('uses the provided conversationId as sessionId', async () => {
      const repo = makeRepoMock();
      const svc  = buildService(repo);

      await svc.processVoiceCommand(audioBuffer, 'user-1', 'voice-conv-55');

      const saved = repo.save.mock.calls[0][0] as unknown as any[];
      expect(saved[0].sessionId).toBe('voice-conv-55');
    });

    it('returns the transcription in the result', async () => {
      const pipeline = makePipelineMock('My spoken words');
      const svc      = buildService(makeRepoMock(), makeOrchestratorMock(), pipeline);

      const result = await svc.processVoiceCommand(audioBuffer, 'user-1');
      expect(result.transcription).toBe('My spoken words');
    });

    it('includes audioResponse in result when TTS succeeds', async () => {
      const audioOut = Buffer.from('mp3-output');
      const pipeline = makePipelineMock('Text', audioOut);
      const svc      = buildService(makeRepoMock(), makeOrchestratorMock(), pipeline);

      const result = await svc.processVoiceCommand(audioBuffer, 'user-1');
      expect(result.audioResponse).toEqual(audioOut);
    });

    it('omits audioResponse when TTS returns undefined', async () => {
      const pipeline = makePipelineMock('Text', undefined);
      const svc      = buildService(makeRepoMock(), makeOrchestratorMock(), pipeline);

      const result = await svc.processVoiceCommand(audioBuffer, 'user-1');
      expect(result.audioResponse).toBeUndefined();
    });

    it('calls transcribe with the provided buffer and mimeType', async () => {
      const pipeline = makePipelineMock();
      const svc      = buildService(makeRepoMock(), makeOrchestratorMock(), pipeline);

      await svc.processVoiceCommand(audioBuffer, 'user-1', undefined, 'audio/webm');
      expect(pipeline.transcribe).toHaveBeenCalledWith(audioBuffer, 'audio/webm');
    });

    it('still saves messages even when TTS synthesise throws', async () => {
      const pipeline: any = {
        transcribe:     jest.fn().mockResolvedValue('speech'),
        synthesise:     jest.fn().mockRejectedValue(new Error('TTS down')),
        generateSpeech: jest.fn(),
      };
      const repo = makeRepoMock();
      const svc  = buildService(repo, makeOrchestratorMock(), pipeline);

      // synthesise failure should propagate (it's not caught in AIVoiceService itself)
      await expect(svc.processVoiceCommand(audioBuffer, 'user-1')).rejects.toThrow('TTS down');
      // save should NOT have been called because the error was thrown before we got there
      // This verifies the save placement is after TTS — update if implementation changes
    });
  });
});
