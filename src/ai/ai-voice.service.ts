// src/ai/ai-voice.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

@Injectable()
export class AIVoiceService {
  private readonly openai: OpenAI;
  private readonly logger = new Logger(AIVoiceService.name);

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    if (!apiKey) {
      this.logger.error('OpenAI API key not found');
      throw new Error('OpenAI API key not configured');
    }

    this.openai = new OpenAI({
      apiKey: apiKey,
    });
    
    this.logger.log('AI Voice Service initialized');
  }

  async processVoiceCommand(audioBuffer: Buffer): Promise<any> {
    this.logger.log('Processing voice command...');
    
    try {
      const transcription = await this.transcribeAudio(audioBuffer);
      this.logger.log(`Transcription: "${transcription}"`);

      const aiResult = await this.processMessage(transcription);
      this.logger.log(`AI Response: "${aiResult.response}"`);

      return {
        success: true,
        transcription,
        response: aiResult.response,
        timestamp: new Date().toISOString(),
      };

    } catch (error) {
      this.logger.error('Voice processing failed:', error);
      
      return {
        success: false,
        error: error.message,
        transcription: '',
        response: 'Sorry, I encountered an error processing your voice command.',
        timestamp: new Date().toISOString(),
      };
    }
  }

  async transcribeAudio(audioBuffer: Buffer): Promise<string> {
    if (!audioBuffer || audioBuffer.length === 0) {
      throw new Error('No audio data provided');
    }

    this.logger.log(`Audio buffer size: ${audioBuffer.length} bytes`);

    const tempDir = os.tmpdir();
    const tempPath = path.join(tempDir, `voice_${Date.now()}.mp3`);

    try {
      fs.writeFileSync(tempPath, audioBuffer);
      
      const stats = fs.statSync(tempPath);
      this.logger.log(`Temp file created: ${stats.size} bytes`);

      const transcription = await this.openai.audio.transcriptions.create({
        file: fs.createReadStream(tempPath),
        model: 'whisper-1',
        language: 'en',
        response_format: 'json',
        temperature: 0.0,
      });

      this.logger.log(`Transcription successful: "${transcription.text}"`);
      return transcription.text;

    } catch (error) {
      this.logger.error('Transcription error:', error);
      throw new Error(`Audio transcription failed: ${error.message}`);
    } finally {
      try {
        if (fs.existsSync(tempPath)) {
          fs.unlinkSync(tempPath);
          this.logger.log('Cleaned up temp file');
        }
      } catch (cleanupError) {
        this.logger.warn('Failed to cleanup temp file:', cleanupError);
      }
    }
  }

  async processMessage(message: string): Promise<any> {
    try {
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: `You are an AI assistant for a construction company. 
            Help with scheduling, communication, task management, and general construction questions.
            Be concise, practical, and friendly in your responses.`
          },
          {
            role: 'user',
            content: message
          }
        ],
        temperature: 0.7,
        max_tokens: 500,
      });

      const response = completion.choices[0].message.content;

      return {
        response,
        usage: completion.usage
      };

    } catch (error) {
      this.logger.error('AI processing error:', error);
      throw new Error(`AI processing failed: ${error.message}`);
    }
  }
}