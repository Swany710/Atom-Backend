import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { JwtModule } from '@nestjs/jwt';
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
import { CorrelationMiddleware } from './middleware/correlation.middleware';

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
        migrationsRun: isProd,
        migrations: ['dist/migrations/*.js'],
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
    // Rate limiting: 120 requests per minute per IP globally.
    // Adjust limits per-route with @Throttle({ default: { limit, ttl } }).
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60_000,   // 1 minute window (ms)
        limit: 120,    // max requests per window
      },
    ]),
    // JwtModule at root level so ApiKeyGuard (APP_GUARD) can inject JwtService
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: process.env.JWT_SECRET ?? 'dev-jwt-secret-UNSAFE',
        signOptions: { expiresIn: (process.env.JWT_EXPIRES_IN ?? '7d') as any },
      }),
    }),
    HealthModule,
    AuditModule,
    AuthModule,
    PendingActionModule,
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
    // Attach correlation IDs to every incoming request
    consumer.apply(CorrelationMiddleware).forRoutes('*');
  }

  constructor() {
    console.log(`✅ Atom App Module loaded (NODE_ENV=${process.env.NODE_ENV ?? 'development'})`);
  }
}
