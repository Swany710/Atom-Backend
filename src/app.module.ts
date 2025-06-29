import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

// Main app files
import { AppController } from './app.controller';
import { AppService } from './app.service';

// Voice controller (your existing N8N integration)
import { N8NVoiceController } from './voice-transcription/voice.controller';

// New AI modules (without database for now)
import { AIVoiceModule } from './ai/ai-voice.module';

@Module({
  imports: [
    // Global configuration
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
    }),
    
    // AI modules (memory is in-app for now)
    AIVoiceModule,
  ],
  controllers: [
    AppController,
    N8NVoiceController, // Your existing N8N voice controller
  ],
  providers: [AppService],
})
export class AppModule {}