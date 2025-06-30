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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppController = void 0;
const common_1 = require("@nestjs/common");
const platform_express_1 = require("@nestjs/platform-express");
const app_service_1 = require("./app.service");
const openai_1 = __importDefault(require("openai"));
const config_1 = require("@nestjs/config");
let AppController = class AppController {
    constructor(appService, configService) {
        this.appService = appService;
        this.configService = configService;
        this.conversations = new Map();
        this.isOpenAIConfigured = false;
        this.initializeOpenAI();
    }
    async initializeOpenAI() {
        try {
            const apiKey = this.configService.get('OPENAI_API_KEY');
            console.log('🔍 OpenAI Initialization:');
            console.log('   API Key exists:', !!apiKey);
            console.log('   API Key length:', apiKey?.length || 0);
            if (!apiKey) {
                console.error('❌ OPENAI_API_KEY not found!');
                this.isOpenAIConfigured = false;
                return;
            }
            this.openai = new openai_1.default({
                apiKey: apiKey,
            });
            console.log('🧪 Testing OpenAI API...');
            const testCompletion = await this.openai.chat.completions.create({
                model: 'gpt-3.5-turbo',
                messages: [{ role: 'user', content: 'Hello' }],
                max_tokens: 5,
            });
            console.log('✅ OpenAI API working!');
            this.isOpenAIConfigured = true;
        }
        catch (error) {
            console.error('❌ OpenAI setup failed:', error.message);
            this.isOpenAIConfigured = false;
        }
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
        return {
            status: 'ok',
            service: 'Personal AI Assistant',
            openaiConfigured: this.isOpenAIConfigured,
            timestamp: new Date().toISOString()
        };
    }
    getAIStatus() {
        return {
            status: this.isOpenAIConfigured ? 'available' : 'configuration_error',
            aiService: this.isOpenAIConfigured ? 'online' : 'offline',
            mode: this.isOpenAIConfigured ? 'openai' : 'error',
            timestamp: new Date().toISOString()
        };
    }
    async processTextCommand(body) {
        console.log('📝 Text command received:', body.message);
        if (!this.isOpenAIConfigured) {
            return {
                message: "OpenAI is not configured. Please check the API key and restart the server.",
                conversationId: `error-${Date.now()}`,
                timestamp: new Date(),
                mode: 'error'
            };
        }
        try {
            if (!body || !body.message) {
                throw new common_1.BadRequestException('Message is required');
            }
            const conversationId = body.conversationId || `${body.userId || 'user'}-${Date.now()}`;
            const conversationHistory = this.conversations.get(conversationId) || [];
            conversationHistory.push({ role: 'user', content: body.message });
            const completion = await this.openai.chat.completions.create({
                model: 'gpt-3.5-turbo',
                messages: [
                    {
                        role: 'system',
                        content: 'You are Atom, a helpful personal AI assistant. You help with daily tasks, productivity, scheduling, reminders, information lookup, decision-making, planning, and general life assistance. Be friendly, conversational, and genuinely helpful.'
                    },
                    ...conversationHistory
                ],
                max_tokens: 500,
                temperature: 0.7,
            });
            const aiResponse = completion.choices[0]?.message?.content || 'Sorry, I could not generate a response.';
            conversationHistory.push({ role: 'assistant', content: aiResponse });
            this.conversations.set(conversationId, conversationHistory);
            console.log('✅ Text response generated');
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
                message: `Text processing failed: ${error.message}`,
                conversationId: `error-${Date.now()}`,
                timestamp: new Date(),
                mode: 'error'
            };
        }
    }
    async processVoiceCommand(file, body) {
        console.log('🎤 Voice command received:');
        console.log('   File exists:', !!file);
        console.log('   File size:', file?.size || 'unknown');
        console.log('   File type:', file?.mimetype || 'unknown');
        console.log('   File buffer length:', file?.buffer?.length || 'no buffer');
        console.log('   Body:', body);
        console.log('   OpenAI configured:', this.isOpenAIConfigured);
        if (!this.isOpenAIConfigured) {
            console.log('❌ OpenAI not configured for voice');
            return {
                message: "OpenAI is not configured for voice processing. Please check the API key.",
                transcription: '[Configuration Error]',
                conversationId: `voice-error-${Date.now()}`,
                timestamp: new Date(),
                mode: 'error'
            };
        }
        if (!file) {
            console.log('❌ No audio file received');
            return {
                message: "No audio file was received. Please make sure your microphone is working and try again.",
                transcription: '[No Audio File]',
                conversationId: `voice-error-${Date.now()}`,
                timestamp: new Date(),
                mode: 'error'
            };
        }
        try {
            console.log('🎤 Processing audio with Whisper...');
            console.log('   Buffer size:', file.buffer.length, 'bytes');
            const FormData = require('form-data');
            const form = new FormData();
            form.append('file', file.buffer, {
                filename: file.originalname || 'audio.wav',
                contentType: file.mimetype || 'audio/wav'
            });
            form.append('model', 'whisper-1');
            const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.configService.get('OPENAI_API_KEY')}`,
                    ...form.getHeaders()
                },
                body: form
            });
            if (!response.ok) {
                const errorText = await response.text();
                console.error('❌ Whisper API error:', response.status, errorText);
                throw new Error(`Whisper API error: ${response.status} ${errorText}`);
            }
            const transcriptionResult = await response.json();
            const transcribedText = transcriptionResult.text || 'Could not transcribe audio';
            console.log('✅ Whisper transcription:', transcribedText);
            const textResult = await this.processTextCommand({
                message: transcribedText,
                userId: body.userId || 'voice-user',
                conversationId: body.conversationId
            });
            return {
                message: textResult.message,
                transcription: transcribedText,
                conversationId: textResult.conversationId,
                timestamp: new Date(),
                mode: 'openai'
            };
        }
        catch (error) {
            console.error('❌ Voice processing error:', error);
            console.error('   Error details:', {
                message: error.message,
                stack: error.stack?.split('\n')[0]
            });
            return {
                message: `Voice processing failed: ${error.message}. Please try speaking clearly and check your microphone.`,
                transcription: '[Processing Error]',
                conversationId: `voice-error-${Date.now()}`,
                timestamp: new Date(),
                mode: 'error',
                errorDetails: error.message
            };
        }
    }
    async processTextCommandAlt(body) {
        return this.processTextCommand(body);
    }
    async processVoiceCommandAlt(file, body) {
        return this.processVoiceCommand(file, body);
    }
    async processText(body) {
        return this.processTextCommand(body);
    }
    async processVoice(file, body) {
        return this.processVoiceCommand(file, body);
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
], AppController.prototype, "processTextCommand", null);
__decorate([
    (0, common_1.Post)('ai/voice-command1'),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('audio')),
    __param(0, (0, common_1.UploadedFile)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "processVoiceCommand", null);
__decorate([
    (0, common_1.Post)('ai/text-command'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "processTextCommandAlt", null);
__decorate([
    (0, common_1.Post)('ai/voice-command'),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('audio')),
    __param(0, (0, common_1.UploadedFile)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "processVoiceCommandAlt", null);
__decorate([
    (0, common_1.Post)('ai/text'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "processText", null);
__decorate([
    (0, common_1.Post)('ai/voice'),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('audio')),
    __param(0, (0, common_1.UploadedFile)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "processVoice", null);
exports.AppController = AppController = __decorate([
    (0, common_1.Controller)(),
    __metadata("design:paramtypes", [app_service_1.AppService,
        config_1.ConfigService])
], AppController);
//# sourceMappingURL=app.controller.js.map