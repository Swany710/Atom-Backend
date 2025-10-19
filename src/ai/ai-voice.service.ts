import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChatMemory } from './chat-memory.entity';
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
    private readonly config: ConfigService,
    @InjectRepository(ChatMemory)
    private readonly chatRepo: Repository<ChatMemory>,
  ) {
    this.openai = new OpenAI({
      apiKey: this.config.get<string>('OPENAI_API_KEY'),
    });
  }

  /* ---------------------------------------------------------------------
   *  Chat helpers
   * ------------------------------------------------------------------- */
  private readonly systemPrompt =
    'You are Atom, a helpful AI construction assistant. Answer clearly and concisely; include today’s date when asked.';

  /** Build a message array (last-10 turns) and call OpenAI */
  private async runChatCompletion(
    sessionId: string,
    userPrompt: string,
  ): Promise<string> {
    const history = await this.chatRepo.find({
      where: { sessionId },
      order: { createdAt: 'DESC' },
      take: 10,
    });
    history.reverse(); // oldest → newest

    const messages: ChatCompletionMessageParam[] = [
      { role: 'system', content: this.systemPrompt },
      ...history.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      { role: 'user', content: userPrompt },
    ];

    const completion = await this.openai.chat.completions.create({
      model: 'gpt-4.1-mini',
      messages,
      max_tokens: 500,
      temperature: 0.7,
    });

    return (
      completion.choices[0]?.message?.content?.trim() ??
      'I’m sorry, I could not generate a response.'
    );
  }

  /* ---------------------------------------------------------------------
   *  Public text pipeline
   * ------------------------------------------------------------------- */
  async processTextCommand(
    message: string,
    userId: string,
    conversationId?: string,
  ): Promise<ProcessResult> {
    /** 🔑  Use one stable ID for the whole thread */
    const sessionId = conversationId ?? userId;

    const reply = await this.runChatCompletion(sessionId, message);

    await this.chatRepo.save([
      { sessionId, role: 'user', content: message },
      { sessionId, role: 'assistant', content: reply },
    ]);

    return { response: reply, conversationId: sessionId };
  }

  /** Back-compat helper for controllers that still invoke `processPrompt` */
  async processPrompt(prompt: string, sessionId: string): Promise<string> {
    const { response } = await this.processTextCommand(
      prompt,
      sessionId,
      sessionId,
    );
    return response;
  }

  /* ---------------------------------------------------------------------
   *  Voice pipeline
   * ------------------------------------------------------------------- */
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
      if (!transcription) throw new Error('Transcription returned empty text');

      // 2) Reuse text pipeline (same session ID ⇒ full memory)
      const result = await this.processTextCommand(
        transcription,
        userId,
        conversationId ?? userId,
      );

      // 3) Return combined payload
      return { ...result, transcription };
    } finally {
      await unlink(tmpPath).catch(() =>
        this.logger.warn(`Temp file not removed: ${tmpPath}`),
      );
    }
  }
}
