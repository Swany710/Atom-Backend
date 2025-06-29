// src/ai/ai-voice.service.ts - FULL RAILWAY VERSION WITH MEMORY
import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { ConversationService } from '../conversation/conversation.service';
import { MessageRole, MessageType } from '../conversation/entities/conversation-message.entity';

export interface VoiceCommandResult {
  success: boolean;
  transcription?: string;
  response?: string;
  actions?: any[];
  error?: string;
  timestamp: string;
}

export interface ConversationPayload {
  conversationId?: string;
  sessionId: string;
  messages: Array<{
    role: string;
    content: string;
    timestamp?: string;
  }>;
  totalMessages?: number;
  context?: Record<string, any>;
}

@Injectable()
export class AIVoiceService {
  private readonly logger = new Logger(AIVoiceService.name);
  private readonly openai: OpenAI;

  constructor(
    private readonly conversationService: ConversationService,
  ) {
    if (process.env.OPENAI_API_KEY) {
      this.openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      });
      this.logger.log('OpenAI client initialized for Railway deployment');
    } else {
      this.logger.warn('OpenAI API key not found - voice features will be limited');
    }
  }

  // Process voice command with Railway PostgreSQL memory
  async processVoiceCommand(
    audioBuffer: Buffer,
    conversationPayload?: ConversationPayload,
    userId: string = 'default-user'
  ): Promise<VoiceCommandResult> {
    const timestamp = new Date().toISOString();
    
    try {
      if (!this.openai) {
        throw new Error('OpenAI not configured');
      }

      this.logger.log(`Processing voice command for user: ${userId} on Railway`);

      // Step 1: Transcribe audio
      const transcription = await this.transcribeAudio(audioBuffer);
      this.logger.log(`Transcription: ${transcription}`);

      if (!transcription) {
        throw new Error('No transcription received');
      }

      // Step 2: Get or create conversation context
      let sessionId = conversationPayload?.sessionId;
      if (!sessionId) {
        sessionId = `voice_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      }

      // Step 3: Add user message to Railway PostgreSQL
      await this.conversationService.addMessage({
        sessionId,
        userId,
        role: MessageRole.USER,
        content: transcription,
        messageType: MessageType.VOICE,
        metadata: {
          audioLength: audioBuffer.length,
          processingTime: Date.now(),
          platform: 'railway'
        }
      });

      // Step 4: Get conversation context for AI
      const context = await this.conversationService.getConversationContext(sessionId, 10);

      // Step 5: Generate AI response with memory
      const aiResponse = await this.generateResponseWithMemory(transcription, context);

      // Step 6: Add AI response to Railway PostgreSQL
      await this.conversationService.addMessage({
        sessionId,
        userId,
        role: MessageRole.ASSISTANT,
        content: aiResponse,
        messageType: MessageType.TEXT,
        metadata: {
          originalTranscription: transcription,
          responseGeneratedAt: timestamp,
          platform: 'railway'
        }
      });

      this.logger.log('Voice command processed successfully with Railway PostgreSQL memory');

      return {
        success: true,
        transcription,
        response: aiResponse,
        actions: [], // You can add action processing here
        timestamp
      };

    } catch (error) {
      this.logger.error('Voice command processing failed:', error);
      return {
        success: false,
        error: error.message,
        timestamp
      };
    }
  }

  // Process text command with Railway PostgreSQL memory
  async processTextCommand(
    message: string,
    conversationPayload?: ConversationPayload,
    userId: string = 'default-user'
  ): Promise<VoiceCommandResult> {
    const timestamp = new Date().toISOString();

    try {
      this.logger.log(`Processing text command for user: ${userId} on Railway: ${message}`);

      // Step 1: Get or create conversation context
      let sessionId = conversationPayload?.sessionId;
      if (!sessionId) {
        sessionId = `text_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      }

      // Step 2: Add user message to Railway PostgreSQL
      await this.conversationService.addMessage({
        sessionId,
        userId,
        role: MessageRole.USER,
        content: message,
        messageType: MessageType.TEXT,
        metadata: {
          source: 'text_input',
          platform: 'railway'
        }
      });

      // Step 3: Get conversation context for AI
      const context = await this.conversationService.getConversationContext(sessionId, 10);

      // Step 4: Generate AI response with memory
      const aiResponse = await this.generateResponseWithMemory(message, context);

      // Step 5: Add AI response to Railway PostgreSQL
      await this.conversationService.addMessage({
        sessionId,
        userId,
        role: MessageRole.ASSISTANT,
        content: aiResponse,
        messageType: MessageType.TEXT,
        metadata: {
          originalMessage: message,
          responseGeneratedAt: timestamp,
          platform: 'railway'
        }
      });

      this.logger.log('Text command processed successfully with Railway PostgreSQL memory');

      return {
        success: true,
        transcription: message,
        response: aiResponse,
        actions: [], // You can add action processing here
        timestamp
      };

    } catch (error) {
      this.logger.error('Text command processing failed:', error);
      return {
        success: false,
        error: error.message,
        timestamp
      };
    }
  }

  // Generate AI response with conversation memory from Railway PostgreSQL
  private async generateResponseWithMemory(
    currentMessage: string,
    context: ConversationPayload
  ): Promise<string> {
    if (!this.openai) {
      return "I'm sorry, but AI processing is not available right now.";
    }

    try {
      // Build conversation history for OpenAI
      const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        {
          role: 'system',
          content: `You are Atom, a helpful AI construction assistant running on Railway with persistent memory. You help with:
          - Project management and scheduling
          - Task creation and tracking  
          - Email drafting and communication
          - Calendar management
          - Document organization
          - Voice commands and automation
          
          You have access to conversation history stored in Railway PostgreSQL. Remember previous conversations and maintain context.
          Be conversational, helpful, and remember what the user has told you before.
          
          Current conversation context: ${JSON.stringify(context.context || {})}
          Total messages in conversation: ${context.totalMessages || 0}
          Database: Railway PostgreSQL`
        }
      ];

      // Add conversation history from Railway PostgreSQL
      if (context.messages && context.messages.length > 0) {
        context.messages.forEach(msg => {
          messages.push({
            role: msg.role as 'user' | 'assistant',
            content: msg.content
          });
        });
      }

      // Add current message if not already in history
      const lastMessage = context.messages?.[context.messages.length - 1];
      if (!lastMessage || lastMessage.content !== currentMessage) {
        messages.push({
          role: 'user',
          content: currentMessage
        });
      }

      this.logger.log(`Sending ${messages.length} messages to OpenAI (Railway deployment)`);

      const completion = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages,
        max_tokens: 500,
        temperature: 0.7,
      });

      const response = completion.choices[0]?.message?.content || 
        "I'm sorry, I couldn't generate a response right now.";

      this.logger.log(`AI Response generated successfully: ${response.substring(0, 100)}...`);
      return response;

    } catch (error) {
      this.logger.error('OpenAI API error:', error);
      return "I'm sorry, I encountered an error while processing your request.";
    }
  }

  // Transcribe audio using OpenAI Whisper
  private async transcribeAudio(audioBuffer: Buffer): Promise<string> {
    if (!this.openai) {
      throw new Error('OpenAI not configured for transcription');
    }

    try {
      this.logger.log(`Transcribing audio buffer of size: ${audioBuffer.length} on Railway`);

      // Create a file-like object for OpenAI
      const file = new File([audioBuffer], 'audio.mp4', { type: 'audio/mp4' });

      const transcription = await this.openai.audio.transcriptions.create({
        file,
        model: 'whisper-1',
        language: 'en',
      });

      return transcription.text || '';
    } catch (error) {
      this.logger.error('Transcription failed:', error);
      throw new Error(`Transcription failed: ${error.message}`);
    }
  }

  // Legacy method for backward compatibility
  async processMessage(message: string): Promise<{ response: string }> {
    const result = await this.processTextCommand(message);
    return { response: result.response || result.error || 'No response generated' };
  }
}