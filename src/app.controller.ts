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

  // Text processing - Working perfectly
  @Post('ai/text-command1')
  async processTextCommand1(@Body() body: TextCommandRequest) {
    console.log('💬 Text request:', body.message?.substring(0, 50));
    
    try {
      if (!body || !body.message) {
        throw new BadRequestException('Message is required');
      }

      const apiKey = this.configService.get('OPENAI_API_KEY');
      if (!apiKey || !apiKey.startsWith('sk-')) {
        return {
          message: "Hi! I'm Atom, but I need an OpenAI API key to chat with you.",
          conversationId: `error-${Date.now()}`,
          timestamp: new Date(),
          mode: 'error'
        };
      }

      console.log('🤖 Calling OpenAI GPT...');

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
              content: 'You are Atom, a helpful personal AI assistant. Be friendly, conversational, and genuinely helpful. Keep responses concise but informative.'
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
            message: "I'm having authentication issues with OpenAI. Please check the API key.",
            conversationId: `error-${Date.now()}`,
            timestamp: new Date(),
            mode: 'error'
          };
        }
        
        throw new Error(`OpenAI API error: ${response.status}`);
      }

      const data = await response.json();
      const aiResponse = data.choices[0]?.message?.content || 'Sorry, I could not generate a response.';

      console.log('✅ GPT Response generated');

      const conversationId = body.conversationId || `${body.userId || 'user'}-${Date.now()}`;
      const conversation = this.conversations.get(conversationId) || [];
      conversation.push(
        { role: 'user', content: body.message, timestamp: new Date() },
        { role: 'assistant', content: aiResponse, timestamp: new Date() }
      );
      this.conversations.set(conversationId, conversation);

      return {
        message: aiResponse,
        conversationId: conversationId,
        timestamp: new Date(),
        mode: 'openai'
      };

    } catch (error) {
      console.error('❌ Text processing error:', error.message);
      
      return {
        message: `I'm experiencing technical difficulties: ${error.message}`,
        conversationId: `error-${Date.now()}`,
        timestamp: new Date(),
        mode: 'error',
        error: error.message
      };
    }
  }

  // FIXED Voice processing - Proper Whisper API FormData
  @Post('ai/voice-command1')
  @UseInterceptors(FileInterceptor('audio'))
  async processVoiceCommand1(@UploadedFile() file: any, @Body() body: any) {
    console.log('🎤 Voice request received');
    console.log('   File exists:', !!file);
    console.log('   File size:', file?.size || 'no file');
    console.log('   File type:', file?.mimetype || 'no type');

    try {
      // Step 1: Validate file
      if (!file || !file.buffer || file.size === 0) {
        console.log('❌ No valid audio file received');
        return {
          message: "I didn't receive any audio. Please check your microphone permissions and try again.",
          transcription: '[No Audio]',
          conversationId: `voice-error-${Date.now()}`,
          timestamp: new Date(),
          mode: 'error'
        };
      }

      // Step 2: Check API key
      const apiKey = this.configService.get('OPENAI_API_KEY');
      if (!apiKey || !apiKey.startsWith('sk-')) {
        console.log('❌ OpenAI API key not configured');
        return {
          message: "I can hear you, but I need an OpenAI API key to process voice commands.",
          transcription: '[API Key Missing]',
          conversationId: `voice-error-${Date.now()}`,
          timestamp: new Date(),
          mode: 'error'
        };
      }

      console.log('🎤 Processing audio with Whisper API...');
      console.log('   Audio size:', file.size, 'bytes');

      // Step 3: FIXED Whisper API call with proper FormData
      let transcribedText = '';
      
      try {
        // Create FormData compatible with OpenAI's expectations
        const FormData = require('form-data');
        const form = new FormData();
        
        // Key fix: Use proper file stream instead of buffer directly
        const audioFilename = `audio_${Date.now()}.webm`;
        
        // Option 1: Create readable stream from buffer
        const { Readable } = require('stream');
        const audioStream = Readable.from(file.buffer);
        
        form.append('file', audioStream, {
          filename: audioFilename,
          contentType: file.mimetype || 'audio/webm',
          knownLength: file.buffer.length
        });
        form.append('model', 'whisper-1');
        form.append('response_format', 'json'); // Explicit format

        console.log('   Sending to Whisper API with proper FormData...');
        
        // Enhanced fetch with better headers
        const transcriptionResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            ...form.getHeaders(),
            'User-Agent': 'Atom-Backend/1.0'
          },
          body: form
        });

        console.log('   Whisper response status:', transcriptionResponse.status);
        console.log('   Whisper response headers:', transcriptionResponse.headers.get('content-type'));

        if (!transcriptionResponse.ok) {
          const errorText = await transcriptionResponse.text();
          console.error('❌ Whisper API error details:', {
            status: transcriptionResponse.status,
            statusText: transcriptionResponse.statusText,
            error: errorText
          });
          
          // More specific error messages based on status
          if (transcriptionResponse.status === 400) {
            console.log('   Trying alternative FormData approach...');
            
            // Alternative approach: Use buffer directly with different options
            const altForm = new FormData();
            altForm.append('file', file.buffer, {
              filename: 'audio.wav', // Try different extension
              contentType: 'audio/wav',
            });
            altForm.append('model', 'whisper-1');
            
            const altResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${apiKey}`,
                ...altForm.getHeaders()
              },
              body: altForm
            });
            
            if (altResponse.ok) {
              const altData = await altResponse.json();
              transcribedText = altData.text?.trim() || '';
              console.log('✅ Alternative approach worked:', transcribedText.substring(0, 50));
            } else {
              throw new Error(`Audio format not supported by Whisper (tried multiple formats)`);
            }
          } else if (transcriptionResponse.status === 401) {
            throw new Error('OpenAI API authentication failed - check API key');
          } else if (transcriptionResponse.status === 429) {
            throw new Error('OpenAI API rate limit exceeded - please wait a moment');
          } else {
            throw new Error(`Whisper API error: ${transcriptionResponse.status} - ${errorText}`);
          }
        } else {
          // Success - parse response
          const transcriptionData = await transcriptionResponse.json();
          transcribedText = transcriptionData.text?.trim() || '';
          console.log('✅ Transcription successful:', transcribedText.substring(0, 50));
        }

      } catch (transcriptionError) {
        console.error('❌ Transcription failed:', transcriptionError.message);
        
        return {
          message: `I had trouble understanding your voice: ${transcriptionError.message}. Please try speaking clearly or use text instead.`,
          transcription: '[Transcription Failed]',
          conversationId: `voice-error-${Date.now()}`,
          timestamp: new Date(),
          mode: 'error'
        };
      }

      // Step 4: Validate transcription
      if (!transcribedText || transcribedText.length < 2) {
        console.log('❌ Empty or very short transcription:', transcribedText);
        return {
          message: "I couldn't understand what you said. Please try speaking more clearly or check your microphone.",
          transcription: '[Empty Transcription]',
          conversationId: `voice-error-${Date.now()}`,
          timestamp: new Date(),
          mode: 'error'
        };
      }

      console.log('🤖 Processing transcribed text with GPT...');

      // Step 5: Process with GPT (reuse working text logic)
      const textResult = await this.processTextCommand1({
        message: transcribedText,
        userId: body.userId || 'voice-user'
      });

      console.log('✅ Voice processing complete');

      // Return voice-specific response format
      return {
        message: textResult.message,
        transcription: transcribedText,
        conversationId: textResult.conversationId,
        timestamp: new Date(),
        mode: textResult.mode
      };

    } catch (error) {
      console.error('❌ Voice processing error:', error.message);
      console.error('   Stack:', error.stack);
      
      return {
        message: `Voice processing failed: ${error.message}. Please try text chat instead.`,
        transcription: '[Processing Error]',
        conversationId: `voice-error-${Date.now()}`,
        timestamp: new Date(),
        mode: 'error',
        error: error.message
      };
    }
  }

  // Conversation management
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