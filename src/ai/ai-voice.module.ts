// src/app.module.ts - UPDATED WITH SUPABASE AND CONVERSATION MODULE
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitterModule } from '@nestjs/event-emitter';

// Import your modules
import { ConversationModule } from './conversation/conversation.module'; // NEW
import { AIVoiceModule } from './ai/ai-voice.module'; // Make sure this exists

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
        // Use your Supabase connection string
        url: configService.get('SUPABASE_DATABASE_URL') || configService.get('DATABASE_URL'),
        // Alternative: individual connection parameters
        // host: configService.get('SUPABASE_HOST'),
        // port: parseInt(configService.get('SUPABASE_PORT', '5432')),
        // username: configService.get('SUPABASE_USER'),
        // password: configService.get('SUPABASE_PASSWORD'),
        // database: configService.get('SUPABASE_DATABASE'),
        
        // Entity configuration
        entities: [
          // Conversation entities
          Conversation,
          ConversationMessage,
          UserConversationSettings,
          
          // Add your other entities here as you create them
          // User, UserSession, UserContext, etc.
        ],
        
        // Development settings
        synchronize: configService.get('NODE_ENV') !== 'production', // Creates tables automatically
        logging: configService.get('NODE_ENV') === 'development',
        
        // SSL configuration for Supabase
        ssl: configService.get('NODE_ENV') === 'production' ? { 
          rejectUnauthorized: false 
        } : false,
        
        // Connection pool settings
        extra: {
          max: 10, // Maximum number of connections
          min: 1,  // Minimum number of connections
          idleTimeoutMillis: 30000,
          connectionTimeoutMillis: 2000,
        },
      }),
    }),

    // Other core modules
    ScheduleModule.forRoot(),
    EventEmitterModule.forRoot(),

    // Your application modules
    ConversationModule, // NEW: Conversation memory module
    AIVoiceModule, // Your AI voice processing module
    
    // Add other modules as needed:
    // AuthModule,
    // UserModule,
    // TaskModule,
    // etc.
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

// src/ai/ai-voice.module.ts - CREATE THIS IF IT DOESN'T EXIST
import { Module } from '@nestjs/common';
import { AIVoiceController } from './ai-voice.controller';
import { AIVoiceService } from './ai-voice.service';
import { ConversationModule } from '../conversation/conversation.module';

@Module({
  imports: [ConversationModule], // Import conversation module for memory
  controllers: [AIVoiceController],
  providers: [AIVoiceService],
  exports: [AIVoiceService],
})
export class AIVoiceModule {}