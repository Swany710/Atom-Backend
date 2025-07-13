import { Injectable, Logger } from '@nestjs/common';
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
  private openai: OpenAI;
  private readonly logger = new Logger(AIVoiceService.name);

  constructor(
    private configService: ConfigService,
    @InjectRepository(ChatMemory)
    private chatRepo: Repository<ChatMemory>,
  ) {
    this.openai = new OpenAI({
      apiKey: this.configService.get<string>('OPENAI_API_KEY'),
    });
  }

  async sendToOpenAI(prompt: string): Promise<string> {
    const completion = await this.openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: prompt }],
    });

    const text = completion.choices?.[0]?.message?.content?.trim();
    return text || 'Sorry, I could not generate a response.';
  }

  async processPrompt(prompt: string, sessionId: string): Promise<string> {
    await this.chatRepo.save({ sessionId, role: 'user', content: prompt });

    const memory = await this.chatRepo.find({
      where: { sessionId },
      order: { createdAt: 'ASC' },
      take: 10,
    });

    const messages: ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content:
          'You are Atom, a helpful AI construction assistant. You help with construction projects, planning, and problem-solving. Be concise and practical in your responses.',
      },
      ...memory.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    ];

    const response = await this.openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages,
    });

    const reply = response.choices[0].message.content;

    await this.chatRepo.save({ sessionId, role: 'assistant', content: reply });

    return reply;
  }

  async processTextCommand(
    message: string,
    userId: string,
    conversationId?: string
  ): Promise<ProcessResult> {
    try {
      const currentConversationId = conversationId || `${userId}-${Date.now()}`;

      await this.chatRepo.save({ sessionId: currentConversationId, role: 'user', content: message });

      const memory = await this.chatRepo.find({
        where: { sessionId: currentConversationId },
        order: { createdAt: 'ASC' },
        take: 10,
      });

      const messages: ChatCompletionMessageParam[] = [
        {
          role: 'system',
          content:
            'You are Atom, a helpful AI construction assistant. You help with construction projects, planning, and problem-solving. Be concise and practical in your responses.',
        },
        ...memory.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      ];

      const completion = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages,
        max_tokens: 500,
        temperature: 0.7,
      });

      const aiResponse = completion.choices[0]?.message?.content || 'I apologize, but I could not generate a response.';

      await this.chatRepo.save({ sessionId: currentConversationId, role: 'assistant', content: aiResponse });

      return {
        response: aiResponse,
        conversationId: currentConversationId,
        memory: [...messages, { role: 'assistant', content: aiResponse }],
      };
    } catch (error) {
      console.error('OpenAI API error:', error);
      throw new Error('Failed to process text command');
    }
  }

  async processVoiceCommand(
    audioBuffer: Buffer,
    userId: string,
    conversationId?: string
  ): Promise<ProcessResult> {
    const tempFilePath = path.join(os.tmpdir(), `voice-${Date.now()}.mp3`);
    await writeFile(tempFilePath, audioBuffer);

    try {
      this.logger.debug(`Temp file written: ${tempFilePath}`);

      const transcriptionResponse = await this.openai.audio.transcriptions.create({
        file: createReadStream(tempFilePath) as any,
        model: 'whisper-1',
      });

      const transcription = transcriptionResponse.text?.trim();

      if (!transcription) {
        throw new Error('Transcription is empty or failed');
      }

      const result = await this.processTextCommand(transcription, userId, conversationId);

      return {
        ...result,
        transcription,
      };
    } catch (error) {
      this.logger.error('Voice command processing error:', error);
      throw new Error('Failed to process voice command');
    } finally {
      await unlink(tempFilePath).catch((e) => {
        this.logger.warn(`Failed to clean up temp file: ${tempFilePath}`);
      });
    }
  }

  private async transcribeAudio(audioBuffer: Buffer): Promise<string> {
    try {
      const audioFile = new File([audioBuffer], 'audio.wav', { type: 'audio/wav' });

      const transcription = await this.openai.audio.transcriptions.create({
        file: audioFile,
        model: 'whisper-1',
      });

      return transcription.text || 'Could not transcribe audio';
    } catch (error) {
      console.error('Transcription error:', error);
      throw new Error('Failed to transcribe audio');
    }
  }
}
