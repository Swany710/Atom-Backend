// src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

// Main app files
import { AppController } from './app.controller';
import { AppService } from './app.service';

// Voice controller (your existing N8N integration)
import { VoiceController } from './voice-transcription/voice.controller';

// AI modules
import { AIVoiceController } from './ai/ai-voice.controller';
import { AIVoiceService } from './ai/ai-voice.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
    }),
  ],
  controllers: [
    AppController,
    VoiceController,
    AIVoiceController,
  ],
  providers: [
    AppService,
    AIVoiceService,
  ],
})
export class AppModule {}