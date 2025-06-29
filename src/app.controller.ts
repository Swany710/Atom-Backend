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

  // AI Health routes - matching exactly what frontend expects
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

  // Frontend expects these exact routes based on console logs
  @Post('ai/text-command1')
  postAITextCommand1(@Body() body: any) {
    console.log('AI Text Command1 endpoint called with:', body);
    
    // Generate construction-focused AI response
    const constructionResponses = [
      "Hello! I'm Atom, your AI construction assistant. I can help with project planning, material estimates, safety protocols, and construction management. What specific aspect of your project would you like assistance with?",
      "Great to hear from you! As your construction AI, I can provide guidance on building codes, project scheduling, cost estimation, and safety compliance. Tell me about your current construction challenge.",
      "Hi there! I'm here to help with your construction needs - whether it's structural planning, material selection, permit requirements, or project management. What construction topic can I assist you with today?",
      "Welcome! I specialize in construction assistance including foundation work, framing, electrical planning, plumbing layout, and project coordination. How can I help make your construction project successful?"
    ];
    
    const randomResponse = constructionResponses[Math.floor(Math.random() * constructionResponses.length)];
    
    return {
      message: randomResponse,
      conversationId: `text-${Date.now()}`,
      timestamp: new Date().toISOString(),
      mode: 'demo'
    };
  }

  @Post('ai/voice-command1')
  postAIVoiceCommand1(@Body() body: any) {
    console.log('AI Voice Command1 endpoint called!');
    
    // Mock voice processing response
    const voiceResponses = [
      "I received your voice message! While I'm in demo mode, I'm ready to help with construction planning, safety guidelines, and project management.",
      "Voice command processed! I can assist with building permits, material calculations, construction scheduling, and safety protocols.",
      "Got your audio! I'm here to help with construction challenges like structural design, cost estimation, and project coordination.",
      "Voice message received! Let me know how I can help with your construction project - planning, materials, safety, or technical guidance."
    ];
    
    const randomResponse = voiceResponses[Math.floor(Math.random() * voiceResponses.length)];
    
    return {
      message: randomResponse,
      transcription: '[Demo Mode] Hello Atom, can you help with my construction project?',
      conversationId: `voice-${Date.now()}`,
      timestamp: new Date().toISOString(),
      mode: 'demo'
    };
  }

  // Alternative routes in case frontend tries different endpoints
  @Post('ai/text-command')
  postAITextCommand(@Body() body: any) {
    return this.postAITextCommand1(body);
  }

  @Post('ai/voice-command')
  postAIVoiceCommand(@Body() body: any) {
    return this.postAIVoiceCommand1(body);
  }

  @Post('ai/text')
  postAIText(@Body() body: any) {
    return this.postAITextCommand1(body);
  }

  @Post('ai/voice')
  postAIVoice(@Body() body: any) {
    return this.postAIVoiceCommand1(body);
  }
}