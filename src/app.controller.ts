import { Controller, Get, Post, Body, UploadedFile, UseInterceptors, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AppService } from './app.service';
import OpenAI from 'openai';
import { ConfigService } from '@nestjs/config';

interface TextCommandRequest {
  message: string;
  userId?: string;
  conversationId?: string;
}

@Controller()
export class AppController {
  private openai: OpenAI;
  private conversations: Map<string, any[]> = new Map();
  private isOpenAIConfigured: boolean = false;

  constructor(
    private readonly appService: AppService,
    private readonly configService: ConfigService
  ) {
    this.initializeOpenAI();
  }

  private async initializeOpenAI() {
    try {
      // Check if API key exists
      const apiKey = this.configService.get('OPENAI_API_KEY');
      
      console.log('🔍 OpenAI Initialization Debug:');
      console.log('   API Key exists:', !!apiKey);
      console.log('   API Key length:', apiKey?.length || 0);
      console.log('   API Key starts with sk-:', apiKey?.startsWith('sk-') || false);
      console.log('   API Key preview:', apiKey ? `${apiKey.substring(0, 20)}...${apiKey.slice(-8)}` : 'NOT FOUND');
      
      if (!apiKey) {
        console.error('❌ OPENAI_API_KEY not found in environment!');
        console.error('   Check your .env file and make sure OPENAI_API_KEY is set');
        this.isOpenAIConfigured = false;
        return;
      }
      
      this.openai = new OpenAI({
        apiKey: apiKey,
      });
      
      // Test the API key with a simple request
      console.log('🧪 Testing OpenAI API key...');
      
      const testCompletion = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: 'Hello' }],
        max_tokens: 5,
      });
      
      console.log('✅ OpenAI API test successful!');
      console.log('   Test response:', testCompletion.choices[0]?.message?.content);
      this.isOpenAIConfigured = true;
      
    } catch (error) {
      console.error('❌ OpenAI initialization failed:');
      console.error('   Error type:', error.constructor.name);
      console.error('   Error status:', error.status || 'No status');
      console.error('   Error message:', error.message);
      console.error('   Error details:', error);
      
      this.isOpenAIConfigured = false;
      
      // Provide specific troubleshooting
      if (error.status === 401) {
        console.error('🔧 Fix: Invalid API key (401 Unauthorized)');
        console.error('   - Your OpenAI API key is invalid or expired');
        console.error('   - Generate a new API key at https://platform.openai.com/api-keys');
      } else if (error.status === 429) {
        console.error('🔧 Fix: Rate limit or quota exceeded (429)');
        console.error('   - Check your OpenAI usage at https://platform.openai.com/usage');
        console.error('   - Add payment method if you\'re on free tier');
      } else if (error.status === 403) {
        console.error('🔧 Fix: API access forbidden (403)');
        console.error('   - Your API key might not have the required permissions');
      }
    }
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
    return { 
      status: 'ok', 
      service: 'Personal AI Assistant with OpenAI',
      openaiConfigured: this.isOpenAIConfigured,
      timestamp: new Date().toISOString()
    };
  }

  @Get('ai/status')
  getAIStatus() {
    return {
      status: this.isOpenAIConfigured ? 'available' : 'configuration_error',
      aiService: this.isOpenAIConfigured ? 'online' : 'offline',
      mode: this.isOpenAIConfigured ? 'openai' : 'error',
      openaiConfigured: this.isOpenAIConfigured,
      timestamp: new Date().toISOString()
    };
  }

  // Real AI text processing
  @Post('ai/text-command1')
  async processTextCommand(@Body() body: TextCommandRequest) {
    console.log('📝 Text command received:', { 
      message: body.message, 
      userId: body.userId,
      openaiConfigured: this.isOpenAIConfigured 
    });

    if (!this.isOpenAIConfigured) {
      console.log('⚠️ OpenAI not configured, returning error response');
      return {
        message: "OpenAI is not properly configured. Please check your API key and try again. I'm designed to be your personal AI assistant once the connection is established.",
        conversationId: `config-error-${Date.now()}`,
        timestamp: new Date(),
        mode: 'configuration_error',
        openaiConfigured: false
      };
    }

    try {
      if (!body || !body.message) {
        throw new BadRequestException('Message is required');
      }

      console.log('🤖 Processing text with OpenAI:', body.message);

      // Create conversation ID
      const conversationId = body.conversationId || `${body.userId || 'user'}-${Date.now()}`;
      
      // Get conversation history
      const conversationHistory = this.conversations.get(conversationId) || [];
      
      // Add user message
      conversationHistory.push({ role: 'user', content: body.message });

      // Call OpenAI GPT
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'You are Atom, a helpful personal AI assistant. You help with daily tasks, productivity, scheduling, reminders, information lookup, decision-making, planning, and general life assistance. Be friendly, conversational, and genuinely helpful. Provide practical advice and support for whatever the user needs help with in their personal or professional life.'
          },
          ...conversationHistory
        ],
        max_tokens: 500,
        temperature: 0.7,
      });

      const aiResponse = completion.choices[0]?.message?.content || 'I apologize, but I could not generate a response.';
      
      // Add AI response to history
      conversationHistory.push({ role: 'assistant', content: aiResponse });
      
      // Store conversation
      this.conversations.set(conversationId, conversationHistory);

      console.log('✅ OpenAI response generated successfully');

      return {
        message: aiResponse,
        conversationId: conversationId,
        timestamp: new Date(),
        mode: 'openai',
        openaiConfigured: true
      };

    } catch (error) {
      console.error('❌ OpenAI text processing error:', error);
      console.error('   Error details:', {
        status: error.status,
        message: error.message,
        code: error.code
      });
      
      // Return helpful error response
      return {
        message: `I'm experiencing technical difficulties with OpenAI: ${error.message}. Please check the API configuration and try again.`,
        conversationId: `error-${Date.now()}`,
        timestamp: new Date(),
        mode: 'api_error',
        openaiConfigured: this.isOpenAIConfigured,
        error: {
          status: error.status,
          message: error.message
        }
      };
    }
  }

  // Real AI voice processing
  @Post('ai/voice-command1')
  @UseInterceptors(FileInterceptor('audio'))
  async processVoiceCommand(@UploadedFile() file: any, @Body() body: any) {
    console.log('🎤 Voice command received:', { 
      hasFile: !!file, 
      userId: body?.userId,
      openaiConfigured: this.isOpenAIConfigured 
    });

    if (!this.isOpenAIConfigured) {
      return {
        message: "OpenAI is not properly configured for voice processing. Please check your API key configuration.",
        transcription: '[Configuration Error]',
        conversationId: `voice-config-error-${Date.now()}`,
        timestamp: new Date(),
        mode: 'configuration_error',
        openaiConfigured: false
      };
    }

    try {
      if (!file) {
        throw new BadRequestException('Audio file is required');
      }

      console.log('🎤 Processing voice with OpenAI Whisper');

      // Step 1: Transcribe audio using OpenAI Whisper
      const audioFile = new File([file.buffer], 'audio.wav', { type: 'audio/wav' });
      
      const transcription = await this.openai.audio.transcriptions.create({
        file: audioFile,
        model: 'whisper-1',
      });

      const transcribedText = transcription.text || 'Could not transcribe audio';
      
      console.log('✅ Whisper transcription:', transcribedText);

      // Step 2: Process the transcribed text with GPT
      const textResult = await this.processTextCommand({
        message: transcribedText,
        userId: body.userId || 'voice-user',
        conversationId: body.conversationId
      });

      return {
        message: textResult.message,
        transcription: transcribedText,
        conversationId: textResult.conversationId,
        timestamp: new Date(),
        mode: 'openai',
        openaiConfigured: true
      };

    } catch (error) {
      console.error('❌ OpenAI voice processing error:', error);
      
      return {
        message: `Voice processing failed: ${error.message}. Please check the OpenAI API configuration.`,
        transcription: '[Error processing audio]',
        conversationId: `voice-error-${Date.now()}`,
        timestamp: new Date(),
        mode: 'api_error',
        openaiConfigured: this.isOpenAIConfigured,
        error: {
          status: error.status,
          message: error.message
        }
      };
    }
  }

  // Alternative route names
  @Post('ai/text-command')
  async processTextCommandAlt(@Body() body: TextCommandRequest) {
    return this.processTextCommand(body);
  }

  @Post('ai/voice-command')
  @UseInterceptors(FileInterceptor('audio'))
  async processVoiceCommandAlt(@UploadedFile() file: any, @Body() body: any) {
    return this.processVoiceCommand(file, body);
  }
}