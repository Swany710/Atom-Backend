// src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitterModule } from '@nestjs/event-emitter';

// Existing controllers and services
import { AppController } from './app.controller';
import { AppService } from './app.service';

// New AI integration - MAKE SURE THESE ARE INCLUDED
import { AIVoiceController } from './ai/ai-voice.controller';
import { AIVoiceService } from './ai/ai-voice.service';
import { N8NService } from './n8n/n8n.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    HttpModule.register({
      timeout: 30000,
      maxRedirects: 5,
    }),
    ScheduleModule.forRoot(),
    EventEmitterModule.forRoot(),
  ],
  controllers: [
    AppController,        // Your existing controller
    AIVoiceController,    // NEW - Make sure this is here
  ],
  providers: [
    AppService,           // Your existing service
    AIVoiceService,       // NEW - Make sure this is here
    N8NService,           // NEW - Make sure this is here
  ],
})
export class AppModule {}