 
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class VoiceTranscriptionService {
  private readonly openai: OpenAI;
  private readonly logger = new Logger(VoiceTranscriptionService.name);

  constructor(private readonly configService: ConfigService) {
    this.openai = new OpenAI({
      apiKey: this.configService.get<string>('OPENAI_API_KEY'),
    });
  }

  async transcribeAudio(buffer: Buffer, format: string = 'mp3'): Promise<string> {
    const tempFilePath = path.join(__dirname, `temp_audio_${Date.now()}.${format}`);
    fs.writeFileSync(tempFilePath, buffer);

    try {
      const transcription = await this.openai.audio.transcriptions.create({
        file: fs.createReadStream(tempFilePath),
        model: 'whisper-1',
        response_format: 'json',
        language: 'en',
      });

      return transcription.text;
    } catch (error) {
      this.logger.error('Transcription failed', error);
      throw error;
    } finally {
      fs.unlinkSync(tempFilePath); // Clean up temp file
    }
  }
}
