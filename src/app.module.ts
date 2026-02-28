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
        ssl: process.env.DATABASE_URL?.includes('supabase') || process.env.DATABASE_SSL === 'true'
          ? { rejectUnauthorized: false }
          : false,
        extra: {
          max: 5,
          connectionTimeoutMillis: 10000,
        },
      }),
    }),
    TypeOrmModule.forFeature([ChatMemory]),
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
