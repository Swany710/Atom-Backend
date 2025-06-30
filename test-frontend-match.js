import { Controller, Get, Post, Body, UploadedFile, UseInterceptors, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AppService } from './app.service';
import { ConfigService } from '@nestjs/config';

interface TextCommandRequest {
  message: string;
  userId?: string;
  conversationId?: string;
}

@Controller()
export class AppController {
  private conversations: Map<string, any[]> = new Map();

  constructor(
    private readonly appService: AppService,
    private readonly configService: ConfigService
  ) {
    console.log('✅ Atom Backend Controller initialized');
  }

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('health')
  getHealth() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('ai/health')
  getAIHealth() {
    const apiKey = this.configService.get('OPENAI_API_KEY');
    const isConfigured = !!apiKey && apiKey.startsWith('sk-');
    
    return { 
      status: 'ok', 
      service: 'Personal AI Assistant',
      openaiConfigured: isConfigured,
      timestamp: new Date().toISOString()
    };
  }

  @Get('ai/status')
  getAIStatus() {
    const apiKey = this.configService.get('OPENAI_API_KEY');
    const isConfigured = !!apiKey && apiKey.startsWith('sk-');
    
    return {
      status: isConfigured ? 'available' : 'configuration_error',
      aiService: isConfigured ? 'online' : 'offline',
      mode: isConfigured ? 'openai' : 'error',
      timestamp: new Date().toISOString()
    };
  }

  // EXACT MATCH: /api/v1/ai/text-command1 (what your frontend calls)
  @Post('ai/text-command1')
  async processTextCommand1(@Body() body: TextCommandRequest) {
    console.log('💬 Frontend text request:', body);
    
    try {
      if (!body || !body.message) {
        throw new BadRequestException('Message is required');
      }

      const apiKey = this.configService.get('OPENAI_API_KEY');
      if (!apiKey || !apiKey.startsWith('sk-')) {
        return {
          message: "Hi! I'm Atom, but I need an OpenAI API key to chat with you. Please configure the OPENAI_API_KEY environment variable.",
          conversationId: `error-${Date.now()}`,
          timestamp: new Date(),
          mode: 'error'
        };
      }

      console.log('🤖 Calling OpenAI GPT...');

      // Direct fetch to OpenAI API (matches what frontend expects)
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-3.5-turbo',
          messages: [
            {
              role: 'system',
              content: 'You are Atom, a helpful personal AI assistant. You help with daily tasks, productivity, scheduling, reminders, information lookup, decision-making, planning, and general life assistance. Be friendly, conversational, and genuinely helpful. Keep responses concise but informative.'
            },
            {
              role: 'user',
              content: body.message
            }
          ],
          max_tokens: 500,
          temperature: 0.7,
        })
      });

      if (!response.ok) {
        console.error('❌ OpenAI API Error:', response.status);
        
        if (response.status === 401) {
          return {
            message: "I'm having authentication issues with OpenAI. Please check that the API key is valid and has sufficient credits.",
            conversationId: `error-${Date.now()}`,
            timestamp: new Date(),
            mode: 'error'
          };
        }
        
        if (response.status === 429) {
          return {
            message: "I'm currently at capacity. Please try again in a moment.",
            conversationId: `error-${Date.now()}`,
            timestamp: new Date(),
            mode: 'error'
          };
        }
        
        throw new Error(`OpenAI API error: ${response.status}`);
      }

      const data = await response.json();
      const aiResponse = data.choices[0]?.message?.content || 'Sorry, I could not generate a response.';

      console.log('✅ GPT Response generated successfully');

      // Store conversation for memory (simple in-memory)
      const conversationId = body.conversationId || `${body.userId || 'user'}-${Date.now()}`;
      const conversation = this.conversations.get(conversationId) || [];
      conversation.push(
        { role: 'user', content: body.message, timestamp: new Date() },
        { role: 'assistant', content: aiResponse, timestamp: new Date() }
      );
      this.conversations.set(conversationId, conversation);

      // EXACT response format your frontend expects
      return {
        message: aiResponse,
        conversationId: conversationId,
        timestamp: new Date(),
        mode: 'openai'  // ← Frontend checks for this!
      };

    } catch (error) {
      console.error('❌ Text processing error:', error.message);
      
      return {
        message: `I'm experiencing technical difficulties: ${error.message}. Please try again in a moment.`,
        conversationId: `error-${Date.now()}`,
        timestamp: new Date(),
        mode: 'error',
        error: error.message
      };
    }
  }

  // EXACT MATCH: /api/v1/ai/voice-command1 (what your frontend calls)
  @Post('ai/voice-command1')
  @UseInterceptors(FileInterceptor('audio'))
  async processVoiceCommand1(@UploadedFile() file: any, @Body() body: any) {
    console.log('🎤 Frontend voice request:');
    console.log('   File exists:', !!file);
    console.log('   File size:', file?.size || 'unknown');
    console.log('   File type:', file?.mimetype || 'unknown');
    console.log('   Form data:', body);

    try {
      if (!file || !file.buffer) {
        return {
          message: "No audio file was received. Please check your microphone permissions and try recording again.",
          transcription: '[No Audio File]',
          conversationId: `voice-error-${Date.now()}`,
          timestamp: new Date(),
          mode: 'error'
        };
      }

      const apiKey = this.configService.get('OPENAI_API_KEY');
      if (!apiKey || !apiKey.startsWith('sk-')) {
        return {
          message: "I can hear you, but I need an OpenAI API key to process voice commands. Please configure the OPENAI_API_KEY environment variable.",
          transcription: '[API Key Missing]',
          conversationId: `voice-error-${Date.now()}`,
          timestamp: new Date(),
          mode: 'error'
        };
      }

      console.log('🎤 Transcribing with Whisper...');

      // Use fetch with FormData for Whisper API (Node.js compatible)
      const FormData = require('form-data');
      const form = new FormData();
      
      form.append('file', file.buffer, {
        filename: file.originalname || 'audio.webm',
        contentType: file.mimetype || 'audio/webm'
      });
      form.append('model', 'whisper-1');

      const transcriptionResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          ...form.getHeaders()
        },
        body: form
      });

      if (!transcriptionResponse.ok) {
        const errorText = await transcriptionResponse.text();
        console.error('❌ Whisper API error:', transcriptionResponse.status, errorText);
        
        return {
          message: "I had trouble understanding your voice. Please try speaking clearly or use text instead.",
          transcription: '[Transcription Failed]',
          conversationId: `voice-error-${Date.now()}`,
          timestamp: new Date(),
          mode: 'error'
        };
      }

      const transcriptionData = await transcriptionResponse.json();
      const transcribedText = transcriptionData.text || 'Could not transcribe audio';

      console.log('✅ Transcription successful:', transcribedText);

      // Now process the transcribed text with GPT (reuse text logic)
      const textResult = await this.processTextCommand1({
        message: transcribedText,
        userId: body.userId || 'voice-user'
      });

      // EXACT response format your frontend expects for voice
      return {
        message: textResult.message,
        transcription: transcribedText,  // ← Frontend displays this!
        conversationId: textResult.conversationId,
        timestamp: new Date(),
        mode: textResult.mode  // ← Frontend checks this!
      };

    } catch (error) {
      console.error('❌ Voice processing error:', error);
      
      return {
        message: `Voice processing failed: ${error.message}. Please try speaking clearly or use text instead.`,
        transcription: '[Processing Error]',
        conversationId: `voice-error-${Date.now()}`,
        timestamp: new Date(),
        mode: 'error',
        error: error.message
      };
    }
  }

  // Get conversation history
  @Get('ai/conversation/:conversationId')
  getConversation(@Body('conversationId') conversationId: string) {
    const conversation = this.conversations.get(conversationId) || [];
    return {
      conversationId,
      messages: conversation,
      messageCount: conversation.length,
      timestamp: new Date()
    };
  }

  // Clear conversation
  @Post('ai/conversation/clear')
  clearConversation(@Body() body: { conversationId?: string }) {
    if (body.conversationId) {
      this.conversations.delete(body.conversationId);
    } else {
      this.conversations.clear();
    }
    
    return {
      message: 'Conversation cleared',
      timestamp: new Date()
    };
  }
}