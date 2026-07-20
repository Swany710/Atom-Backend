import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { JwtModule } from '@nestjs/jwt';
import { ScheduleModule } from '@nestjs/schedule';
import * as dns from 'dns';
import * as crypto from 'crypto';
import * as fs from 'fs';
import { VoiceModule } from './voice/voice.module';
import { EmailModule } from './integrations/email/email.module';
import { CalendarModule } from './integrations/calendar/calendar.module';
import { CrmModule } from './integrations/crm/crm.module';
import { KnowledgeBaseModule } from './knowledge-base/knowledge-base.module';
import { NotesModule } from './notes/notes.module';
import { ApiKeyGuard } from './guards/api-key.guard';
import { HealthModule } from './health/health.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { PendingActionModule } from './pending-actions/pending-action.module';
import { MemoryModule } from './memory/memory.module';
import { ScheduledTasksModule } from './scheduled-tasks/scheduled-tasks.module';
import { CorrelationMiddleware } from './middleware/correlation.middleware';
import { AdminModule } from './admin/admin.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { TenantContextInterceptor } from './organizations/tenant-context.interceptor';

// Force Node.js to prefer IPv4 for ALL DNS lookups globally.
// Railway containers cannot reach external IPv6 addresses (ENETUNREACH).
// This must be set before any network connections are made.
dns.setDefaultResultOrder('ipv4first');

const isProd = process.env.NODE_ENV === 'production';

const isSupabasePooler = (url?: string): boolean =>
  !!url && (url.includes('pooler.supabase.com') || url.includes(':6543'));

const isSupabase = (url?: string): boolean =>
  !!url && url.includes('supabase');

/**
 * Build the TypeORM/pg `ssl` option.
 * - No SSL needed → false
 * - DATABASE_TLS_STRICT=true → verify cert (with CA if provided)
 * - Otherwise → encrypted but unverified (legacy behavior) + warning
 */
function buildSslConfig(supa: boolean): false | Record<string, unknown> {
  const sslWanted = supa || process.env.DATABASE_SSL === 'true';
  if (!sslWanted) return false;

  const strict = process.env.DATABASE_TLS_STRICT === 'true';
  if (!strict) {
    console.warn(
      '⚠️  DATABASE_TLS_STRICT is not enabled — DB TLS certificate is NOT verified. ' +
      'Set DATABASE_TLS_STRICT=true and provide DATABASE_CA_CERT (or _PATH) in production.',
    );
    return { rejectUnauthorized: false };
  }

  let ca: string | undefined = process.env.DATABASE_CA_CERT;
  const caPath = process.env.DATABASE_CA_CERT_PATH;
  if (!ca && caPath) {
    try {
      ca = fs.readFileSync(caPath, 'utf8');
    } catch (err) {
      console.error(`FATAL: DATABASE_CA_CERT_PATH is set but unreadable: ${caPath}`);
      process.exit(1);
    }
  }

  return { rejectUnauthorized: true, ...(ca ? { ca } : {}) };
}

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

          // SSL required for Supabase.
          //
          // DATABASE_TLS_STRICT=true (recommended in production) verifies the
          // server certificate, protecting DB traffic from MITM. Supabase uses
          // a self-signed CA, so strict mode needs the CA cert — provide it via
          //   DATABASE_CA_CERT       (PEM contents, e.g. Railway env var), or
          //   DATABASE_CA_CERT_PATH  (path to a PEM file).
          // Download it from: Supabase Dashboard → Settings → Database → SSL.
          // Without strict mode we fall back to encrypted-but-unverified TLS
          // and log a warning so the gap is visible.
          ssl: buildSslConfig(supa),

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
      useFactory: () => {
        // No hardcoded fallback secret — a known default would let anyone
        // forge valid tokens if env validation were ever bypassed.
        // Production: env.validation.ts exits at boot if JWT_SECRET is unset.
        // Development: generate a random per-boot secret (dev JWTs won't
        // survive a restart — acceptable trade for never having a guessable
        // secret in the codebase).
        let secret = process.env.JWT_SECRET;
        if (!secret) {
          if (isProd) throw new Error('JWT_SECRET is required in production');
          secret = crypto.randomBytes(32).toString('hex');
          console.warn('⚠️  [dev] JWT_SECRET not set — using random per-boot secret (JWTs reset on restart)');
        }
        return {
          secret,
          // 24h default (was 7d): tokens live in browser localStorage, so a
          // shorter lifetime limits the damage window if one is ever stolen.
          // Override with JWT_EXPIRES_IN if you need longer sessions.
          signOptions: { expiresIn: (process.env.JWT_EXPIRES_IN ?? '24h') as any },
        };
      },
    }),

    HealthModule,
    AuditModule,
    OrganizationsModule,
    AuthModule,
    AdminModule,
    PendingActionModule,
    MemoryModule,
    ScheduledTasksModule,
    VoiceModule,
    EmailModule,
    CalendarModule,
    CrmModule,
    KnowledgeBaseModule,
    NotesModule,
  ],

  providers: [
    { provide: APP_GUARD, useClass: ApiKeyGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // Tenant context: bridges guard fields into AsyncLocalStorage after auth
    { provide: APP_INTERCEPTOR, useClass: TenantContextInterceptor },
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
