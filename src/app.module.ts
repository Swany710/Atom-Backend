import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

// Main app files
import { AppController } from './app.controller';
import { AppService } from './app.service';

// Existing modules
import { CalendarSyncModule } from './calendar-sync/calendar-sync.module';
import { AuthModule } from './auth/auth.module';
import { PhotoIntegrationModule } from './photo-integration/photo-integration.module';
import { ContactBookModule } from './contact-book/contact-book.module';

// New AI modules
import { AIVoiceModule } from './ai/ai-voice.module';
import { ConversationModule } from './conversation/conversation.module';

// Import all entities
import { CalendarToken } from './calendar-sync/entities/calendar-token.entity';
import { User } from './auth/entities/user.entity';
import { UserSession } from './auth/entities/user-session.entity';
import { UserContext } from './auth/entities/user-context.entity';
import { SecurityLog } from './auth/entities/security-log.entity';
import { PhotoProject } from './photo-integration/entities/photo-project.entity';
import { Photo } from './photo-integration/entities/photo.entity';
import { PhotoMeasurement } from './photo-integration/entities/photo-measurement.entity';
import { Contact } from './contact-book/entities/contact.entity';
import { ContactGroup } from './contact-book/entities/contact-group.entity';
import { ContactInteraction } from './contact-book/entities/contact-interaction.entity';
import { Conversation } from './conversation/entities/conversation.entity';
import { ConversationMessage } from './conversation/entities/conversation-message.entity';
import { UserConversationSettings } from './conversation/entities/user-conversation-settings.entity';

@Module({
  imports: [
    // Global configuration
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
    }),
    
    // Single TypeORM configuration for Railway PostgreSQL
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        type: 'postgres',
        url: configService.get('DATABASE_URL'), // Railway automatically provides this
        entities: [
          // Calendar entities
          CalendarToken,
          // Auth entities
          User,
          UserSession,
          UserContext,
          SecurityLog,
          // Photo entities
          PhotoProject,
          Photo,
          PhotoMeasurement,
          // Contact entities
          Contact,
          ContactGroup,
          ContactInteraction,
          // Conversation entities
          Conversation,
          ConversationMessage,
          UserConversationSettings,
        ],
        synchronize: process.env.NODE_ENV !== 'production', // Auto-create tables in dev
        logging: process.env.NODE_ENV === 'development',
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
        retryAttempts: 3,
        retryDelay: 3000,
        autoLoadEntities: true,
      }),
      inject: [ConfigService],
    }),

    // Feature modules
    CalendarSyncModule,
    AuthModule,
    PhotoIntegrationModule,
    ContactBookModule,
    ConversationModule,
    AIVoiceModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}