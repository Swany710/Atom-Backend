// src/app.module.ts - RAILWAY POSTGRESQL VERSION
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

    // Database connection to Railway PostgreSQL
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        // Railway automatically provides DATABASE_URL for PostgreSQL
        const databaseUrl = configService.get('DATABASE_URL');
        
        if (!databaseUrl) {
          throw new Error('DATABASE_URL not found. Make sure PostgreSQL is added to your Railway project.');
        }

        return {
          type: 'postgres',
          url: databaseUrl,
          
          // Entity configuration
          entities: [
            Conversation,
            ConversationMessage,
            UserConversationSettings,
          ],
          
          // Railway PostgreSQL settings
          synchronize: configService.get('NODE_ENV') !== 'production', // Auto-create tables in dev
          logging: configService.get('NODE_ENV') === 'development',
          
          // SSL configuration for Railway PostgreSQL
          ssl: configService.get('NODE_ENV') === 'production' ? {
            rejectUnauthorized: false
          } : false,
          
          // Connection pool settings optimized for Railway
          extra: {
            max: 10, // Maximum number of connections
            min: 1,  // Minimum number of connections
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 5000,
            acquireTimeoutMillis: 60000,
            createTimeoutMillis: 30000,
            destroyTimeoutMillis: 5000,
            reapIntervalMillis: 1000,
            createRetryIntervalMillis: 200,
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

    // Your application modules with full memory system
    ConversationModule, // Full conversation memory
    AIVoiceModule, // AI voice processing with memory
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}