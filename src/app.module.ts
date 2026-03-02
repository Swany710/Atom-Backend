import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AIVoiceModule } from './ai/ai-voice.module';
import { ChatMemory } from './ai/chat-memory.entity';
import { EmailModule } from './integrations/email/email.module';
import { ApiKeyGuard } from './guards/api-key.guard';

const isProd = process.env.NODE_ENV === 'production';

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
        // ⚠️  synchronize=true auto-alters the DB schema on every boot.
        //    Disabled in production to prevent accidental data loss.
        //    Run migrations manually before deploying schema changes.
        synchronize: !isProd,
        autoLoadEntities: true,
        // SSL: on for Supabase by default.
        // Set DATABASE_TLS_STRICT=true to enforce certificate validation.
        ssl:
          process.env.DATABASE_URL?.includes('supabase') ||
          process.env.DATABASE_SSL === 'true'
            ? { rejectUnauthorized: process.env.DATABASE_TLS_STRICT === 'true' }
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
  providers: [
    AppService,
    // Global API-key guard — set API_KEY env var to enable, leave unset for open/dev mode
    { provide: APP_GUARD, useClass: ApiKeyGuard },
  ],
})
export class AppModule {
  constructor() {
    console.log(`✅ Atom App Module loaded (NODE_ENV=${process.env.NODE_ENV ?? 'development'})`);
    if (isProd && !process.env.API_KEY) {
      console.warn('⚠️  API_KEY is not set — all routes are unauthenticated in production!');
    }
  }
}
