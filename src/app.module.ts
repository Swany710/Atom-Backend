// src/app.module.ts - RAILWAY PRODUCTION FIX
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitterModule } from '@nestjs/event-emitter';

// Import your modules
import { ConversationModule } from './conversation/conversation.module';
import { AIVoiceModule } from './ai/ai-voice.module';

import { AppController } from './app.controller';
import { AppService } from './app.service';

// Import entities
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

    // Database connection with Railway/Supabase fixes
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const databaseUrl = configService.get('SUPABASE_DATABASE_URL') || configService.get('DATABASE_URL');
        
        return {
          type: 'postgres',
          url: databaseUrl,
          
          // Entity configuration
          entities: [
            Conversation,
            ConversationMessage,
            UserConversationSettings,
          ],
          
          // Production settings for Railway
          synchronize: configService.get('NODE_ENV') !== 'production',
          logging: configService.get('NODE_ENV') === 'development',
          
          // SSL configuration for Supabase
          ssl: {
            rejectUnauthorized: false
          },
          
          // Railway-specific connection settings
          extra: {
            max: 10,
            min: 1,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 10000, // Increased timeout
            // Force IPv4
            family: 4,
            // Additional Railway fixes
            keepAlive: true,
            keepAliveInitialDelayMillis: 0,
          },
          
          // Retry configuration
          retryAttempts: 3,
          retryDelay: 3000,
        };
      },
    }),

    // Other core modules
    ScheduleModule.forRoot(),
    EventEmitterModule.forRoot(),

    // Your application modules
    ConversationModule,
    AIVoiceModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}