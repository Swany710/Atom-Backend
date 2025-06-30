"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppController = void 0;
const common_1 = require("@nestjs/common");
const platform_express_1 = require("@nestjs/platform-express");
const app_service_1 = require("./app.service");
const config_1 = require("@nestjs/config");
let AppController = class AppController {
    constructor(appService, configService) {
        this.appService = appService;
        this.configService = configService;
        this.conversations = new Map();
        console.log('✅ Atom Backend Controller initialized');
    }
    getHello() {
        return this.appService.getHello();
    }
    getHealth() {
        return {
            status: 'ok',
            timestamp: new Date().toISOString(),
        };
    }
    getAIHealth() {
        const apiKey = this.configService.get('OPENAI_API_KEY');
        const isConfigured = !!apiKey && apiKey.startsWith('sk-');
        return {
            status: 'ok',
            service: 'Personal AI Assistant',
            openaiConfigured: isConfigured,
            timestamp: new Date().toISOString()
        };
    }
    getAIStatus() {
        const apiKey = this.configService.get('OPENAI_API_KEY');
        const isConfigured = !!apiKey && apiKey.startsWith('sk-');
        return {
            status: isConfigured ? 'available' : 'configuration_error',
            aiService: isConfigured ? 'online' : 'offline',
            mode: isConfigured ? 'openai' : 'error',
            timestamp: new Date().toISOString()
        };
    }
    async processTextCommand1(body) {
        console.log('💬 Frontend text request:', body);
        try {
            if (!body || !body.message) {
                throw new common_1.BadRequestException('Message is required');
            }
            const apiKey = this.configService.get('OPENAI_API_KEY');
            if (!apiKey || !apiKey.startsWith('sk-')) {
                return {
                    message: "Hi! I'm Atom, but I need an OpenAI API key to chat with you. Please configure the OPENAI_API_KEY environment variable.",
                    conversationId: `error-${Date.now()}`,
                    timestamp: new Date(),
                    mode: 'error'
                };
            }
            console.log('🤖 Calling OpenAI GPT...');
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: 'gpt-3.5-turbo',
                    messages: [
                        {
                            role: 'system',
                            content: 'You are Atom, a helpful personal AI assistant. You help with daily tasks, productivity, scheduling, reminders, information lookup, decision-making, planning, and general life assistance. Be friendly, conversational, and genuinely helpful. Keep responses concise but informative.'
                        },
                        {
                            role: 'user',
                            content: body.message
                        }
                    ],
                    max_tokens: 500,
                    temperature: 0.7,
                })
            });
            if (!response.ok) {
                console.error('❌ OpenAI API Error:', response.status);
                if (response.status === 401) {
                    return {
                        message: "I'm having authentication issues with OpenAI. Please check that the API key is valid and has sufficient credits.",
                        conversationId: `error-${Date.now()}`,
                        timestamp: new Date(),
                        mode: 'error'
                    };
                }
                if (response.status === 429) {
                    return {
                        message: "I'm currently at capacity. Please try again in a moment.",
                        conversationId: `error-${Date.now()}`,
                        timestamp: new Date(),
                        mode: 'error'
                    };
                }
                throw new Error(`OpenAI API error: ${response.status}`);
            }
            const data = await response.json();
            const aiResponse = data.choices[0]?.message?.content || 'Sorry, I could not generate a response.';
            console.log('✅ GPT Response generated successfully');
            const conversationId = body.conversationId || `${body.userId || 'user'}-${Date.now()}`;
            const conversation = this.conversations.get(conversationId) || [];
            conversation.push({ role: 'user', content: body.message, timestamp: new Date() }, { role: 'assistant', content: aiResponse, timestamp: new Date() });
            this.conversations.set(conversationId, conversation);
            return {
                message: aiResponse,
                conversationId: conversationId,
                timestamp: new Date(),
                mode: 'openai'
            };
        }
        catch (error) {
            console.error('❌ Text processing error:', error.message);
            return {
                message: `I'm experiencing technical difficulties: ${error.message}. Please try again in a moment.`,
                conversationId: `error-${Date.now()}`,
                timestamp: new Date(),
                mode: 'error',
                error: error.message
            };
        }
    }
    async processVoiceCommand1(file, body) {
        console.log('🎤 Frontend voice request:');
        console.log('   File exists:', !!file);
        console.log('   File size:', file?.size || 'unknown');
        console.log('   File type:', file?.mimetype || 'unknown');
        console.log('   Form data:', body);
        try {
            if (!file || !file.buffer) {
                return {
                    message: "No audio file was received. Please check your microphone permissions and try recording again.",
                    transcription: '[No Audio File]',
                    conversationId: `voice-error-${Date.now()}`,
                    timestamp: new Date(),
                    mode: 'error'
                };
            }
            const apiKey = this.configService.get('OPENAI_API_KEY');
            if (!apiKey || !apiKey.startsWith('sk-')) {
                return {
                    message: "I can hear you, but I need an OpenAI API key to process voice commands. Please configure the OPENAI_API_KEY environment variable.",
                    transcription: '[API Key Missing]',
                    conversationId: `voice-error-${Date.now()}`,
                    timestamp: new Date(),
                    mode: 'error'
                };
            }
            console.log('🎤 Transcribing with Whisper...');
            const FormData = require('form-data');
            const form = new FormData();
            form.append('file', file.buffer, {
                filename: file.originalname || 'audio.webm',
                contentType: file.mimetype || 'audio/webm'
            });
            form.append('model', 'whisper-1');
            const transcriptionResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    ...form.getHeaders()
                },
                body: form
            });
            if (!transcriptionResponse.ok) {
                const errorText = await transcriptionResponse.text();
                console.error('❌ Whisper API error:', transcriptionResponse.status, errorText);
                return {
                    message: "I had trouble understanding your voice. Please try speaking clearly or use text instead.",
                    transcription: '[Transcription Failed]',
                    conversationId: `voice-error-${Date.now()}`,
                    timestamp: new Date(),
                    mode: 'error'
                };
            }
            const transcriptionData = await transcriptionResponse.json();
            const transcribedText = transcriptionData.text || 'Could not transcribe audio';
            console.log('✅ Transcription successful:', transcribedText);
            const textResult = await this.processTextCommand1({
                message: transcribedText,
                userId: body.userId || 'voice-user'
            });
            return {
                message: textResult.message,
                transcription: transcribedText,
                conversationId: textResult.conversationId,
                timestamp: new Date(),
                mode: textResult.mode
            };
        }
        catch (error) {
            console.error('❌ Voice processing error:', error);
            return {
                message: `Voice processing failed: ${error.message}. Please try speaking clearly or use text instead.`,
                transcription: '[Processing Error]',
                conversationId: `voice-error-${Date.now()}`,
                timestamp: new Date(),
                mode: 'error',
                error: error.message
            };
        }
    }
    getConversation(conversationId) {
        const conversation = this.conversations.get(conversationId) || [];
        return {
            conversationId,
            messages: conversation,
            messageCount: conversation.length,
            timestamp: new Date()
        };
    }
    clearConversation(body) {
        if (body.conversationId) {
            this.conversations.delete(body.conversationId);
        }
        else {
            this.conversations.clear();
        }
        return {
            message: 'Conversation cleared',
            timestamp: new Date()
        };
    }
};
exports.AppController = AppController;
__decorate([
    (0, common_1.Get)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", String)
], AppController.prototype, "getHello", null);
__decorate([
    (0, common_1.Get)('health'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AppController.prototype, "getHealth", null);
__decorate([
    (0, common_1.Get)('ai/health'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AppController.prototype, "getAIHealth", null);
__decorate([
    (0, common_1.Get)('ai/status'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AppController.prototype, "getAIStatus", null);
__decorate([
    (0, common_1.Post)('ai/text-command1'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "processTextCommand1", null);
__decorate([
    (0, common_1.Post)('ai/voice-command1'),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('audio')),
    __param(0, (0, common_1.UploadedFile)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "processVoiceCommand1", null);
__decorate([
    (0, common_1.Get)('ai/conversation/:conversationId'),
    __param(0, (0, common_1.Body)('conversationId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], AppController.prototype, "getConversation", null);
__decorate([
    (0, common_1.Post)('ai/conversation/clear'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AppController.prototype, "clearConversation", null);
exports.AppController = AppController = __decorate([
    (0, common_1.Controller)(),
    __metadata("design:paramtypes", [app_service_1.AppService,
        config_1.ConfigService])
], AppController);
//# sourceMappingURL=app.controller.js.map