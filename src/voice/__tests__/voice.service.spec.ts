/**
 * VoiceService — conversation-memory persistence tests
 *
 * Verifies that VoiceService correctly delegates memory persistence to
 * ConversationMemoryService.appendMessages() after every turn.
 */

import { VoiceService } from '../voice.service';
import { ClaudeOrchestratorService } from '../../claude/claude-orchestrator.service';
import { OpenAiTranscriptionService } from '../../transcription/openai-transcription.service';
import { ConversationMemoryService } from '../../conversations/conversation-memory.service';
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages';

// ── Mock factories ────────────────────────────────────────────────────────────

function makeNewMessages(userText: string, reply: string): MessageParam[] {
  return [
    { role: 'user',      content: userText },
    { role: 'assistant', content: reply },
  ];
}

function makeOrchestratorMock(
  reply = 'AI reply',
  userText = 'mock-user-text',
): jest.Mocked<Pick<ClaudeOrchestratorService, 'runChat'>> {
  return {
    runChat: jest.fn().mockResolvedValue({
      response:    reply,
      toolCalls:   [],
      newMessages: makeNewMessages(userText, reply),
    }),
  };
}

function makeTranscriptionMock(
  transcription = 'Transcribed speech',
  audioBuffer?: Buffer,
): jest.Mocked<Pick<OpenAiTranscriptionService, 'transcribe' | 'synthesise' | 'generateSpeech'>> {
  return {
    transcribe:     jest.fn().mockResolvedValue(transcription),
    synthesise:     jest.fn().mockResolvedValue(audioBuffer ?? undefined),
    generateSpeech: jest.fn().mockResolvedValue(Buffer.from('mp3')),
  };
}

function makeMemoryMock(): jest.Mocked<Pick<ConversationMemoryService, 'appendMessages'>> {
  return {
    appendMessages: jest.fn().mockResolvedValue(undefined),
  };
}

function buildService(
  orchestrator = makeOrchestratorMock(),
  transcription = makeTranscriptionMock(),
  memory        = makeMemoryMock(),
): VoiceService {
  return new VoiceService(
    orchestrator as unknown as ClaudeOrchestratorService,
    transcription as unknown as OpenAiTranscriptionService,
    memory        as unknown as ConversationMemoryService,
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('VoiceService — conversation-memory persistence', () => {

  // ── processTextCommand ────────────────────────────────────────────────────

  describe('processTextCommand', () => {
    it('calls memory.appendMessages with the newMessages from the orchestrator', async () => {
      const orchestrator = makeOrchestratorMock('Hello from Claude', 'Hello');
      const memory       = makeMemoryMock();
      const svc          = buildService(orchestrator, undefined, memory);

      await svc.processTextCommand('Hello', 'user-1');

      expect(memory.appendMessages).toHaveBeenCalledTimes(1);
      expect(memory.appendMessages).toHaveBeenCalledWith(
        'user-1',
        makeNewMessages('Hello', 'Hello from Claude'),
      );
    });

    it('uses userId as sessionId when no conversationId is provided', async () => {
      const memory = makeMemoryMock();
      const svc    = buildService(undefined, undefined, memory);
      await svc.processTextCommand('Hello', 'user-42');
      const [sessionId] = (memory.appendMessages as jest.Mock).mock.calls[0];
      expect(sessionId).toBe('user-42');
    });

    it('uses the provided conversationId as sessionId', async () => {
      const memory = makeMemoryMock();
      const svc    = buildService(undefined, undefined, memory);
      await svc.processTextCommand('Hi', 'user-42', 'conv-xyz');
      const [sessionId] = (memory.appendMessages as jest.Mock).mock.calls[0];
      expect(sessionId).toBe('conv-xyz');
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
      const newMsgs = makeNewMessages('Send email', 'Done');
      const orchestrator: any = {
        runChat: jest.fn().mockResolvedValue({
          response:    'Done',
          toolCalls:   [{ tool: 'send_email', args: {}, result: 'ok' }],
          newMessages: newMsgs,
        }),
      };
      const memory = makeMemoryMock();
      const svc    = buildService(orchestrator, undefined, memory);
      const result = await svc.processTextCommand('Send email', 'user-1');
      expect(memory.appendMessages).toHaveBeenCalledTimes(1);
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

    it('calls memory.appendMessages with newMessages after voice turn', async () => {
      const orchestrator  = makeOrchestratorMock('Voice reply', 'Voice transcription');
      const transcription = makeTranscriptionMock('Voice transcription');
      const memory        = makeMemoryMock();
      const svc           = buildService(orchestrator, transcription, memory);

      await svc.processVoiceCommand(audioBuffer, 'user-1');

      expect(memory.appendMessages).toHaveBeenCalledTimes(1);
      expect(memory.appendMessages).toHaveBeenCalledWith(
        'user-1',
        makeNewMessages('Voice transcription', 'Voice reply'),
      );
    });

    it('uses userId as sessionId when no conversationId is provided', async () => {
      const memory = makeMemoryMock();
      await buildService(undefined, undefined, memory).processVoiceCommand(audioBuffer, 'voice-user-99');
      const [sessionId] = (memory.appendMessages as jest.Mock).mock.calls[0];
      expect(sessionId).toBe('voice-user-99');
    });

    it('uses the provided conversationId as sessionId', async () => {
      const memory = makeMemoryMock();
      await buildService(undefined, undefined, memory).processVoiceCommand(audioBuffer, 'user-1', 'voice-conv-55');
      const [sessionId] = (memory.appendMessages as jest.Mock).mock.calls[0];
      expect(sessionId).toBe('voice-conv-55');
    });

    it('returns the transcription in the result', async () => {
      const trans  = makeTranscriptionMock('My spoken words');
      const result = await buildService(undefined, trans).processVoiceCommand(audioBuffer, 'user-1');
      expect(result.transcription).toBe('My spoken words');
    });

    it('includes audioResponse when TTS succeeds', async () => {
      const audioOut = Buffer.from('mp3-output');
      const trans    = makeTranscriptionMock('Text', audioOut);
      const result   = await buildService(undefined, trans).processVoiceCommand(audioBuffer, 'user-1');
      expect(result.audioResponse).toEqual(audioOut);
    });

    it('omits audioResponse when synthesise returns undefined (soft failure)', async () => {
      const trans  = makeTranscriptionMock('Text', undefined);
      const result = await buildService(undefined, trans).processVoiceCommand(audioBuffer, 'user-1');
      expect(result.audioResponse).toBeUndefined();
    });

    it('calls transcribe with the provided buffer and mimeType', async () => {
      const trans = makeTranscriptionMock();
      await buildService(undefined, trans).processVoiceCommand(audioBuffer, 'user-1', undefined, 'audio/webm');
      expect(trans.transcribe).toHaveBeenCalledWith(audioBuffer, 'audio/webm');
    });

    it('persists messages before TTS so a soft TTS failure does not lose the record', async () => {
      const trans  = makeTranscriptionMock('speech', undefined);
      const memory = makeMemoryMock();
      await buildService(undefined, trans, memory).processVoiceCommand(audioBuffer, 'user-1');
      expect(memory.appendMessages).toHaveBeenCalledTimes(1);
    });
  });
});
