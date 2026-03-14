import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { validateProductionEnv } from './config/env.validation';
import { GlobalExceptionFilter } from './filters/global-exception.filter';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

// ── Run before anything else ──────────────────────────────────────────────
// Exits the process immediately if required production env vars are missing.
validateProductionEnv();

// ── Fatal signal handlers ──────────────────────────────────────────────────
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
  app.useGlobalFilters(new GlobalExceptionFilter());

  const isProd = process.env.NODE_ENV === 'production';

  // ── CORS ─────────────────────────────────────────────────────────────────
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

  // ── Swagger / OpenAPI ─────────────────────────────────────────────────────
  // Available at /api/docs in all environments.
  // Set SWAGGER_ENABLED=false to disable in production if you prefer.
  const swaggerEnabled = process.env.SWAGGER_ENABLED !== 'false';
  if (swaggerEnabled) {
    const config = new DocumentBuilder()
      .setTitle('Atom Backend API')
      .setDescription('AI-powered field assistant for McGee Restoration / AMRG Exteriors')
      .setVersion('1.0')
      .addBearerAuth(
        { type: 'http', scheme: 'bearer', bearerFormat: 'JWT | API_KEY' },
        'bearer',
      )
      .addTag('AI', 'Text and voice AI endpoints')
      .addTag('Auth', 'Registration and login')
      .addTag('Email', 'Gmail and Outlook integration')
      .addTag('Calendar', 'Google Calendar integration')
      .addTag('CRM', 'AccuLynx CRM integration')
      .addTag('Health', 'Liveness and readiness probes')
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: { persistAuthorization: true },
    });
    console.log(`   Swagger docs: http://localhost:${process.env.PORT || 3000}/api/docs`);
  }

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`🚀 Atom Backend running on port ${port}`);
  console.log(`   NODE_ENV: ${process.env.NODE_ENV ?? 'development'}`);
  console.log(`   CORS: ${JSON.stringify(corsOrigin)}`);
  console.log(`   Auth guard: ${process.env.API_KEY ? 'enabled (Bearer key)' : 'DISABLED — set API_KEY'}`);
}
bootstrap();
