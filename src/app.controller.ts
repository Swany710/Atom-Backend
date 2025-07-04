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
  console.log('🎤 Voice request received');
  console.log('   File size:', file?.size || 'no file');
  console.log('   File type:', file?.mimetype || 'no type');

  try {
    // Validate input
    if (!file || !file.buffer || file.size === 0) {
      return {
        message: "I didn't receive any audio. Please check your microphone permissions.",
        transcription: '[No Audio]',
        conversationId: `voice-error-${Date.now()}`,
        timestamp: new Date(),
        mode: 'error'
      };
    }

    // Check API key
    const apiKey = this.configService.get('OPENAI_API_KEY');
    if (!apiKey || !apiKey.startsWith('sk-')) {
      return {
        message: "I need an OpenAI API key to process voice commands.",
        transcription: '[API Key Missing]',
        conversationId: `voice-error-${Date.now()}`,
        timestamp: new Date(),
        mode: 'error'
      };
    }

    console.log('🎤 Transcribing with Whisper API...');

    let transcribedText = '';

    // Try different formats that Whisper accepts better
    const FormData = require('form-data');

    // Try as MP4 first (Whisper likes this better than WebM)
    const form = new FormData();
    form.append('file', file.buffer, {
      filename: 'audio.mp4',
      contentType: 'audio/mp4'
    });
    form.append('model', 'whisper-1');

    const whisperResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        ...form.getHeaders()
      },
      body: form
    });

    if (whisperResponse.ok) {
      const transcription = await whisperResponse.json();
      transcribedText = transcription.text?.trim() || '';
      console.log('✅ Transcribed with MP4:', transcribedText.substring(0, 50));
    } else {
      // If MP4 fails, try as WAV
      console.log('MP4 failed, trying WAV...');
      
      const wavForm = new FormData();
      wavForm.append('file', file.buffer, {
        filename: 'audio.wav',
        contentType: 'audio/wav'
      });
      wavForm.append('model', 'whisper-1');
      
      const wavResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          ...wavForm.getHeaders()
        },
        body: wavForm
      });
      
      if (wavResponse.ok) {
        const transcription = await wavResponse.json();
        transcribedText = transcription.text?.trim() || '';
        console.log('✅ Transcribed with WAV:', transcribedText.substring(0, 50));
      } else {
        const error = await wavResponse.text();
        console.error('❌ Both MP4 and WAV failed:', error);
        throw new Error(`Transcription failed: ${wavResponse.status}`);
      }
    }
    
    if (!transcribedText || transcribedText.length < 1) {
      return {
        message: "I couldn't understand what you said. Please try speaking more clearly.",
        transcription: '[Empty]',
        conversationId: `voice-error-${Date.now()}`,
        timestamp: new Date(),
        mode: 'error'
      };
    }

    console.log('✅ Transcribed:', transcribedText.substring(0, 50));
    console.log('🤖 Processing with GPT...');

    // Process with GPT (same as text endpoint)
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

    if (!gptResponse.ok) {
      throw new Error(`AI processing failed: ${gptResponse.status}`);
    }

    const gptData = await gptResponse.json();
    const aiMessage = gptData.choices[0]?.message?.content || 'Sorry, I could not generate a response.';

    console.log('✅ Voice processing complete');

    // Store in conversation history
    const conversationId = body.conversationId || `voice-${Date.now()}`;
    const conversation = this.conversations.get(conversationId) || [];
    conversation.push(
      { role: 'user', content: transcribedText, timestamp: new Date() },
      { role: 'assistant', content: aiMessage, timestamp: new Date() }
    );
    this.conversations.set(conversationId, conversation);

    return {
      message: aiMessage,
      transcription: transcribedText,
      conversationId: conversationId,
      timestamp: new Date(),
      mode: 'openai'
    };

  } catch (error) {
    console.error('❌ Voice processing failed:', error.message);
    
    return {
      message: `Voice processing failed: ${error.message}. Please try again.`,
      transcription: '[Error]',
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