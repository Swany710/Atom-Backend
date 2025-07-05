// src/ai/ai-voice.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { N8NService } from '../n8n/n8n.service';

@Injectable()
export class AIVoiceService {
  private readonly logger = new Logger(AIVoiceService.name);
  private openai: OpenAI;

  constructor(
    private configService: ConfigService,
    private n8nService: N8NService,
  ) {
    const apiKey = this.configService.get('OPENAI_API_KEY');
    
    if (apiKey) {
      this.openai = new OpenAI({ apiKey });
      this.logger.log('OpenAI initialized successfully');
    } else {
      this.logger.warn('OpenAI API key not configured');
    }
  }

  async processVoiceCommand(command: any) {
    try {
      const userInput = command.transcription || command.textInput;
      
      if (!userInput) {
        return {
          response: "I didn't receive any input. Please try again.",
          actions: [],
          confidence: 0,
          success: false
        };
      }

      this.logger.log(`Processing voice command: "${userInput}"`);

      // Simple response for now
      const response = await this.generateSimpleResponse(userInput);
      
      return {
        response,
        actions: [],
        confidence: 0.8,
        success: true
      };

    } catch (error) {
      this.logger.error('Error processing voice command:', error);
      return {
        response: "I encountered an error processing your request. Please try again.",
        actions: [],
        confidence: 0,
        success: false
      };
    }
  }

  private async generateSimpleResponse(userInput: string): Promise<string> {
    if (!this.openai) {
      return "I can help you with voice commands, but OpenAI is not configured yet.";
    }

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'You are a helpful AI assistant for construction professionals. Respond briefly and helpfully.'
          },
          {
            role: 'user',
            content: userInput
          }
        ],
        temperature: 0.7,
        max_tokens: 150
      });

      return response.choices[0].message.content;
    } catch (error) {
      this.logger.error('OpenAI API error:', error);
      return "I'm having trouble connecting to my AI brain right now. Please try again.";
    }
  }

  async transcribeAudio(audioBuffer: Buffer): Promise<string> {
    console.log('Received audio buffer size:', audioBuffer.length);
    
    if (!this.openai) {
      throw new Error('OpenAI not configured for transcription');
    }

    try {
      // Create a temporary file for the audio
      const fs = require('fs');
      const path = require('path');
      const tempPath = path.join(require('os').tmpdir(), `audio_${Date.now()}.mp3`);
      
      fs.writeFileSync(tempPath, audioBuffer);

      const transcription = await this.openai.audio.transcriptions.create({
        file: fs.createReadStream(tempPath),
        model: 'whisper-1',
      });

      // Clean up temp file
      fs.unlinkSync(tempPath);

      return transcription.text;
    } catch (error) {
      this.logger.error('Transcription failed:', error);
      throw error;
    }
  }
}
