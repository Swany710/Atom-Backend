import {
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Express } from 'express';
import axios from 'axios';
import FormData from 'form-data';

@Controller('voice')
export class VoiceController {
  @Post('voice-command')
  @UseInterceptors(FileInterceptor('data')) // <-- THIS MUST MATCH YOUR FORM FIELD NAME
  async handleVoiceCommand(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file uploaded');

    const form = new FormData();
    form.append('data', file.buffer, {
      filename: file.originalname,
      contentType: file.mimetype,
    });

    try {
      await axios.post('https://swany.app.n8n.cloud/webhook/voice-command', form, {
        headers: form.getHeaders(),
      });
      return { status: 'sent to n8n' };
    } catch (err) {
      console.error('Failed to send to n8n:', err.message);
      throw new HttpException('Failed to forward file to n8n', HttpStatus.BAD_GATEWAY);
    }
  }
}
