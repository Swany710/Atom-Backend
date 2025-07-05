// src/app.service.ts
import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): string {
    return 'Construction Assistant API is running! 🏗️';
  }

  getHealth() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      environment: process.env.NODE_ENV || 'development'
    };
  }

  getVersion() {
    return {
      version: '1.0.0',
      name: 'construction-assistant-backend',
      description: 'AI-powered construction assistant backend',
      author: 'Your Name'
    };
  }
}
