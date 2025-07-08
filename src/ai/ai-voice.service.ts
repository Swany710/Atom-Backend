import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { ChatMemory } from './chat-memory.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
// Interfaces
interface ProcessResult {
  response: string;
  conversationId: string;
  transcription?: string;
}

@Injectable()
export class AIVoiceService {
  private openai: OpenAI;

  constructor(
    private configService: ConfigService,
    @InjectRepository(ChatMemory)
    private chatRepo: Repository<ChatMemory>,
  ) {
    this.openai = new OpenAI({
      apiKey: this.configService.get<string>('OPENAI_API_KEY'),
    });
  }

  /**
   * Send a prompt to OpenAI and return the assistant's reply as a string.
   */
  async sendToOpenAI(prompt: string): Promise<string> {
    const completion = await this.openai.chat.completions.create({
      model: 'gpt-3.5-turbo',       // or whichever model you prefer
      messages: [{ role: 'user', content: prompt }],
    });

    const text = completion.choices?.[0]?.message?.content?.trim();
    return text || 'Sorry, I could not generate a response.';
  }

  /**
   * Alias used by your controller. Returns exactly what sendToOpenAI returns.
   */
  async processPrompt(prompt: string, sessionId: string): Promise<string> {
    // 🧠 Save user message
    await this.chatRepo.save({ sessionId, role: 'user', content: prompt });

    // 🧠 Get last 10 messages for memory context
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
  ...memory.map((m) =>
    ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    } as ChatCompletionMessageParam)
  ),
];
    // 🧠 Call OpenAI
    const response = await this.openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages,
    });

    const reply = response.choices[0].message.content;

    // 🧠 Save assistant reply
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

    // Save user message to DB
    await this.chatRepo.save({ sessionId: currentConversationId, role: 'user', content: message });

    // Retrieve last 10 messages
    const memory = await this.chatRepo.find({
      where: { sessionId: currentConversationId },
      order: { createdAt: 'ASC' },
      take: 10,
    });

   const messages: ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: 'You are Atom, a helpful AI construction assistant. You help with construction projects, planning, and problem-solving. Be concise and practical in your responses.',
      },
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

    const aiResponse = completion.choices[0]?.message?.content || 'I apologize, but I could not generate a response.';

    // Save assistant response to DB
    await this.chatRepo.save({ sessionId: currentConversationId, role: 'assistant', content: aiResponse });

    return {
      response: aiResponse,
      conversationId: currentConversationId,
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
    try {
      // Step 1: Transcribe audio using OpenAI Whisper
      const transcription = await this.transcribeAudio(audioBuffer);
      
      // Step 2: Process the transcribed text
      const result = await this.processTextCommand(transcription, userId, conversationId);
      
      return {
        ...result,
        transcription,
      };
    } catch (error) {
      console.error('Voice command processing error:', error);
      throw new Error('Failed to process voice command');
    }
  }

  private async transcribeAudio(audioBuffer: Buffer): Promise<string> {
    try {
      // Create a File-like object for OpenAI
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