import {
  Controller,
  Get,
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

@Controller('trigger')
export class VoiceController {
  constructor(
    private readonly transcriptionService: VoiceTranscriptionService
  ) {}

  @Get()
  async triggerWebhook() {
    const webhookUrl = 'https://swany.app.n8n.cloud/webhook/voice-command';
    try {
      await axios.get(webhookUrl);
      return { status: 'Webhook triggered' };
    } catch (error) {
      console.error('Webhook trigger failed:', error.message);
      throw new HttpException('Webhook failed', HttpStatus.BAD_GATEWAY);
    }
  }

  @Post('transcribe')
  @UseInterceptors(FileInterceptor('file'))
  async transcribe(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new HttpException('No file uploaded', HttpStatus.BAD_REQUEST);
    }

    const transcription = await this.transcriptionService.transcribeAudio(
      file.buffer,
      'mp3'
    );

    try {
      await axios.post('https://swany.app.n8n.cloud/webhook/voice-command', {
        text: transcription,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Failed to send transcription to n8n:', error.message);
    }

    return { transcription };
  }
}
