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
      const apiKey = this.configService.get('OPENAI_API_KEY');
      
      console.log('🔍 OpenAI Initialization:');
      console.log('   API Key exists:', !!apiKey);
      console.log('   API Key length:', apiKey?.length || 0);
      
      if (!apiKey) {
        console.error('❌ OPENAI_API_KEY not found!');
        this.isOpenAIConfigured = false;
        return;
      }
      
      this.openai = new OpenAI({
        apiKey: apiKey,
      });
      
      // Test the API key
      console.log('🧪 Testing OpenAI API...');
      const testCompletion = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: 'Hello' }],
        max_tokens: 5,
      });
      
      console.log('✅ OpenAI API working!');
      this.isOpenAIConfigured = true;
      
    } catch (error) {
      console.error('❌ OpenAI setup failed:', error.message);
      this.isOpenAIConfigured = false;
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
      service: 'Personal AI Assistant',
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
      timestamp: new Date().toISOString()
    };
  }

  // Text processing
  @Post('ai/text-command1')
  async processTextCommand(@Body() body: TextCommandRequest) {
    console.log('📝 Text command received:', body.message);

    if (!this.isOpenAIConfigured) {
      return {
        message: "OpenAI is not configured. Please check the API key and restart the server.",
        conversationId: `error-${Date.now()}`,
        timestamp: new Date(),
        mode: 'error'
      };
    }

    try {
      if (!body || !body.message) {
        throw new BadRequestException('Message is required');
      }

      const conversationId = body.conversationId || `${body.userId || 'user'}-${Date.now()}`;
      const conversationHistory = this.conversations.get(conversationId) || [];
      
      conversationHistory.push({ role: 'user', content: body.message });

      const completion = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'You are Atom, a helpful personal AI assistant. You help with daily tasks, productivity, scheduling, reminders, information lookup, decision-making, planning, and general life assistance. Be friendly, conversational, and genuinely helpful.'
          },
          ...conversationHistory
        ],
        max_tokens: 500,
        temperature: 0.7,
      });

      const aiResponse = completion.choices[0]?.message?.content || 'Sorry, I could not generate a response.';
      conversationHistory.push({ role: 'assistant', content: aiResponse });
      this.conversations.set(conversationId, conversationHistory);

      console.log('✅ Text response generated');

      return {
        message: aiResponse,
        conversationId: conversationId,
        timestamp: new Date(),
        mode: 'openai'
      };

    } catch (error) {
      console.error('❌ Text processing error:', error.message);
      return {
        message: `Text processing failed: ${error.message}`,
        conversationId: `error-${Date.now()}`,
        timestamp: new Date(),
        mode: 'error'
      };
    }
  }

  // Voice processing with enhanced debugging
  @Post('ai/voice-command1')
  @UseInterceptors(FileInterceptor('audio'))
  async processVoiceCommand(@UploadedFile() file: any, @Body() body: any) {
    console.log('🎤 Voice command received:');
    console.log('   File exists:', !!file);
    console.log('   File size:', file?.size || 'unknown');
    console.log('   File type:', file?.mimetype || 'unknown');
    console.log('   File buffer length:', file?.buffer?.length || 'no buffer');
    console.log('   Body:', body);
    console.log('   OpenAI configured:', this.isOpenAIConfigured);

    if (!this.isOpenAIConfigured) {
      console.log('❌ OpenAI not configured for voice');
      return {
        message: "OpenAI is not configured for voice processing. Please check the API key.",
        transcription: '[Configuration Error]',
        conversationId: `voice-error-${Date.now()}`,
        timestamp: new Date(),
        mode: 'error'
      };
    }

    if (!file) {
      console.log('❌ No audio file received');
      return {
        message: "No audio file was received. Please make sure your microphone is working and try again.",
        transcription: '[No Audio File]',
        conversationId: `voice-error-${Date.now()}`,
        timestamp: new Date(),
        mode: 'error'
      };
    }

    try {
      console.log('🎤 Processing audio with Whisper...');
      console.log('   Buffer size:', file.buffer.length, 'bytes');

      // Create FormData for OpenAI API (Node.js compatible way)
      const FormData = require('form-data');
      const form = new FormData();
      
      // Add the audio buffer to form data
      form.append('file', file.buffer, {
        filename: file.originalname || 'audio.wav',
        contentType: file.mimetype || 'audio/wav'
      });
      form.append('model', 'whisper-1');

      // Make direct API call to OpenAI
      const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.configService.get('OPENAI_API_KEY')}`,
          ...form.getHeaders()
        },
        body: form
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Whisper API error:', response.status, errorText);
        throw new Error(`Whisper API error: ${response.status} ${errorText}`);
      }

      const transcriptionResult = await response.json();
      const transcribedText = transcriptionResult.text || 'Could not transcribe audio';

      console.log('✅ Whisper transcription:', transcribedText);

      // Process the transcribed text
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
        mode: 'openai'
      };

    } catch (error) {
      console.error('❌ Voice processing error:', error);
      console.error('   Error details:', {
        message: error.message,
        stack: error.stack?.split('\n')[0]
      });
      
      return {
        message: `Voice processing failed: ${error.message}. Please try speaking clearly and check your microphone.`,
        transcription: '[Processing Error]',
        conversationId: `voice-error-${Date.now()}`,
        timestamp: new Date(),
        mode: 'error',
        errorDetails: error.message
      };
    }
  }

  // Alternative endpoints
  @Post('ai/text-command')
  async processTextCommandAlt(@Body() body: TextCommandRequest) {
    return this.processTextCommand(body);
  }

  @Post('ai/voice-command')
  @UseInterceptors(FileInterceptor('audio'))
  async processVoiceCommandAlt(@UploadedFile() file: any, @Body() body: any) {
    return this.processVoiceCommand(file, body);
  }

  @Post('ai/text')
  async processText(@Body() body: TextCommandRequest) {
    return this.processTextCommand(body);
  }

  @Post('ai/voice')
  @UseInterceptors(FileInterceptor('audio'))
  async processVoice(@UploadedFile() file: any, @Body() body: any) {
    return this.processVoiceCommand(file, body);
  }
}