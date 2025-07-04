import { 
  Controller, 
  Post, 
  Body, 
  UseInterceptors, 
  UploadedFile,
  Get 
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

@Controller('api/v1')
export class AppController {
  private conversations = new Map<string, any[]>();

  constructor(private configService: ConfigService) {}

  @Get('ai/health')
  getHealth() {
    return { 
      status: 'healthy', 
      timestamp: new Date(),
      service: 'Atom Backend API' 
    };
  }

  @Post('ai/text-command')
  async processTextCommand(@Body() body: any) {
    console.log('📝 Text command received:', body.message?.substring(0, 50));

    try {
      const apiKey = this.configService.get('OPENAI_API_KEY');
      if (!apiKey || !apiKey.startsWith('sk-')) {
        return {
          message: "I need an OpenAI API key to process your request.",
          conversationId: `error-${Date.now()}`,
          timestamp: new Date(),
          mode: 'error'
        };
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

      let transcribedText = '';
      
      // ENHANCED: Multiple approaches with temp file method
      try {
        // Method 1: Temporary file approach (most reliable)
        const tempDir = os.tmpdir();
        const tempFilePath = path.join(tempDir, `audio_${Date.now()}.webm`);
        
        console.log('   Saving temporary file:', tempFilePath);
        fs.writeFileSync(tempFilePath, file.buffer);
        
        // Create FormData with file stream
        const FormData = require('form-data');
        const form = new FormData();
        
        form.append('file', fs.createReadStream(tempFilePath), {
          filename: 'audio.webm',
          contentType: file.mimetype || 'audio/webm',
        });
        form.append('model', 'whisper-1');
        form.append('response_format', 'json');
        
        console.log('   Sending to Whisper API with file stream...');
        
        const transcriptionResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            ...form.getHeaders(),
          },
          body: form
        });

        console.log('   Whisper response status:', transcriptionResponse.status);

        if (transcriptionResponse.ok) {
          const transcriptionData = await transcriptionResponse.json();
          transcribedText = transcriptionData.text?.trim() || '';
          console.log('✅ Transcription successful (Method 1):', transcribedText.substring(0, 50));
        } else {
          throw new Error(`Whisper API error: ${transcriptionResponse.status}`);
        }

        // Clean up temp file
        try {
          fs.unlinkSync(tempFilePath);
        } catch (cleanupError) {
          console.warn('Could not clean up temp file:', cleanupError.message);
        }

      } catch (primaryError) {
        console.log('   Method 1 failed, trying Method 2...');
        
        try {
          // Method 2: Direct buffer with different filename
          const FormData = require('form-data');
          const form = new FormData();
          
          form.append('file', file.buffer, {
            filename: 'audio.wav',
            contentType: 'audio/wav',
          });
          form.append('model', 'whisper-1');
          form.append('response_format', 'json');
          
          const transcriptionResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              ...form.getHeaders(),
            },
            body: form
          });

          if (transcriptionResponse.ok) {
            const transcriptionData = await transcriptionResponse.json();
            transcribedText = transcriptionData.text?.trim() || '';
            console.log('✅ Transcription successful (Method 2):', transcribedText.substring(0, 50));
          } else {
            throw new Error(`Method 2 also failed: ${transcriptionResponse.status}`);
          }

        } catch (secondaryError) {
          console.log('   Method 2 failed, trying Method 3...');
          
          try {
            // Method 3: Direct buffer with MP3 extension
            const FormData = require('form-data');
            const form = new FormData();
            
            form.append('file', file.buffer, {
              filename: 'audio.mp3',
              contentType: 'audio/mp3',
            });
            form.append('model', 'whisper-1');
            
            const transcriptionResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${apiKey}`,
                ...form.getHeaders(),
              },
              body: form
            });

            if (transcriptionResponse.ok) {
              const transcriptionData = await transcriptionResponse.json();
              transcribedText = transcriptionData.text?.trim() || '';
              console.log('✅ Transcription successful (Method 3):', transcribedText.substring(0, 50));
            } else {
              const errorText = await transcriptionResponse.text();
              console.error('❌ All methods failed. Last error:', errorText);
              throw new Error(`All transcription methods failed. Status: ${transcriptionResponse.status}`);
            }

          } catch (finalError) {
            console.error('❌ All transcription methods failed:', finalError.message);
            throw new Error(`Voice transcription failed: ${finalError.message}`);
          }
        }
      }

      // Validate transcription
      if (!transcribedText || transcribedText.length < 2) {
        console.log('❌ Empty or very short transcription:', transcribedText);
        return {
          message: "I couldn't understand what you said. Please try speaking more clearly or check your microphone.",
          transcription: '[Transcription Too Short]',
          conversationId: `voice-error-${Date.now()}`,
          timestamp: new Date(),
          mode: 'error'
        };
      }

      console.log('🤖 Processing transcribed text with GPT...');
      console.log('   Transcribed text:', transcribedText);

      // Process the transcribed text with GPT
      const chatResponse = await fetch('https://api.openai.com/v1/chat/completions', {
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
              content: transcribedText
            }
          ],
          max_tokens: 500,
          temperature: 0.7,
        })
      });

      if (!chatResponse.ok) {
        console.error('❌ GPT API Error:', chatResponse.status);
        throw new Error(`GPT API error: ${chatResponse.status}`);
      }

      const chatData = await chatResponse.json();
      const aiResponse = chatData.choices[0]?.message?.content || 'Sorry, I could not generate a response.';

      console.log('✅ Voice processing complete');

      // Store conversation
      const conversationId = body.conversationId || `voice-${Date.now()}`;
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
        message: `I had trouble processing your voice command: ${error.message}`,
        transcription: '[Processing Error]',
        conversationId: `voice-error-${Date.now()}`,
        timestamp: new Date(),
        mode: 'error',
        error: error.message
      };
    }
  }
}