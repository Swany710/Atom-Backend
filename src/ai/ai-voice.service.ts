import {
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { ChatMemory } from './chat-memory.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as path from 'path';
import * as os from 'os';
import { writeFile, unlink } from 'fs/promises';
import { createReadStream } from 'fs';

interface ProcessResult {
  response: string;
  conversationId: string;
  transcription?: string;
  memory?: ChatCompletionMessageParam[];
}

@Injectable()
export class AIVoiceService {
  private readonly openai: OpenAI;
  private readonly logger = new Logger(AIVoiceService.name);

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(ChatMemory)
    private readonly chatRepo: Repository<ChatMemory>,
  ) {
    this.openai = new OpenAI({
      apiKey: this.configService.get<string>('OPENAI_API_KEY'),
    });
  }

  /* ----------------------------------------------------------------
   *  Text helpers
   * ---------------------------------------------------------------- */
  private systemPrompt =
    'You are Atom, a helpful AI construction assistant. You help with construction projects, planning, and problem-solving. Be concise and practical in your responses.';

  async processPrompt(prompt: string, sessionId: string): Promise<string> {
    await this.chatRepo.save({ sessionId, role: 'user', content: prompt });

    const memory = await this.chatRepo.find({
      where: { sessionId },
      order: { createdAt: 'ASC' },
      take: 10,
    });

    const messages: ChatCompletionMessageParam[] = [
      { role: 'system', content: this.systemPrompt },
      ...memory.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    ];

    const completion = await this.openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages,
      max_tokens: 500,
      temperature: 0.7,
    });

    const reply =
      completion.choices[0]?.message?.content?.trim() ??
      'I’m sorry, I could not generate a response.';

    await this.chatRepo.save({ sessionId, role: 'assistant', content: reply });
    return reply;
  }

  async processTextCommand(
    message: string,
    userId: string,
    conversationId?: string,
  ): Promise<ProcessResult> {
    const currentConversationId = conversationId ?? `${userId}-${Date.now()}`;

    const response = await this.processPrompt(message, currentConversationId);

    return {
      response,
      conversationId: currentConversationId,
    };
  }

  /* ----------------------------------------------------------------
   *  Voice helpers
   * ---------------------------------------------------------------- */
  async processVoiceCommand(
    audioBuffer: Buffer,
    userId: string,
    conversationId?: string,
  ): Promise<ProcessResult> {
    const tmpPath = path.join(os.tmpdir(), `voice-${Date.now()}.mp3`);
    await writeFile(tmpPath, audioBuffer);

    try {
      // 1) Whisper transcription
      const { text } = await this.openai.audio.transcriptions.create({
        file: createReadStream(tmpPath) as any,
        model: 'whisper-1',
      });

      const transcription = text?.trim();
      if (!transcription) {
        throw new Error('Transcription returned empty text');
      }

      // 2) Normal text-processing flow (saves memory)
      const result = await this.processTextCommand(
        transcription,
        userId,
        conversationId,
      );

      // 3) Merge and return
      return {
        ...result,
        transcription,
      };
    } catch (err) {
      this.logger.error('Voice command processing error', err);
      throw new Error('Failed to process voice command');
    } finally {
      await unlink(tmpPath).catch(() =>
        this.logger.warn(`Temp file not removed: ${tmpPath}`),
      );
    }
  }
}
