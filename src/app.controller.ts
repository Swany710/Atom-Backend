import { Controller, Get, Post, Body } from '@nestjs/common';
import { AppService } from './app.service';

interface TextCommandRequest {
  message: string;
  userId?: string;
  conversationId?: string;
}

@Controller()
export class AppController {
  private conversations: Map<string, any[]> = new Map();

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

  // AI Health endpoint
  @Get('api/v1/ai/health')
  getAIHealth() {
    return { 
      status: 'ok', 
      service: 'AI Voice Service',
      timestamp: new Date().toISOString(),
      version: '1.0.0'
    };
  }

  // AI Status endpoint
  @Get('api/v1/ai/status')
  getAIStatus() {
    return {
      status: 'available',
      aiService: 'mock',
      mode: 'mock',
      timestamp: new Date().toISOString()
    };
  }

  // AI Text endpoint
  @Post('api/v1/ai/text')
  async handleTextCommand(@Body() body: TextCommandRequest) {
    try {
      if (!body || !body.message) {
        return {
          message: "Please provide a message in your request.",
          conversationId: `error-${Date.now()}`,
          timestamp: new Date(),
          mode: 'error',
        };
      }

      // Generate mock response
      const mockResponses = [
        "Hello! I'm Atom, your AI construction assistant. I'm currently running in demonstration mode. How can I help with your construction project?",
        "I understand you're asking about construction. I'm here to help with project planning, material estimates, safety guidelines, and more!",
        "As your construction AI assistant, I can help with planning, scheduling, cost estimation, and technical questions. What would you like to know?",
        "Great question! While I'm in demo mode, I'm designed to help with all aspects of construction management. Tell me more about your project!",
      ];

      const currentConversationId = body.conversationId || `${body.userId || 'user'}-${Date.now()}`;
      const randomResponse = mockResponses[Math.floor(Math.random() * mockResponses.length)];
      
      // Store conversation
      const conversationHistory = this.conversations.get(currentConversationId) || [];
      conversationHistory.push(
        { role: 'user', content: body.message },
        { role: 'assistant', content: randomResponse }
      );
      this.conversations.set(currentConversationId, conversationHistory);

      return {
        message: randomResponse,
        conversationId: currentConversationId,
        timestamp: new Date(),
        mode: 'mock',
      };

    } catch (error) {
      console.error('Text command error:', error);
      return {
        message: "I'm having technical difficulties right now, but I'm your AI construction assistant Atom. Please try again in a moment!",
        conversationId: `error-${Date.now()}`,
        timestamp: new Date(),
        mode: 'error',
      };
    }
  }

  // AI Voice endpoint (mock for now)
  @Post('api/v1/ai/voice')
  async handleVoiceCommand(@Body() body: any) {
    try {
      const mockTranscription = "Hello, can you help me with my construction project?";
      const mockResponse = "I heard your voice message! While I'm in demo mode, I'm ready to help with construction planning, safety guidelines, and project management. What specific aspect would you like assistance with?";
      
      const currentConversationId = `voice-${Date.now()}`;

      return {
        message: mockResponse,
        transcription: `[Demo Mode] ${mockTranscription}`,
        conversationId: currentConversationId,
        timestamp: new Date(),
        mode: 'mock',
      };

    } catch (error) {
      console.error('Voice command error:', error);
      return {
        message: "I'm having trouble processing audio in demo mode, but I'm here to help with construction questions via text!",
        transcription: '[Demo Mode] Audio processing unavailable',
        conversationId: `error-${Date.now()}`,
        timestamp: new Date(),
        mode: 'error',
      };
    }
  }

  // Get conversations
  @Get('api/v1/ai/conversations/:userId')
  getUserConversations() {
    return {
      conversations: Array.from(this.conversations.keys()),
      count: this.conversations.size,
      mode: 'mock'
    };
  }
}