import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // Enable CORS for frontend - Allow both localhost and 127.0.0.1
  app.enableCors({
    origin: [
      'http://localhost:3001', 
      'http://127.0.0.1:3001',
      'file://'
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });
  
  app.setGlobalPrefix('api/v1');
  
  const port = 3000;
  await app.listen(port);
  console.log(`🚀 Voice Backend running on: http://localhost:${port}`);
  console.log(`📝 Test endpoint: http://localhost:${port}/api/v1/voice/process`);
}

bootstrap();