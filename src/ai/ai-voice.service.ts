import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

// Interfaces
interface ProcessResult {
  response: string;
  conversationId: string;
  transcription?: string;
}

@Injectable()
export class AIVoiceService {
  private openai: OpenAI;
  private conversations: Map<string, ChatCompletionMessageParam[]> = new Map();

  constructor(private configService: ConfigService) {
    this.openai = new OpenAI({
      apiKey: this.configService.get('OPENAI_API_KEY'),
    });
  }

  async processTextCommand(
    message: string,
    userId: string,
    conversationId?: string
  ): Promise<ProcessResult> {
    try {
      // Use provided conversationId or create a new one
      const currentConversationId = conversationId || `${userId}-${Date.now()}`;
      
      // Get or create conversation history
      const conversationHistory = this.conversations.get(currentConversationId) || [];
      
      // Add user message to history
      conversationHistory.push({ role: 'user', content: message } as ChatCompletionMessageParam);
      
      // Call OpenAI with conversation context
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'You are Atom, a helpful AI construction assistant. You help with construction projects, planning, and problem-solving. Be concise and practical in your responses.'
          } as ChatCompletionMessageParam,
          ...conversationHistory
        ],
        max_tokens: 500,
        temperature: 0.7,
      });

      const aiResponse = completion.choices[0]?.message?.content || 'I apologize, but I could not generate a response.';
      
      // Add AI response to history
      conversationHistory.push({ role: 'assistant', content: aiResponse } as ChatCompletionMessageParam);
      
      // Store updated conversation (in memory for now)
      this.conversations.set(currentConversationId, conversationHistory);

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

  // Get conversation history for a specific conversation
  getConversationHistory(conversationId: string): ChatCompletionMessageParam[] {
    return this.conversations.get(conversationId) || [];
  }

  // Clear conversation history
  clearConversation(conversationId: string): void {
    this.conversations.delete(conversationId);
  }

  // Get all active conversations for a user
  getUserConversations(userId: string): string[] {
    const userConversations: string[] = [];
    for (const [conversationId] of this.conversations) {
      if (conversationId.startsWith(userId)) {
        userConversations.push(conversationId);
      }
    }
    return userConversations;
  }
}