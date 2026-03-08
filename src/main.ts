import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { validateProductionEnv } from './config/env.validation';

// ── Run before anything else ──────────────────────────────────────────────
// Exits the process immediately if required production env vars are missing.
validateProductionEnv();

// ── Global safety net ──────────────────────────────────────────────────────
// Prevent unhandled promise rejections (e.g. a tool call throwing) from
// crashing the entire process and forcing a Railway restart.
process.on('unhandledRejection', (reason, promise) => {
  console.error('⚠️  Unhandled promise rejection (process kept alive):', reason, promise);
});
process.on('uncaughtException', (err) => {
  console.error('⚠️  Uncaught exception (process kept alive):', err);
});

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

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
