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
import { AIVoiceService } from './ai/ai-voice.service';
import { FileInterceptor } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import FormData from 'form-data';
import axios from 'axios';

@Controller('api/v1')
export class AppController {
  private conversations = new Map<string, any[]>();

  constructor(private configService: ConfigService,
    private readonly aiVoiceService: AIVoiceService,
  ) {}

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
  
  // Replace ONLY the processVoiceCommand1 method with this simplified MP4-only version

@Post('ai/voice-command1')
@UseInterceptors(FileInterceptor('audio'))
async processVoiceCommand1(@UploadedFile() file: any, @Body() body: any) {
  console.log('🎤 Voice command received');
  console.log('   File exists:', !!file);
  console.log('   File size:', file?.size || 'no file');
  console.log('   File type:', file?.mimetype || 'no type');

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

    // Determine file extension/type (prefer mp3 if sent)
    let originalName = file.originalname || 'audio.mp3';
    let mimetype = file.mimetype || 'audio/mp3';
    let extension = '.mp3';
    if (originalName.endsWith('.webm')) {
      extension = '.webm';
      mimetype = 'audio/webm';
    } else if (originalName.endsWith('.wav')) {
      extension = '.wav';
      mimetype = 'audio/wav';
    } else if (!originalName.endsWith('.mp3')) {
      originalName = 'audio.mp3';
    }

    console.log('🎤 Processing audio with Whisper API (using Node form-data).');
    let transcribedText = '';
    try {
      const form = new FormData();
      form.append('file', file.buffer, {
        filename: originalName,
        contentType: mimetype,
        knownLength: file.size
      });
      form.append('model', 'whisper-1');
      form.append('response_format', 'json');
      form.append('language', 'en');

      const whisperResponse = await axios.post(
        'https://api.openai.com/v1/audio/transcriptions',
        form,
        {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            ...form.getHeaders()
          },        }
      );

      const transcriptionData = whisperResponse.data as any;
transcribedText = transcriptionData.text?.trim() || '';
console.log('✅ Transcription successful:', transcribedText.substring(0, 50) + '.');

let aiMessage = '';
try {
  aiMessage = await this.aiVoiceService.processPrompt(transcribedText);
} catch (err) {
  console.error('AI chat failed:', err);
  aiMessage = "Sorry, there was an error generating my response.";
}

return {
  message: aiMessage,
  transcription: transcribedText,
  mode: 'openai',
  timestamp: new Date()
};

    } catch (transcriptionError) {
      console.error('❌ Transcription failed:', transcriptionError.response?.data || transcriptionError.message);
      return {
        message: `Voice processing failed: ${transcriptionError.message}`,
        transcription: '[Whisper API Error]',
        conversationId: `voice-error-${Date.now()}`,
        timestamp: new Date(),
        mode: 'error'
      };
    }

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

    // (Your AI/gpt logic here if needed...)

    return {
      message: 'Transcription completed successfully.',
      transcription: transcribedText,
      mode: 'openai',
      timestamp: new Date()
    };
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