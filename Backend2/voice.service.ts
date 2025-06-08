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

    if (!audioBuffer || audioBuffer.length === 0) {
      console.error('❌ Empty audio buffer');
      return 'Could not transcribe audio - empty buffer';
    }

    try {
      // Save buffer to temporary file
      const tempPath = `/tmp/audio_${Date.now()}.webm`;
      console.log('🎤 Saving audio to:', tempPath);
      
      fs.writeFileSync(tempPath, audioBuffer);
      console.log('🎤 Audio file saved, size:', fs.statSync(tempPath).size);

      console.log('🎤 Calling OpenAI API...');
      const transcription = await this.openai.audio.transcriptions.create({
        file: fs.createReadStream(tempPath),
        model: 'whisper-1',
        language: 'en',
        response_format: 'json',
      });

      console.log('🎤 OpenAI response:', transcription);
      console.log('🎤 Transcribed text:', transcription.text);

      // Clean up temp file
      fs.unlinkSync(tempPath);

      return transcription.text;
    } catch (error) {
      console.error('❌ Transcription error:', error);
      console.error('❌ Error details:', error.message);
      return 'Could not transcribe audio - API error';
    }
  }

  async processWithN8n(audioBuffer: Buffer): Promise<any> {
    const n8nWebhookUrl = this.configService.get('N8N_WEBHOOK_URL');
    
    console.log('🔍 DEBUG: Environment variables loaded');
    console.log('🔍 NODE_ENV:', process.env.NODE_ENV);
    console.log('🔍 N8N_WEBHOOK_URL from env:', process.env.N8N_WEBHOOK_URL);
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