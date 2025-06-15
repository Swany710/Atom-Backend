import {
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { VoiceTranscriptionService } from './voice-transcription.service';
import { Express } from 'express';
import axios from 'axios';

@Controller('voice')
export class VoiceController {
  constructor(
    private readonly transcriptionService: VoiceTranscriptionService,
  ) {}

  @Post('transcribe')
  @UseInterceptors(FileInterceptor('file'))
  async transcribe(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new HttpException('No file uploaded', HttpStatus.BAD_REQUEST);
    }

    const transcription = await this.transcriptionService.transcribeAudio(
      file.buffer,
      'mp3',
    );

    try {
      await axios.post('https://your-n8n-domain/webhook/voice', {
        text: transcription,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Failed to trigger N8N webhook:', error.message);
    }

    return { transcription };
  }
}
