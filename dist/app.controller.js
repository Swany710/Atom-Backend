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
const ai_voice_service_1 = require("./ai/ai-voice.service");
const platform_express_1 = require("@nestjs/platform-express");
const config_1 = require("@nestjs/config");
const form_data_1 = __importDefault(require("form-data"));
const axios_1 = __importDefault(require("axios"));
let AppController = class AppController {
    constructor(configService, aiVoiceService) {
        this.configService = configService;
        this.aiVoiceService = aiVoiceService;
        this.conversations = new Map();
    }
    getHealth() {
        return {
            status: 'healthy',
            timestamp: new Date(),
            service: 'Atom Backend API'
        };
    }
    getStatus() {
        const apiKey = this.configService.get('OPENAI_API_KEY');
        const isConfigured = !!apiKey && apiKey.startsWith('sk-');
        return {
            status: isConfigured ? 'available' : 'configuration_error',
            aiService: isConfigured ? 'online' : 'offline',
            mode: isConfigured ? 'openai' : 'error',
            timestamp: new Date()
        };
    }
    async processTextCommand1(body) {
        console.log('📝 Text command received:', body.message?.substring(0, 50));
        try {
            if (!body || !body.message) {
                return {
                    message: "Please provide a message to process.",
                    conversationId: `error-${Date.now()}`,
                    timestamp: new Date(),
                    mode: 'error'
                };
            }
            const apiKey = this.configService.get('OPENAI_API_KEY');
            if (!apiKey || !apiKey.startsWith('sk-')) {
                return {
                    message: "I need an OpenAI API key to process your request.",
                    conversationId: `error-${Date.now()}`,
                    timestamp: new Date(),
                    mode: 'error'
                };
            }
            console.log('🤖 Processing with GPT...');
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
                            content: 'You are Atom, a helpful personal AI assistant. Be friendly, conversational, and genuinely helpful. Keep responses concise but informative.'
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
                        message: "I'm having authentication issues with OpenAI. Please check the API key.",
                        conversationId: `error-${Date.now()}`,
                        timestamp: new Date(),
                        mode: 'error'
                    };
                }
                throw new Error(`OpenAI API error: ${response.status}`);
            }
            const data = await response.json();
            const aiResponse = data.choices[0]?.message?.content || 'Sorry, I could not generate a response.';
            console.log('✅ Text processing complete');
            const conversationId = body.conversationId || `text-${Date.now()}`;
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
                message: `I'm experiencing technical difficulties: ${error.message}`,
                conversationId: `error-${Date.now()}`,
                timestamp: new Date(),
                mode: 'error',
                error: error.message
            };
        }
    }
    async processVoiceCommand1(file, body) {
        console.log('🎤 Voice command received');
        console.log('   File exists:', !!file);
        console.log('   File size:', file?.size || 'no file');
        console.log('   File type:', file?.mimetype || 'no type');
        try {
            if (!file || !file.buffer || file.size === 0) {
                console.log('❌ No audio file received');
                return {
                    message: "I didn't receive any audio file. Please check your microphone permissions and try recording again.",
                    transcription: '[No Audio File]',
                    conversationId: `voice-error-${Date.now()}`,
                    timestamp: new Date(),
                    mode: 'error'
                };
            }
            const apiKey = this.configService.get('OPENAI_API_KEY');
            if (!apiKey || !apiKey.startsWith('sk-')) {
                console.log('❌ OpenAI API key not configured');
                return {
                    message: "I can hear you, but I need an OpenAI API key to process voice commands.",
                    transcription: '[API Key Missing]',
                    conversationId: `voice-error-${Date.now()}`,
                    timestamp: new Date(),
                    mode: 'error'
                };
            }
            let originalName = file.originalname || 'audio.mp3';
            let mimetype = file.mimetype || 'audio/mp3';
            let extension = '.mp3';
            if (originalName.endsWith('.webm')) {
                extension = '.webm';
                mimetype = 'audio/webm';
            }
            else if (originalName.endsWith('.wav')) {
                extension = '.wav';
                mimetype = 'audio/wav';
            }
            else if (!originalName.endsWith('.mp3')) {
                originalName = 'audio.mp3';
            }
            console.log('🎤 Processing audio with Whisper API (using Node form-data).');
            let transcribedText = '';
            try {
                const form = new form_data_1.default();
                form.append('file', file.buffer, {
                    filename: originalName,
                    contentType: mimetype,
                    knownLength: file.size
                });
                form.append('model', 'whisper-1');
                form.append('response_format', 'json');
                form.append('language', 'en');
                const whisperResponse = await axios_1.default.post('https://api.openai.com/v1/audio/transcriptions', form, {
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                        ...form.getHeaders()
                    },
                });
                const transcriptionData = whisperResponse.data;
                transcribedText = transcriptionData.text?.trim() || '';
                console.log('✅ Transcription successful:', transcribedText.substring(0, 50) + '.');
                let aiMessage = '';
                try {
                    aiMessage = await this.aiVoiceService.processPrompt(transcribedText);
                }
                catch (err) {
                    console.error('AI chat failed:', err);
                    aiMessage = "Sorry, there was an error generating my response.";
                }
                return {
                    message: aiMessage,
                    transcription: transcribedText,
                    mode: 'openai',
                    timestamp: new Date()
                };
            }
            catch (transcriptionError) {
                console.error('❌ Transcription failed:', transcriptionError.response?.data || transcriptionError.message);
                return {
                    message: `Voice processing failed: ${transcriptionError.message}`,
                    transcription: '[Whisper API Error]',
                    conversationId: `voice-error-${Date.now()}`,
                    timestamp: new Date(),
                    mode: 'error'
                };
            }
            if (!transcribedText || transcribedText.length < 1) {
                console.log('❌ Empty transcription result');
                return {
                    message: "I couldn't understand what you said. Please try speaking more clearly.",
                    transcription: '[Empty Transcription]',
                    conversationId: `voice-error-${Date.now()}`,
                    timestamp: new Date(),
                    mode: 'error'
                };
            }
            return {
                message: 'Transcription completed successfully.',
                transcription: transcribedText,
                mode: 'openai',
                timestamp: new Date()
            };
        }
        catch (error) {
            console.error('❌ Voice processing error:', error.message);
            return {
                message: `Voice processing failed: ${error.message}`,
                transcription: '[Processing Error]',
                conversationId: `voice-error-${Date.now()}`,
                timestamp: new Date(),
                mode: 'error',
                error: error.message
            };
        }
    }
    getConversation(id) {
        const conversation = this.conversations.get(id) || [];
        return {
            conversationId: id,
            messages: conversation,
            messageCount: conversation.length,
            timestamp: new Date()
        };
    }
    clearConversation(id) {
        this.conversations.delete(id);
        return { message: 'Conversation cleared', timestamp: new Date() };
    }
    getAllConversations() {
        const conversations = Array.from(this.conversations.entries()).map(([id, messages]) => ({
            id,
            messageCount: messages.length,
            lastMessage: messages[messages.length - 1]?.timestamp || null
        }));
        return { conversations };
    }
};
exports.AppController = AppController;
__decorate([
    (0, common_1.Get)('ai/health'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AppController.prototype, "getHealth", null);
__decorate([
    (0, common_1.Get)('ai/status'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AppController.prototype, "getStatus", null);
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
    (0, common_1.Get)('ai/conversations/:id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], AppController.prototype, "getConversation", null);
__decorate([
    (0, common_1.Delete)('ai/conversations/:id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], AppController.prototype, "clearConversation", null);
__decorate([
    (0, common_1.Get)('ai/conversations'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AppController.prototype, "getAllConversations", null);
exports.AppController = AppController = __decorate([
    (0, common_1.Controller)('api/v1'),
    __metadata("design:paramtypes", [config_1.ConfigService,
        ai_voice_service_1.AIVoiceService])
], AppController);
//# sourceMappingURL=app.controller.js.map