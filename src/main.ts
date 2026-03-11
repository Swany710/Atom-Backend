import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { validateProductionEnv } from './config/env.validation';
import { GlobalExceptionFilter } from './filters/global-exception.filter';

// ── Run before anything else ──────────────────────────────────────────────
// Exits the process immediately if required production env vars are missing.
validateProductionEnv();

// ── Fatal signal handlers ──────────────────────────────────────────────────
// Log context then exit intentionally so Railway can restart cleanly.
// A zombie process that silently swallows errors is far more dangerous
// than a clean restart.
process.on('unhandledRejection', (reason: unknown) => {
  console.error(
    JSON.stringify({
      level: 'FATAL',
      event: 'unhandledRejection',
      reason: reason instanceof Error
        ? { message: reason.message, stack: reason.stack }
        : String(reason),
      timestamp: new Date().toISOString(),
    }),
  );
  process.exit(1);
});

process.on('uncaughtException', (err: Error) => {
  console.error(
    JSON.stringify({
      level: 'FATAL',
      event: 'uncaughtException',
      reason: { message: err.message, stack: err.stack },
      timestamp: new Date().toISOString(),
    }),
  );
  process.exit(1);
});

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // ── Global exception filter ──────────────────────────────────────────────
  // Must be registered before guards/interceptors so it catches everything.
  app.useGlobalFilters(new GlobalExceptionFilter());

  const isProd = process.env.NODE_ENV === 'production';

  // ── CORS ─────────────────────────────────────────────────────────────────
  // ALLOWED_ORIGINS = comma-separated list of allowed origins.
  // '*' is rejected in production (validateProductionEnv enforces this).
  const rawOrigins = process.env.ALLOWED_ORIGINS;
  const corsOrigin: string | string[] =
    !rawOrigins || rawOrigins.trim() === '*'
      ? isProd
        ? (() => { console.error('FATAL: wildcard CORS in production'); process.exit(1); })()
        : '*'
      : rawOrigins.split(',').map((s) => s.trim());

  app.enableCors({
    origin: corsOrigin,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Correlation-Id'],
    exposedHeaders: ['X-Correlation-Id', 'X-Transcription', 'X-Response-Text', 'X-Conversation-Id'],
  });

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`🚀 Atom Backend running on port ${port}`);
  console.log(`   NODE_ENV: ${process.env.NODE_ENV ?? 'development'}`);
  console.log(`   CORS: ${JSON.stringify(corsOrigin)}`);
  console.log(`   Auth guard: ${process.env.API_KEY ? 'enabled (Bearer key)' : 'DISABLED — set API_KEY'}`);
}
bootstrap();
