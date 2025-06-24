// src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { HttpModule } from '@nestjs/axios';

// Existing controllers and services
import { AppController } from './app.controller';
import { AppService } from './app.service';

// New AI integration
import { AIVoiceController } from './ai/ai-voice.controller';
import { AIVoiceService } from './ai/ai-voice.service';
import { N8NService } from './n8n/n8n.service';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),

    // HTTP module for N8N webhook calls
    HttpModule.register({
      timeout: 30000,
      maxRedirects: 5,
    }),

    // Database (optional for initial build)
    // TypeOrmModule.forRootAsync({
    //   inject: [ConfigService],
    //   useFactory: (configService: ConfigService) => ({
    //     type: 'postgres',
    //     url: configService.get('DATABASE_URL'),
    //     autoLoadEntities: true,
    //     synchronize: configService.get('NODE_ENV') !== 'production',
    //     ssl: configService.get('NODE_ENV') === 'production' ? { rejectUnauthorized: false } : false,
    //     logging: configService.get('NODE_ENV') === 'development',
    //   }),
    // }),

    // Other core modules
    ScheduleModule.forRoot(),
    EventEmitterModule.forRoot(),
  ],
  controllers: [
    AppController,        // Your existing controller
    AIVoiceController,    // New AI controller
  ],
  providers: [
    AppService,           // Your existing service
    AIVoiceService,       // New AI service
    N8NService,           // New N8N service
  ],
})
export class AppModule {}