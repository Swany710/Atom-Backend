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
    'You are Atom, a helpful AI construction assistant. Answer the user directly and concisely; if they ask the date, give the date.';

  /** Core routine for every text prompt (voice and chat) */
  private async runChatCompletion(
    sessionId: string,
    userPrompt: string,
  ): Promise<string> {
    /* 1. Fetch the **latest** 10 messages, newest-first, then restore order */
    const history = await this.chatRepo.find({
      where: { sessionId },
      order: { createdAt: 'DESC' },
      take: 10,
    });
    history.reverse(); // oldest → newest

    /* 2. Build message array */
    const messages: ChatCompletionMessageParam[] = [
      { role: 'system', content: this.systemPrompt },
      ...history.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      { role: 'user', content: userPrompt },
    ];

    /* 3. Hit OpenAI */
    const completion = await this.openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages,
      max_tokens: 500,
      temperature: 0.7,
    });

    return (
      completion.choices[0]?.message?.content?.trim() ??
      'I’m sorry, I could not generate a response.'
    );
  }

  /** Handles a plain-text request */
  async processTextCommand(
    message: string,
    userId: string,
    conversationId?: string,
  ): Promise<ProcessResult> {
    const sessionId = conversationId ?? `${userId}-${Date.now()}`;

    /* Save the user message AFTER we’ve used it to build the prompt */
    const reply = await this.runChatCompletion(sessionId, message);

    await this.chatRepo.save([
      { sessionId, role: 'user', content: message },
      { sessionId, role: 'assistant', content: reply },
    ]);

    return { response: reply, conversationId: sessionId };
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
      /* 1) Whisper transcription */
      const { text: transcription } =
        await this.openai.audio.transcriptions.create({
          file: createReadStream(tmpPath) as any,
          model: 'whisper-1',
        });

      if (!transcription?.trim()) {
        throw new Error('Transcription returned empty text');
      }

      /* 2) Reuse text pipeline */
      const result = await this.processTextCommand(
        transcription.trim(),
        userId,
        conversationId,
      );

      return { ...result, transcription: transcription.trim() };
    } finally {
      await unlink(tmpPath).catch(() =>
        this.logger.warn(`Temp file not removed: ${tmpPath}`),
      );
    }
  }
}
