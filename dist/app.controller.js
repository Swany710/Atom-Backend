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
            console.log('🔍 OpenAI Initialization Debug:');
            console.log('   API Key exists:', !!apiKey);
            console.log('   API Key length:', apiKey?.length || 0);
            console.log('   API Key starts with sk-:', apiKey?.startsWith('sk-') || false);
            console.log('   API Key preview:', apiKey ? `${apiKey.substring(0, 20)}...${apiKey.slice(-8)}` : 'NOT FOUND');
            if (!apiKey) {
                console.error('❌ OPENAI_API_KEY not found in environment!');
                console.error('   Check your .env file and make sure OPENAI_API_KEY is set');
                this.isOpenAIConfigured = false;
                return;
            }
            this.openai = new openai_1.default({
                apiKey: apiKey,
            });
            console.log('🧪 Testing OpenAI API key...');
            const testCompletion = await this.openai.chat.completions.create({
                model: 'gpt-3.5-turbo',
                messages: [{ role: 'user', content: 'Hello' }],
                max_tokens: 5,
            });
            console.log('✅ OpenAI API test successful!');
            console.log('   Test response:', testCompletion.choices[0]?.message?.content);
            this.isOpenAIConfigured = true;
        }
        catch (error) {
            console.error('❌ OpenAI initialization failed:');
            console.error('   Error type:', error.constructor.name);
            console.error('   Error status:', error.status || 'No status');
            console.error('   Error message:', error.message);
            console.error('   Error details:', error);
            this.isOpenAIConfigured = false;
            if (error.status === 401) {
                console.error('🔧 Fix: Invalid API key (401 Unauthorized)');
                console.error('   - Your OpenAI API key is invalid or expired');
                console.error('   - Generate a new API key at https://platform.openai.com/api-keys');
            }
            else if (error.status === 429) {
                console.error('🔧 Fix: Rate limit or quota exceeded (429)');
                console.error('   - Check your OpenAI usage at https://platform.openai.com/usage');
                console.error('   - Add payment method if you\'re on free tier');
            }
            else if (error.status === 403) {
                console.error('🔧 Fix: API access forbidden (403)');
                console.error('   - Your API key might not have the required permissions');
            }
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
            service: 'Personal AI Assistant with OpenAI',
            openaiConfigured: this.isOpenAIConfigured,
            timestamp: new Date().toISOString()
        };
    }
    getAIStatus() {
        return {
            status: this.isOpenAIConfigured ? 'available' : 'configuration_error',
            aiService: this.isOpenAIConfigured ? 'online' : 'offline',
            mode: this.isOpenAIConfigured ? 'openai' : 'error',
            openaiConfigured: this.isOpenAIConfigured,
            timestamp: new Date().toISOString()
        };
    }
    async processTextCommand(body) {
        console.log('📝 Text command received:', {
            message: body.message,
            userId: body.userId,
            openaiConfigured: this.isOpenAIConfigured
        });
        if (!this.isOpenAIConfigured) {
            console.log('⚠️ OpenAI not configured, returning error response');
            return {
                message: "OpenAI is not properly configured. Please check your API key and try again. I'm designed to be your personal AI assistant once the connection is established.",
                conversationId: `config-error-${Date.now()}`,
                timestamp: new Date(),
                mode: 'configuration_error',
                openaiConfigured: false
            };
        }
        try {
            if (!body || !body.message) {
                throw new common_1.BadRequestException('Message is required');
            }
            console.log('🤖 Processing text with OpenAI:', body.message);
            const conversationId = body.conversationId || `${body.userId || 'user'}-${Date.now()}`;
            const conversationHistory = this.conversations.get(conversationId) || [];
            conversationHistory.push({ role: 'user', content: body.message });
            const completion = await this.openai.chat.completions.create({
                model: 'gpt-3.5-turbo',
                messages: [
                    {
                        role: 'system',
                        content: 'You are Atom, a helpful personal AI assistant. You help with daily tasks, productivity, scheduling, reminders, information lookup, decision-making, planning, and general life assistance. Be friendly, conversational, and genuinely helpful. Provide practical advice and support for whatever the user needs help with in their personal or professional life.'
                    },
                    ...conversationHistory
                ],
                max_tokens: 500,
                temperature: 0.7,
            });
            const aiResponse = completion.choices[0]?.message?.content || 'I apologize, but I could not generate a response.';
            conversationHistory.push({ role: 'assistant', content: aiResponse });
            this.conversations.set(conversationId, conversationHistory);
            console.log('✅ OpenAI response generated successfully');
            return {
                message: aiResponse,
                conversationId: conversationId,
                timestamp: new Date(),
                mode: 'openai',
                openaiConfigured: true
            };
        }
        catch (error) {
            console.error('❌ OpenAI text processing error:', error);
            console.error('   Error details:', {
                status: error.status,
                message: error.message,
                code: error.code
            });
            return {
                message: `I'm experiencing technical difficulties with OpenAI: ${error.message}. Please check the API configuration and try again.`,
                conversationId: `error-${Date.now()}`,
                timestamp: new Date(),
                mode: 'api_error',
                openaiConfigured: this.isOpenAIConfigured,
                error: {
                    status: error.status,
                    message: error.message
                }
            };
        }
    }
    async processVoiceCommand(file, body) {
        console.log('🎤 Voice command received:', {
            hasFile: !!file,
            userId: body?.userId,
            openaiConfigured: this.isOpenAIConfigured
        });
        if (!this.isOpenAIConfigured) {
            return {
                message: "OpenAI is not properly configured for voice processing. Please check your API key configuration.",
                transcription: '[Configuration Error]',
                conversationId: `voice-config-error-${Date.now()}`,
                timestamp: new Date(),
                mode: 'configuration_error',
                openaiConfigured: false
            };
        }
        try {
            if (!file) {
                throw new common_1.BadRequestException('Audio file is required');
            }
            console.log('🎤 Processing voice with OpenAI Whisper');
            const audioFile = new File([file.buffer], 'audio.wav', { type: 'audio/wav' });
            const transcription = await this.openai.audio.transcriptions.create({
                file: audioFile,
                model: 'whisper-1',
            });
            const transcribedText = transcription.text || 'Could not transcribe audio';
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
                mode: 'openai',
                openaiConfigured: true
            };
        }
        catch (error) {
            console.error('❌ OpenAI voice processing error:', error);
            return {
                message: `Voice processing failed: ${error.message}. Please check the OpenAI API configuration.`,
                transcription: '[Error processing audio]',
                conversationId: `voice-error-${Date.now()}`,
                timestamp: new Date(),
                mode: 'api_error',
                openaiConfigured: this.isOpenAIConfigured,
                error: {
                    status: error.status,
                    message: error.message
                }
            };
        }
    }
    async processTextCommandAlt(body) {
        return this.processTextCommand(body);
    }
    async processVoiceCommandAlt(file, body) {
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
exports.AppController = AppController = __decorate([
    (0, common_1.Controller)(),
    __metadata("design:paramtypes", [app_service_1.AppService,
        config_1.ConfigService])
], AppController);
//# sourceMappingURL=app.controller.js.map