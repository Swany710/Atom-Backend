import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { JwtModule } from '@nestjs/jwt';
import { ScheduleModule } from '@nestjs/schedule';
import * as dns from 'dns';
import { VoiceModule } from './voice/voice.module';
import { EmailModule } from './integrations/email/email.module';
import { CalendarModule } from './integrations/calendar/calendar.module';
import { CrmModule } from './integrations/crm/crm.module';
import { KnowledgeBaseModule } from './knowledge-base/knowledge-base.module';
import { ApiKeyGuard } from './guards/api-key.guard';
import { HealthModule } from './health/health.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { PendingActionModule } from './pending-actions/pending-action.module';
import { MemoryModule } from './memory/memory.module';
import { ScheduledTasksModule } from './scheduled-tasks/scheduled-tasks.module';
import { CorrelationMiddleware } from './middleware/correlation.middleware';

// Force Node.js to prefer IPv4 for ALL DNS lookups globally.
// Railway containers cannot reach external IPv6 addresses (ENETUNREACH).
// This must be set before any network connections are made.
dns.setDefaultResultOrder('ipv4first');

const isProd = process.env.NODE_ENV === 'production';

const isSupabasePooler = (url?: string): boolean =>
  !!url && (url.includes('pooler.supabase.com') || url.includes(':6543'));

const isSupabase = (url?: string): boolean =>
  !!url && url.includes('supabase');

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
    }),

    TypeOrmModule.forRootAsync({
      useFactory: () => {
        const dbUrl  = process.env.DATABASE_URL;
        const pooler = isSupabasePooler(dbUrl);
        const supa   = isSupabase(dbUrl);

        return {
          type: 'postgres',
          url:  dbUrl,

          synchronize:      !isProd,
          migrationsRun:    isProd,
          migrations:       ['dist/migrations/*.js'],
          autoLoadEntities: true,

          // SSL required for Supabase
          ssl: supa || process.env.DATABASE_SSL === 'true'
            ? { rejectUnauthorized: false }
            : false,

          extra: {
            max:                     pooler ? 3 : 5,
            connectionTimeoutMillis: 15_000,
            idleTimeoutMillis:       30_000,
            // Pooler doesn't support named prepared statements
            ...(pooler ? { prepare: false } : {}),
          },

          logging: isProd ? ['error', 'warn'] : false,
        };
      },
    }),

    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 120 }]),

    ScheduleModule.forRoot(),

    JwtModule.registerAsync({
      useFactory: () => ({
        secret:      process.env.JWT_SECRET ?? 'dev-jwt-secret-UNSAFE',
        signOptions: { expiresIn: (process.env.JWT_EXPIRES_IN ?? '7d') as any },
      }),
    }),

    HealthModule,
    AuditModule,
    AuthModule,
    PendingActionModule,
    MemoryModule,
    ScheduledTasksModule,
    VoiceModule,
    EmailModule,
    CalendarModule,
    CrmModule,
    KnowledgeBaseModule,
  ],

  providers: [
    { provide: APP_GUARD, useClass: ApiKeyGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CorrelationMiddleware).forRoutes('*');
  }

  constructor() {
    const dbUrl = process.env.DATABASE_URL ?? '';
    const mode  = isSupabasePooler(dbUrl) ? 'Supabase pooler'
                : isSupabase(dbUrl)        ? 'Supabase direct'
                : dbUrl                    ? 'Postgres'
                :                            'NO DATABASE_URL SET';
    console.log(`✅ Atom App Module loaded (NODE_ENV=${process.env.NODE_ENV ?? 'development'}, DB=${mode})`);
  }
}
