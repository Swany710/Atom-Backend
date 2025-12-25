// src/voice-transcription/n8n-voice.module.ts
import { Module } from '@nestjs/common';
import { N8NVoiceController } from './voice.controller'; // Import the renamed controller

@Module({
  controllers: [N8NVoiceController],
  providers: [],
})
export class N8NVoiceModule {}