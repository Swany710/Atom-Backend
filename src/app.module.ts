// src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitterModule } from '@nestjs/event-emitter';

// Controllers
import { AppController } from './app.controller';

// Services  
import { AppService } from './app.service';

// AI Integration (only include if files exist)
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
    AppController,
    AIVoiceController,
  ],
  providers: [
    AppService,
    AIVoiceService,
    N8NService,
  ],
})
export class AppModule {}
