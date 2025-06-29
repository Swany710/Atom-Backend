// src/app.module.ts - With both voice systems
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitterModule } from '@nestjs/event-emitter';

// Import your modules
import { ConversationModule } from './conversation/conversation.module';
import { AIVoiceModule } from './ai/ai-voice.module'; // New AI system
import { N8NVoiceModule } from './voice-transcription/n8n-voice.module'; // Old N8N system

import { AppController } from './app.controller';
import { AppService } from './app.service';

// Import entities for proper TypeORM configuration
import { Conversation } from './conversation/entities/conversation.entity';
import { ConversationMessage } from './conversation/entities/conversation-message.entity';
import { UserConversationSettings } from './conversation/entities/user-conversation-settings.entity';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),

    // Database connection to Supabase (PostgreSQL)
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        url: configService.get('SUPABASE_DATABASE_URL') || configService.get('DATABASE_URL'),
        
        entities: [
          Conversation,
          ConversationMessage,
          UserConversationSettings,
        ],
        
        synchronize: configService.get('NODE_ENV') !== 'production',
        logging: configService.get('NODE_ENV') === 'development',
        
        ssl: configService.get('NODE_ENV') === 'production' ? { 
          rejectUnauthorized: false 
        } : false,
        
        extra: {
          max: 10,
          min: 1,
          idleTimeoutMillis: 30000,
          connectionTimeoutMillis: 2000,
        },
      }),
    }),

    // Other core modules
    ScheduleModule.forRoot(),
    EventEmitterModule.forRoot(),

    // Voice systems
    ConversationModule, // Conversation memory module
    AIVoiceModule, // New AI voice processing with memory
    N8NVoiceModule, // Old N8N webhook system (renamed to avoid conflicts)
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}