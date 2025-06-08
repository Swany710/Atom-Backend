import { Controller, Post, Body, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { VoiceService } from './voice.service';

@Controller('voice')
export class VoiceController {
  constructor(private readonly voiceService: VoiceService) {}

  @Post('transcribe')
  @UseInterceptors(FileInterceptor('audio'))
  async transcribeAudio(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new Error('No audio file provided');
    }
    
    return await this.voiceService.transcribeAudio(file);
  }

  @Post('synthesize')
  async synthesizeText(@Body('text') text: string) {
    if (!text) {
      throw new Error('No text provided');
    }
    
    return await this.voiceService.synthesizeText(text);
  }
}
 
