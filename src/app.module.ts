import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AIVoiceModule } from './ai/ai-voice.module';
import { ChatMemory } from './ai/chat-memory.entity';
// ADDED: New authentication and integration modules
import { AuthModule } from './auth/auth.module';
import { GmailModule } from './gmail/gmail.module';
import { GoogleDriveModule } from './google-drive/google-drive.module';
import { KnowledgeBaseModule } from './knowledge-base/knowledge-base.module';
import { WebSearchModule } from './web-search/web-search.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
    }),
    TypeOrmModule.forRootAsync({
      useFactory: () => ({
        type: 'postgres',
        url: process.env.DATABASE_URL,
        synchronize: true,
        autoLoadEntities: true,
      }),
    }),
    TypeOrmModule.forFeature([ChatMemory]), // ✅ This enables repo in AppController
    AIVoiceModule,
    // ADDED: New modules for authentication and integrations
    AuthModule,
    GmailModule,
    GoogleDriveModule,
    KnowledgeBaseModule,
    WebSearchModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {
  constructor() {
    console.log('✅ Atom App Module loaded - Ready for frontend connection');
  }
}
