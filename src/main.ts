import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { validateProductionEnv } from './config/env.validation';
import { GlobalExceptionFilter } from './filters/global-exception.filter';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';

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
  console.log('APP BOOTSTRAPPED');

  // ── Global exception filter ──────────────────────────────────────────────
  app.useGlobalFilters(new GlobalExceptionFilter());

  // ── Security headers (Helmet) ─────────────────────────────────────────────
  // Sets X-Content-Type-Options, X-Frame-Options, X-XSS-Protection,
  // Strict-Transport-Security, Referrer-Policy, and more on every response.
  // contentSecurityPolicy is disabled here because the backend serves only
  // JSON API responses — CSP belongs on the frontend static server instead.
  app.use(helmet({ contentSecurityPolicy: false }));

  // ── Global validation pipe ────────────────────────────────────────────────
  // whitelist:true            — strips any request-body properties that have no
  //                             matching decorator in the DTO class, preventing
  //                             unexpected fields from reaching service logic.
  // forbidNonWhitelisted:true — returns 400 Bad Request instead of silently
  //                             stripping unknown fields, making rejections explicit.
  // transform:true            — auto-coerces payloads to the declared DTO type
  //                             (e.g. string "5" → number 5 where typed as number).
  // enableImplicitConversion  — uses TypeScript metadata for type coercion without
  //                             requiring explicit @Type() decorators on every field.
  //
  // Note: whitelist/forbidNonWhitelisted only take effect on endpoints whose DTOs
  // are defined as classes with class-validator decorators. Endpoints still using
  // plain interfaces are unaffected today but will be validated as DTOs are migrated.
  app.useGlobalPipes(new ValidationPipe({
    whitelist:             true,
    forbidNonWhitelisted:  true,
    transform:             true,
    transformOptions:      { enableImplicitConversion: true },
  }));

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
  // In production, Swagger is OFF by default — set SWAGGER_ENABLED=true to
  // opt in (e.g. on a private staging deployment).
  // In development, Swagger is ON by default — set SWAGGER_ENABLED=false to
  // opt out.
  // This prevents the full API surface from being publicly enumerable in prod.
  const swaggerEnabled = isProd
    ? process.env.SWAGGER_ENABLED === 'true'   // prod: must explicitly opt in
    : process.env.SWAGGER_ENABLED !== 'false';  // dev:  must explicitly opt out
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
