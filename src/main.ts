// src/main.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  app.enableCors();
  app.setGlobalPrefix('api/v1', {
    exclude: ['/', '/health']
  });
app.enableCors({
    origin: ['http://localhost:3000', 'https://atom-frontend-production-u...', 'https://your-frontend-domain.com'],
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });
  
  await app.listen(process.env.PORT || 3000);
}


bootstrap();