import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { VoiceController } from '../voice.controller';
import { VoiceService } from '../voice.service';
import { ConversationMemoryService } from '../../conversations/conversation-memory.service';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockResult = {
  response:       'Hello from AI',
  conversationId: 'conv-abc',
  toolCalls:      undefined,
};

const mockVoiceService: Partial<VoiceService> = {
  processTextCommand:  jest.fn().mockResolvedValue(mockResult),
  processVoiceCommand: jest.fn().mockResolvedValue({
    ...mockResult,
    transcription: 'Hello there',
    audioResponse: undefined,
  }),
  generateSpeech: jest.fn().mockResolvedValue(Buffer.from('audio-data')),
};

const mockMemory: Partial<ConversationMemoryService> = {
  getRawMessages: jest.fn().mockResolvedValue([
    { id: 1, sessionId: 'conv-abc', role: 'user', content: 'Hi', createdAt: new Date() },
  ]),
  clearSession: jest.fn().mockResolvedValue(undefined),
};

function makeMockRes() {
  const res: Record<string, any> = {};
  res.status    = jest.fn().mockReturnValue(res);
  res.json      = jest.fn().mockReturnValue(res);
  res.send      = jest.fn().mockReturnValue(res);
  res.setHeader = jest.fn().mockReturnValue(res);
  return res;
}

// ── Setup ─────────────────────────────────────────────────────────────────────

describe('VoiceController', () => {
  let controller: VoiceController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [VoiceController],
      providers: [
        { provide: VoiceService,                useValue: mockVoiceService },
        { provide: ConversationMemoryService,   useValue: mockMemory },
      ],
    }).compile();

    controller = module.get<VoiceController>(VoiceController);
    jest.clearAllMocks();

    (mockVoiceService.processTextCommand as jest.Mock).mockResolvedValue(mockResult);
    (mockVoiceService.processVoiceCommand as jest.Mock).mockResolvedValue({
      ...mockResult,
      transcription: 'Hello there',
      audioResponse: undefined,
    });
    (mockVoiceService.generateSpeech as jest.Mock).mockResolvedValue(
      Buffer.from('audio-data'),
    );
    (mockMemory.getRawMessages as jest.Mock).mockResolvedValue([
      { id: 1, sessionId: 'conv-abc', role: 'user', content: 'Hi', createdAt: new Date() },
    ]);
    (mockMemory.clearSession as jest.Mock).mockResolvedValue(undefined);
  });

  // ── GET /ai/health ────────────────────────────────────────────────────────

  describe('GET /api/v1/ai/health', () => {
    it('returns status ok with service name and timestamp', () => {
      const result = controller.getHealth();
      expect(result.status).toBe('ok');
      expect(result.service).toBe('Atom AI');
      expect(typeof result.timestamp).toBe('string');
    });
  });

  // ── POST /api/v1/ai/text ──────────────────────────────────────────────────

  describe('POST /api/v1/ai/text', () => {
    const fakeReq = { atomUserId: 'user-uuid-123' };

    it('returns { message, conversationId, timestamp } on success', async () => {
      const result = await controller.handleText(
        { message: 'What is on my calendar?' },
        fakeReq,
      );
      expect(result.message).toBe('Hello from AI');
      expect(result.conversationId).toBe('conv-abc');
      expect(typeof result.timestamp).toBe('string');
      expect(mockVoiceService.processTextCommand).toHaveBeenCalledWith(
        'What is on my calendar?',
        'user-uuid-123',
        undefined,
      );
    });

    it('passes conversationId when provided', async () => {
      await controller.handleText({ message: 'Reply', conversationId: 'existing-conv' }, fakeReq);
      expect(mockVoiceService.processTextCommand).toHaveBeenCalledWith(
        'Reply', 'user-uuid-123', 'existing-conv',
      );
    });

    it('throws BadRequestException when message is missing', async () => {
      await expect(controller.handleText({ message: '' }, fakeReq))
        .rejects.toBeInstanceOf(BadRequestException);
      await expect(controller.handleText({ message: '   ' }, fakeReq))
        .rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws HttpException (500) when service throws', async () => {
      (mockVoiceService.processTextCommand as jest.Mock).mockRejectedValueOnce(
        new Error('Claude unavailable'),
      );
      await expect(controller.handleText({ message: 'Hello' }, fakeReq))
        .rejects.toMatchObject({ status: 500 });
    });
  });

  // ── POST /api/v1/ai/voice ─────────────────────────────────────────────────

  describe('POST /api/v1/ai/voice', () => {
    const fakeReq = { atomUserId: 'user-uuid-123' };

    function makeFile(size = 5_000): any {
      return {
        fieldname:    'audio',
        originalname: 'recording.webm',
        encoding:     '7bit',
        mimetype:     'audio/webm',
        size,
        buffer:       Buffer.alloc(size),
      };
    }

    it('returns JSON voice response on success', async () => {
      const res = makeMockRes();
      await controller.handleVoice(makeFile(), res as any, fakeReq);
      expect(res.setHeader).toHaveBeenCalledWith('X-Transcription', 'Hello there');
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Hello from AI', transcription: 'Hello there' }),
      );
    });

    it('returns 400 when no audio file is provided', async () => {
      const res = makeMockRes();
      await controller.handleVoice(undefined as any, res as any, fakeReq);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns short-audio message without calling service when file < 1 000 bytes', async () => {
      const res = makeMockRes();
      await controller.handleVoice(makeFile(500), res as any, fakeReq);
      expect(mockVoiceService.processVoiceCommand).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ transcription: '[Too Short]' }),
      );
    });

    it('accepts a file of exactly 1 000 bytes (boundary)', async () => {
      const res = makeMockRes();
      await controller.handleVoice(makeFile(1_000), res as any, fakeReq);
      expect(mockVoiceService.processVoiceCommand).toHaveBeenCalled();
    });

    it('returns audio/mpeg when returnAudio=true and audioResponse is present', async () => {
      (mockVoiceService.processVoiceCommand as jest.Mock).mockResolvedValueOnce({
        ...mockResult,
        transcription: 'Hello',
        audioResponse: Buffer.from('mp3-bytes'),
      });
      const res = makeMockRes();
      await controller.handleVoice(makeFile(), res as any, fakeReq, undefined, undefined, 'true');
      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'audio/mpeg');
      expect(res.send).toHaveBeenCalledWith(Buffer.from('mp3-bytes'));
    });

    it('returns 500 JSON when service throws', async () => {
      (mockVoiceService.processVoiceCommand as jest.Mock).mockRejectedValueOnce(
        new Error('Whisper timeout'),
      );
      const res = makeMockRes();
      await controller.handleVoice(makeFile(), res as any, fakeReq);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Whisper timeout' }),
      );
    });
  });

  // ── POST /api/v1/ai/speak ─────────────────────────────────────────────────

  describe('POST /api/v1/ai/speak', () => {
    it('returns audio/mpeg buffer on success', async () => {
      const res = makeMockRes();
      await controller.speak('Hello world', 'nova', res as any);
      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'audio/mpeg');
      expect(res.send).toHaveBeenCalledWith(Buffer.from('audio-data'));
    });

    it('returns 400 when text is missing', async () => {
      const res = makeMockRes();
      await controller.speak('', undefined as any, res as any);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns 500 when TTS service throws', async () => {
      (mockVoiceService.generateSpeech as jest.Mock).mockRejectedValueOnce(
        new Error('TTS failed'),
      );
      const res = makeMockRes();
      await controller.speak('Hello', 'alloy', res as any);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  // ── GET/DELETE /api/v1/ai/conversations/:id ───────────────────────────────

  describe('GET /api/v1/ai/conversations/:id', () => {
    it('returns messages array from memory service', async () => {
      const result = await controller.getConversation('conv-abc', { atomUserId: 'conv-abc' });
      expect(mockMemory.getRawMessages).toHaveBeenCalledWith('conv-abc');
      expect(result.conversationId).toBe('conv-abc');
      expect(result.messageCount).toBe(1);
    });
  });

  describe('DELETE /api/v1/ai/conversations/:id', () => {
    it('calls clearSession and returns confirmation', async () => {
      const result = await controller.clearConversation('conv-abc', { atomUserId: 'conv-abc' });
      expect(mockMemory.clearSession).toHaveBeenCalledWith('conv-abc');
      expect(result.message).toBe('Conversation cleared');
      expect(result.conversationId).toBe('conv-abc');
    });
  });
});
