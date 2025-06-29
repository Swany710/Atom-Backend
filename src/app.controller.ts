import { Controller, Get, Post, Body } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('health')
  getHealth() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('test')
  getTest() {
    return {
      message: 'Test route is working!',
      timestamp: new Date().toISOString(),
    };
  }

  // AI routes WITHOUT api/v1 prefix (global prefix handles it)
  @Get('ai/health')
  getAIHealth() {
    console.log('AI Health endpoint called!');
    return { 
      status: 'ok', 
      message: 'AI Health endpoint is working!',
      timestamp: new Date().toISOString()
    };
  }

  @Get('ai/status')
  getAIStatus() {
    console.log('AI Status endpoint called!');
    return {
      status: 'available',
      message: 'AI Status endpoint is working!',
      timestamp: new Date().toISOString()
    };
  }

  @Post('ai/text')
  postAIText(@Body() body: any) {
    console.log('AI Text endpoint called with:', body);
    return {
      message: 'Hello! This is a simple test response from Atom AI.',
      input: body,
      timestamp: new Date().toISOString()
    };
  }

  @Post('ai/voice')
  postAIVoice(@Body() body: any) {
    console.log('AI Voice endpoint called!');
    return {
      message: 'Voice endpoint working in demo mode!',
      transcription: '[Demo] Hello Atom',
      timestamp: new Date().toISOString()
    };
  }
}