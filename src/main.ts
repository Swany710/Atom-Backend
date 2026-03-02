import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // ── CORS ─────────────────────────────────────────────────────────────────
  // ALLOWED_ORIGINS = comma-separated list of allowed origins, or '*' for open.
  // Example prod value: https://app.mysite.com,https://mysite.com
  const rawOrigins = process.env.ALLOWED_ORIGINS;
  const corsOrigin =
    !rawOrigins || rawOrigins.trim() === '*'
      ? '*'
      : rawOrigins.split(',').map((s) => s.trim());

  app.enableCors({
    origin: corsOrigin,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  });

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`🚀 Atom Backend running on port ${port}`);
  console.log(`   CORS: ${JSON.stringify(corsOrigin)}`);
  console.log(`   Auth guard: ${process.env.API_KEY ? 'enabled (Bearer key)' : 'disabled (no API_KEY set)'}`);
}
bootstrap();