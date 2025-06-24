 
// src/ai/ai-voice.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { N8NService } from '../n8n/n8n.service';

interface VoiceCommand {
  transcription?: string;
  textInput?: string;
}

interface ProcessingResult {
  response: string;
  actions: any[];
  confidence: number;
  success: boolean;
}

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

  async processVoiceCommand(command: VoiceCommand): Promise<ProcessingResult> {
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

      // First, determine what actions to take
      const analysis = await this.analyzeCommand(userInput);
      
      if (!analysis.needsAction) {
        return {
          response: analysis.response,
          actions: [],
          confidence: analysis.confidence,
          success: true
        };
      }

      // Execute the identified actions
      const actions = [];
      for (const action of analysis.actions) {
        const result = await this.executeAction(action);
        actions.push(result);
      }

      // Generate a response based on the results
      const response = await this.generateResponse(userInput, actions);

      return {
        response,
        actions,
        confidence: analysis.confidence,
        success: actions.some(a => a.success)
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

  private async analyzeCommand(userInput: string): Promise<{
    needsAction: boolean;
    actions: any[];
    response: string;
    confidence: number;
  }> {
    if (!this.openai) {
      // Fallback without OpenAI
      return this.simpleCommandAnalysis(userInput);
    }

    try {
      const prompt = `Analyze this user request and determine what actions to take:

User: "${userInput}"

Available actions:
1. create_calendar_event - for scheduling meetings, appointments, site visits
2. send_email - for sending emails to clients, team members, contractors
3. create_reminder - for setting reminders and alerts
4. create_task - for creating todo items and tasks

Respond with JSON:
{
  "needsAction": boolean,
  "actions": [
    {
      "type": "create_calendar_event|send_email|create_reminder|create_task",
      "parameters": { ... extracted parameters ... }
    }
  ],
  "response": "conversational response if no action needed",
  "confidence": 0.0 to 1.0
}

Focus on construction/project management context.`;

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        response_format: { type: 'json_object' }
      });

      const analysis = JSON.parse(response.choices[0].message.content);
      this.logger.log('AI analysis:', analysis);
      
      return analysis;
    } catch (error) {
      this.logger.error('AI analysis failed:', error);
      return this.simpleCommandAnalysis(userInput);
    }
  }

  private simpleCommandAnalysis(userInput: string): any {
    const input = userInput.toLowerCase();
    
    // Simple keyword-based analysis as fallback
    if (input.includes('schedule') || input.includes('meeting') || input.includes('appointment')) {
      return {
        needsAction: true,
        actions: [{
          type: 'create_calendar_event',
          parameters: {
            title: 'Meeting',
            startDateTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // Tomorrow
          }
        }],
        response: '',
        confidence: 0.6
      };
    }
    
    if (input.includes('email') || input.includes('send')) {
      return {
        needsAction: true,
        actions: [{
          type: 'send_email',
          parameters: {
            to: 'example@example.com',
            subject: 'Update',
            body: userInput
          }
        }],
        response: '',
        confidence: 0.6
      };
    }

    if (input.includes('remind') || input.includes('alert')) {
      return {
        needsAction: true,
        actions: [{
          type: 'create_reminder',
          parameters: {
            title: 'Reminder',
            remindAt: new Date(Date.now() + 60 * 60 * 1000).toISOString() // 1 hour
          }
        }],
        response: '',
        confidence: 0.6
      };
    }

    return {
      needsAction: false,
      actions: [],
      response: "I can help you schedule meetings, send emails, create reminders, and manage tasks. What would you like me to do?",
      confidence: 0.8
    };
  }

  private async executeAction(action: any): Promise<any> {
    this.logger.log(`Executing action: ${action.type}`);

    switch (action.type) {
      case 'create_calendar_event':
        return await this.n8nService.executeCalendarWorkflow(action.parameters);
      
      case 'send_email':
        return await this.n8nService.executeEmailWorkflow(action.parameters);
      
      case 'create_reminder':
        return await this.n8nService.executeReminderWorkflow(action.parameters);
      
      case 'create_task':
        // For now, just return success - you can integrate with your task system later
        return {
          success: true,
          workflowName: 'task',
          result: { message: 'Task created successfully' }
        };
      
      default:
        return {
          success: false,
          workflowName: action.type,
          error: 'Unknown action type'
        };
    }
  }

  private async generateResponse(userInput: string, actions: any[]): Promise<string> {
    if (!this.openai) {
      return this.simpleResponseGeneration(actions);
    }

    try {
      const successfulActions = actions.filter(a => a.success);
      const failedActions = actions.filter(a => !a.success);

      const prompt = `Generate a natural response to the user based on these executed actions:

User request: "${userInput}"

Successful actions:
${successfulActions.map(a => `- ${a.workflowName}: completed`).join('\n')}

Failed actions:
${failedActions.map(a => `- ${a.workflowName}: ${a.error}`).join('\n')}

Respond naturally and professionally, acknowledging what was completed.`;

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 150
      });

      return response.choices[0].message.content;
    } catch (error) {
      this.logger.error('Response generation failed:', error);
      return this.simpleResponseGeneration(actions);
    }
  }

  private simpleResponseGeneration(actions: any[]): string {
    const successCount = actions.filter(a => a.success).length;
    const totalCount = actions.length;

    if (successCount === 0) {
      return "I encountered some issues processing your request. Please try again.";
    } else if (successCount === totalCount) {
      return `Great! I've completed ${successCount} action${successCount > 1 ? 's' : ''} for you.`;
    } else {
      return `I completed ${successCount} out of ${totalCount} actions. Some tasks may need your attention.`;
    }
  }

  async transcribeAudio(audioBuffer: Buffer): Promise<string> {
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