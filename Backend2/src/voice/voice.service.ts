 cat > Backend2/src/voice/voice.service.ts << 'EOF'
import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import * as fs from 'fs';
import * as FormData from 'form-data';

@Injectable()
export class VoiceTranscriptionService {
  private openai: OpenAI;

  constructor(
    private httpService: HttpService,
    private configService: ConfigService
  ) {
    this.openai = new OpenAI({
      apiKey: this.configService.get('OPENAI_API_KEY'),
    });
  }

  async transcribeAudio(audioBuffer: Buffer): Promise<string> {
    console.log('🎤 Starting transcription...');
    console.log('🎤 Audio buffer size:', audioBuffer?.length || 'NO BUFFER');
    console.log('🎤 OpenAI API Key exists:', !!this.configService.get('OPENAI_API_KEY'));

    // For testing, return a mock transcription
    return "Create a task to inspect the roof";
  }

  async processWithN8n(audioBuffer: Buffer): Promise<any> {
    const n8nWebhookUrl = this.configService.get('N8N_WEBHOOK_URL');
    
    console.log('🔍 DEBUG: Environment variables loaded');
    console.log('🔍 N8N_WEBHOOK_URL from config:', n8nWebhookUrl);
    console.log('🔍 Audio buffer size:', audioBuffer?.length || 'NO BUFFER');
    
    if (!n8nWebhookUrl) {
      throw new Error('N8N_WEBHOOK_URL not configured');
    }

    try {
      const formData = new FormData();
      formData.append('audio', audioBuffer, {
        filename: 'recording.webm',
        contentType: 'audio/webm',
      });

      console.log('📤 Sending to n8n:', n8nWebhookUrl);

      const response = await this.httpService.post(n8nWebhookUrl, formData, {
        headers: {
          ...formData.getHeaders(),
        },
        timeout: 30000,
      }).toPromise();

      console.log('📥 n8n response:', response?.data);
      return response?.data;
    } catch (error) {
      console.error('❌ n8n error:', error.message);
      throw error;
    }
  }
}
EOF
