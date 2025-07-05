import { 
  Controller, 
  Post, 
  Body, 
  UseInterceptors, 
  UploadedFile,
  Get,
  Param,
  Delete
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';

@Controller('api/v1')
export class AppController {
  private conversations = new Map<string, any[]>();

  constructor(private configService: ConfigService) {}

  // ===== HEALTH & STATUS =====
  
  @Get('ai/health')
  getHealth() {
    return { 
      status: 'healthy', 
      timestamp: new Date(),
      service: 'Atom Backend API' 
    };
  }

  @Get('ai/status')
  getStatus() {
    const apiKey = this.configService.get('OPENAI_API_KEY');
    const isConfigured = !!apiKey && apiKey.startsWith('sk-');
    
    return {
      status: isConfigured ? 'available' : 'configuration_error',
      aiService: isConfigured ? 'online' : 'offline',
      mode: isConfigured ? 'openai' : 'error',
      timestamp: new Date()
    };
  }

  // ===== TEXT PROCESSING =====
  
  @Post('ai/text-command1')
  async processTextCommand1(@Body() body: any) {
    console.log('📝 Text command received:', body.message?.substring(0, 50));

    try {
      if (!body || !body.message) {
        return {
          message: "Please provide a message to process.",
          conversationId: `error-${Date.now()}`,
          timestamp: new Date(),
          mode: 'error'
        };
      }

      const apiKey = this.configService.get('OPENAI_API_KEY');
      if (!apiKey || !apiKey.startsWith('sk-')) {
        return {
          message: "I need an OpenAI API key to process your request.",
          conversationId: `error-${Date.now()}`,
          timestamp: new Date(),
          mode: 'error'
        };
      }

      console.log('🤖 Processing with GPT...');

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

      console.log('✅ Text processing complete');

      // Store conversation
      const conversationId = body.conversationId || `text-${Date.now()}`;
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

  // ===== VOICE PROCESSING =====
  
  @Post('ai/voice-command1')
  @UseInterceptors(FileInterceptor('audio'))
  async processVoiceCommand1(@UploadedFile() file: any, @Body() body: any) {
    console.log('🎤 Voice command received');
    console.log('   File exists:', !!file);
    console.log('   File size:', file?.size || 'no file');
    console.log('   File type:', file?.mimetype || 'no type');
    console.log('   Original name:', file?.originalname || 'no name');

    try {
      // Validate audio file
      if (!file || !file.buffer || file.size === 0) {
        console.log('❌ No audio file received');
        return {
          message: "I didn't receive any audio file. Please check your microphone permissions and try recording again.",
          transcription: '[No Audio File]',
          conversationId: `voice-error-${Date.now()}`,
          timestamp: new Date(),
          mode: 'error'
        };
      }

      // Validate API key
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

      // CRITICAL FIX: Proper FormData construction for Whisper API
      let transcribedText = '';
      try {
        const FormData = require('form-data');
        const form = new FormData();
        
        // Determine correct file extension based on actual content
        let fileExtension = 'webm';
        let mimeType = 'audio/webm';
        
        if (file.mimetype) {
          if (file.mimetype.includes('mp4')) {
            fileExtension = 'mp4';
            mimeType = 'audio/mp4';
          } else if (file.mimetype.includes('webm')) {
            fileExtension = 'webm';
            mimeType = 'audio/webm';
          } else if (file.mimetype.includes('wav')) {
            fileExtension = 'wav';
            mimeType = 'audio/wav';
          } else if (file.mimetype.includes('ogg')) {
            fileExtension = 'ogg';
            mimeType = 'audio/ogg';
          }
        }
        
        // Create filename that matches content type
        const fileName = `audio.${fileExtension}`;
        
        console.log('   Processed file details:');
        console.log('   - Filename:', fileName);
        console.log('   - MIME type:', mimeType);
        console.log('   - File size:', file.size);
        
        // CRITICAL: Proper FormData append with correct options
        form.append('file', file.buffer, {
          filename: fileName,
          contentType: mimeType,
          knownLength: file.size
        });
        form.append('model', 'whisper-1');
        form.append('response_format', 'json');
        form.append('language', 'en');

        console.log('   Sending to Whisper API...');
        
        const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            ...form.getHeaders()
          },
          body: form
        });

        console.log('   Whisper response status:', response.status);

        if (!response.ok) {
          const errorText = await response.text();
          console.error('❌ Whisper API error:', response.status, errorText);
          
          let errorMessage = "I had trouble understanding your voice.";
          try {
            const errorData = JSON.parse(errorText);
            if (errorData.error?.message?.includes('multipart form')) {
              errorMessage = "There was an issue with the audio format. Please try recording again.";
            } else if (errorData.error?.message?.includes('file format')) {
              errorMessage = "The audio format wasn't recognized. Please try again.";
            }
          } catch (e) {
            // Use default error message
          }
          
          return {
            message: errorMessage,
            transcription: '[Whisper API Error]',
            conversationId: `voice-error-${Date.now()}`,
            timestamp: new Date(),
            mode: 'error'
          };
        }

        const transcriptionData = await response.json();
        transcribedText = transcriptionData.text?.trim() || '';
        
        console.log('✅ Transcription successful:', transcribedText.substring(0, 50) + '...');

      } catch (transcriptionError) {
        console.error('❌ Transcription failed:', transcriptionError.message);
        return {
          message: `Voice processing failed: ${transcriptionError.message}`,
          transcription: '[Transcription Failed]',
          conversationId: `voice-error-${Date.now()}`,
          timestamp: new Date(),
          mode: 'error'
        };
      }

      // Validate transcription result
      if (!transcribedText || transcribedText.length < 1) {
        console.log('❌ Empty transcription result');
        return {
          message: "I couldn't understand what you said. Please try speaking more clearly.",
          transcription: '[Empty Transcription]',
          conversationId: `voice-error-${Date.now()}`,
          timestamp: new Date(),
          mode: 'error'
        };
      }

      console.log('🤖 Processing transcribed text with OpenAI...');
      
      // Process with OpenAI Chat API
      const conversationId = body.conversationId || `voice-${Date.now()}`;
      const userId = body.userId || 'default-user';
      
      // Get conversation history
      const conversation = this.conversations.get(conversationId) || [];
      
      // Prepare messages for OpenAI
      const messages = [
        {
          role: 'system',
          content: `You are Atom, a helpful personal AI assistant. The user just spoke to you.
          Be friendly, conversational, and helpful. Keep responses concise.
          User said: "${transcribedText}"`
        },
        ...conversation.slice(-8), // Keep last 8 messages for context
        {
          role: 'user',
          content: transcribedText
        }
      ];

      try {
        const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'gpt-3.5-turbo',
            messages: messages,
            max_tokens: 400,
            temperature: 0.7,
          })
        });

        if (!aiResponse.ok) {
          console.error('❌ OpenAI Chat API Error:', aiResponse.status);
          throw new Error(`OpenAI API error: ${aiResponse.status}`);
        }

        const aiData = await aiResponse.json();
        const aiResponseText = aiData.choices[0]?.message?.content || 'Sorry, I could not generate a response.';

        console.log('✅ Voice processing complete');

        // Store conversation
        conversation.push(
          { role: 'user', content: transcribedText, timestamp: new Date() },
          { role: 'assistant', content: aiResponseText, timestamp: new Date() }
        );
        this.conversations.set(conversationId, conversation);

        return {
          message: aiResponseText,
          transcription: transcribedText,
          conversationId: conversationId,
          timestamp: new Date(),
          mode: 'openai'
        };

      } catch (aiError) {
        console.error('❌ AI processing error:', aiError.message);
        return {
          message: `I heard: "${transcribedText}" but couldn't generate a response. Please try again.`,
          transcription: transcribedText,
          conversationId: conversationId,
          timestamp: new Date(),
          mode: 'error'
        };
      }

    } catch (error) {
      console.error('❌ Voice processing error:', error.message);
      return {
        message: `Voice processing failed: ${error.message}`,
        transcription: '[Processing Error]',
        conversationId: `voice-error-${Date.now()}`,
        timestamp: new Date(),
        mode: 'error',
        error: error.message
      };
    }
  }

  // ===== CONVERSATION MANAGEMENT =====
  
  @Get('ai/conversations/:id')
  getConversation(@Param('id') id: string) {
    const conversation = this.conversations.get(id) || [];
    return {
      conversationId: id,
      messages: conversation,
      messageCount: conversation.length,
      timestamp: new Date()
    };
  }

  @Delete('ai/conversations/:id')
  clearConversation(@Param('id') id: string) {
    this.conversations.delete(id);
    return { message: 'Conversation cleared', timestamp: new Date() };
  }

  @Get('ai/conversations')
  getAllConversations() {
    const conversations = Array.from(this.conversations.entries()).map(([id, messages]) => ({
      id,
      messageCount: messages.length,
      lastMessage: messages[messages.length - 1]?.timestamp || null
    }));
    return { conversations };
  }
}