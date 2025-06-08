 cat > Backend2/src/voice/voice.controller.ts << 'EOF'
import { Controller, Post, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { VoiceTranscriptionService } from './voice.service';

@Controller('voice')
export class VoiceController {
  constructor(private voiceService: VoiceTranscriptionService) {}

  @Post('process')
  @UseInterceptors(FileInterceptor('audio'))
  async processVoiceCommand(@UploadedFile() file: Express.Multer.File) {
    console.log('🎯 Voice command received');
    console.log('🎯 File size:', file?.size || 'NO FILE');

    if (!file || !file.buffer) {
      return { error: 'No audio file received' };
    }

    try {
      // Transcribe audio
      const transcription = await this.voiceService.transcribeAudio(file.buffer);
      console.log('🎯 Transcription result:', transcription);

      // Process with n8n
      const n8nResult = await this.voiceService.processWithN8n(file.buffer);
      console.log('🎯 n8n result:', n8nResult);

      return {
        transcription,
        n8nResult,
        timestamp: new Date(),
      };
    } catch (error) {
      console.error('🎯 Processing error:', error);
      return {
        transcription: 'Could not transcribe audio',
        error: error.message,
        timestamp: new Date(),
      };
    }
  }
}
EOF
