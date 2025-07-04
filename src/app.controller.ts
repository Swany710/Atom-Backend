// src/app.controller.ts - Fixed Voice Processing with Audio Format Handling
import { Controller, Post, Body, UseInterceptors, UploadedFile, Get } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import FormData from 'form-data';
import { Readable } from 'stream';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

@Controller('api/v1')
export class AppController {
  private conversations = new Map<string, any[]>();

  constructor(private configService: ConfigService) {}

  @Get('ai/health')
  healthCheck() {
    return {
      status: 'ok',
      service: 'Personal AI Assistant',
      openaiConfigured: !!this.configService.get('OPENAI_API_KEY'),
      timestamp: new Date().toISOString()
    };
  }

  // Text processing endpoint (already working)
  @Post('ai/text-command1')
  async processTextCommand1(@Body() body: any) {
    console.log('💬 Text request:', body.message?.substring(0, 50));

    try {
      const apiKey = this.configService.get('OPENAI_API_KEY');
      if (!apiKey) {
        throw new Error('OpenAI API key not configured');
      }

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
        throw new Error(`OpenAI API error: ${response.status}`);
      }

      const data = await response.json();
      const aiResponse = data.choices[0]?.message?.content || 'Sorry, I could not generate a response.';

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

  // FIXED Voice processing with multiple approaches
  @Post('ai/voice-command1')
  @UseInterceptors(FileInterceptor('audio'))
  async processVoiceCommand1(@UploadedFile() file: any, @Body() body: any) {
    console.log('🎤 Voice request received');
    console.log('   File exists:', !!file);
    console.log('   File size:', file?.size || 'no file');
    console.log('   File type:', file?.mimetype || 'no type');

    try {
      // Validate file
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

      // Check API key
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

      let transcribedText = '';
      
      // Try multiple approaches in order of likelihood to succeed
      const approaches = [
        // Approach 1: Direct buffer with proper headers
        async () => {
          console.log('   Trying Approach 1: Direct buffer with WebM...');
          const form = new FormData();
          
          // Create a buffer stream
          const bufferStream = Readable.from(file.buffer);
          
          form.append('file', bufferStream, {
            filename: 'audio.webm',
            contentType: 'audio/webm',
          });
          form.append('model', 'whisper-1');
          
          return await this.callWhisperAPI(form, apiKey);
        },
        
        // Approach 2: Save to temp file first (most reliable)
        async () => {
          console.log('   Trying Approach 2: Temp file approach...');
          const tempDir = path.join(process.cwd(), 'temp');
          if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
          }
          
          const tempFilePath = path.join(tempDir, `audio_${Date.now()}.webm`);
          fs.writeFileSync(tempFilePath, file.buffer);
          
          try {
            const form = new FormData();
            const fileStream = fs.createReadStream(tempFilePath);
            
            form.append('file', fileStream, {
              filename: 'audio.webm',
              contentType: 'audio/webm',
            });
            form.append('model', 'whisper-1');
            
            const result = await this.callWhisperAPI(form, apiKey);
            
            // Clean up temp file
            fs.unlinkSync(tempFilePath);
            
            return result;
          } catch (error) {
            // Clean up temp file on error
            if (fs.existsSync(tempFilePath)) {
              fs.unlinkSync(tempFilePath);
            }
            throw error;
          }
        },
        
        // Approach 3: Try with WAV mime type (sometimes works better)
        async () => {
          console.log('   Trying Approach 3: Fake WAV mime type...');
          const form = new FormData();
          const bufferStream = Readable.from(file.buffer);
          
          form.append('file', bufferStream, {
            filename: 'audio.wav',
            contentType: 'audio/wav',
          });
          form.append('model', 'whisper-1');
          
          return await this.callWhisperAPI(form, apiKey);
        },
        
        // Approach 4: Try M4A format (another supported format)
        async () => {
          console.log('   Trying Approach 4: M4A format...');
          const form = new FormData();
          const bufferStream = Readable.from(file.buffer);
          
          form.append('file', bufferStream, {
            filename: 'audio.m4a',
            contentType: 'audio/m4a',
          });
          form.append('model', 'whisper-1');
          
          return await this.callWhisperAPI(form, apiKey);
        }
      ];
      
      // Try each approach until one works
      let lastError = null;
      for (const approach of approaches) {
        try {
          const result = await approach();
          if (result && result.text) {
            transcribedText = result.text.trim();
            console.log('✅ Transcription successful:', transcribedText.substring(0, 50));
            break;
          }
        } catch (error) {
          console.log(`   ❌ Approach failed: ${error.message}`);
          lastError = error;
          continue;
        }
      }
      
      if (!transcribedText) {
        throw lastError || new Error('All transcription approaches failed');
      }

      // Process the transcribed text through GPT
      console.log('💭 Calling OpenAI GPT...');
      
      const gptResponse = await fetch('https://api.openai.com/v1/chat/completions', {
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
              content: 'You are Atom, a helpful personal AI assistant responding to voice commands. Be friendly, conversational, and genuinely helpful. Keep responses concise but informative.'
            },
            {
              role: 'user',
              content: transcribedText
            }
          ],
          max_tokens: 500,
          temperature: 0.7,
        })
      });

      if (!gptResponse.ok) {
        throw new Error(`GPT API error: ${gptResponse.status}`);
      }

      const gptData = await gptResponse.json();
      const aiResponse = gptData.choices[0]?.message?.content || 'Sorry, I could not generate a response.';

      console.log('✅ GPT Response generated');

      // Store conversation
      const conversationId = body.conversationId || `${body.userId || 'user'}-voice-${Date.now()}`;
      const conversation = this.conversations.get(conversationId) || [];
      conversation.push(
        { role: 'user', content: transcribedText, timestamp: new Date() },
        { role: 'assistant', content: aiResponse, timestamp: new Date() }
      );
      this.conversations.set(conversationId, conversation);

      return {
        message: aiResponse,
        transcription: transcribedText,
        conversationId: conversationId,
        timestamp: new Date(),
        mode: 'openai'
      };

    } catch (error) {
      console.error('❌ Voice processing error:', error.message);
      
      return {
        message: `I had trouble processing your voice command: ${error.message}. Please try speaking clearly or use text instead.`,
        transcription: '[Processing Failed]',
        conversationId: `voice-error-${Date.now()}`,
        timestamp: new Date(),
        mode: 'error'
      };
    }
  }
  
  // Helper method to call Whisper API
  private async callWhisperAPI(form: FormData, apiKey: string): Promise<any> {
    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        ...form.getHeaders()
      },
      body: form as any
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Whisper API error:', {
        status: response.status,
        error: errorText
      });
      
      if (response.status === 400) {
        throw new Error('Audio format not supported by Whisper');
      } else if (response.status === 401) {
        throw new Error('OpenAI API authentication failed');
      } else if (response.status === 429) {
        throw new Error('OpenAI API rate limit exceeded');
      } else {
        throw new Error(`Whisper API error: ${response.status}`);
      }
    }

    return await response.json();
  }
}