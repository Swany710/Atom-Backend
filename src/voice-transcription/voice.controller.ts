// src/voice-transcription/voice.controller.ts - Updated to avoid conflicts
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
import axios from 'axios';
import FormData from 'form-data';

interface MulterFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

@Controller('n8n-voice') // Changed from 'voice' to avoid conflicts
export class N8NVoiceController { // Renamed class
  @Post('webhook') // Changed endpoint name
  @UseInterceptors(FileInterceptor('data'))
  async forwardToN8N(@UploadedFile() file: MulterFile) { // Renamed method
    if (!file) throw new BadRequestException('No file uploaded');

    const form = new FormData();
    form.append('file', file.buffer, {
      filename: file.originalname,
      contentType: file.mimetype,
    });

    try {
      const n8nResponse = await axios.post(
        'https://swany.app.n8n.cloud/webhook-test/voice-command',
        form,
        { headers: form.getHeaders() }
      );
      
      return {
        status: 'sent to n8n',
        result: n8nResponse.data,
      };
    } catch (err) {
      console.error('Failed to send to n8n:', err.message);
      throw new HttpException('Failed to forward file to n8n', HttpStatus.BAD_GATEWAY);
    }
  }
}