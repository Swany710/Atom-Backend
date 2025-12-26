import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AIVoiceModule } from './ai/ai-voice.module';
import { ChatMemory } from './ai/chat-memory.entity';
import { EmailModule } from './integrations/email/email.module';

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
    EmailModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {
  constructor() {
    console.log('✅ Atom App Module loaded - Ready for frontend connection');
  }
}
