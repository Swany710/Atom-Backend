import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OpenAI } from 'openai';

@Injectable()
export class VoiceService {
  private openai: OpenAI;

  constructor(private configService: ConfigService) {
    this.openai = new OpenAI({
      apiKey: this.configService.get<string>('OPENAI_API_KEY'),
    });
  }

  async transcribeAudio(file: Express.Multer.File): Promise<{ text: string }> {
    try {
      // Convert the buffer to a File-like object for OpenAI
      const audioFile = new File([file.buffer], file.originalname, {
        type: file.mimetype,
      });

      const transcription = await this.openai.audio.transcriptions.create({
        file: audioFile,
        model: 'whisper-1',
        language: 'en',
      });

      return { text: transcription.text };
    } catch (error) {
      console.error('Error transcribing audio:', error);
      throw new Error('Failed to transcribe audio');
    }
  }

  async synthesizeText(text: string): Promise<{ audioUrl: string }> {
    try {
      const mp3 = await this.openai.audio.speech.create({
        model: 'tts-1',
        voice: 'alloy',
        input: text,
      });

      // In a real app, you'd save this to a file or cloud storage
      // For now, we'll return a placeholder
      const buffer = Buffer.from(await mp3.arrayBuffer());
      
      // You could save to temporary file or return base64
      const base64Audio = buffer.toString('base64');
      
      return { 
        audioUrl: `data:audio/mpeg;base64,${base64Audio}` 
      };
    } catch (error) {
      console.error('Error synthesizing text:', error);
      throw new Error('Failed to synthesize text');
    }
  }
} 
