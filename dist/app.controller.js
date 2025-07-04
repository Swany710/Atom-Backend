"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
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
const config_1 = require("@nestjs/config");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
let AppController = class AppController {
    constructor(configService) {
        this.configService = configService;
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
    async processTextCommand(body) {
        console.log('📝 Text command received:', body.message?.substring(0, 50));
        try {
            const apiKey = this.configService.get('OPENAI_API_KEY');
            if (!apiKey || !apiKey.startsWith('sk-')) {
                return {
                    message: "I need an OpenAI API key to process your request.",
                    conversationId: `error-${Date.now()}`,
                    timestamp: new Date(),
                    mode: 'error'
                };
            }
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
            console.log('✅ GPT Response generated');
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
                message: `I'm experiencing technical difficulties: ${error.message}`,
                conversationId: `error-${Date.now()}`,
                timestamp: new Date(),
                mode: 'error',
                error: error.message
            };
        }
    }
    async processVoiceCommand1(file, body) {
        console.log('🎤 Voice request received');
        console.log('   File exists:', !!file);
        console.log('   File size:', file?.size || 'no file');
        console.log('   File type:', file?.mimetype || 'no type');
        try {
            if (!file || !file.buffer || file.size === 0) {
                console.log('❌ No valid audio file received');
                return {
                    message: "I didn't receive any audio. Please check your microphone permissions and try again.",
                    transcription: '[No Audio]',
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
            console.log('🎤 Processing audio with Whisper API...');
            console.log('   Audio size:', file.size, 'bytes');
            let transcribedText = '';
            try {
                const tempDir = os.tmpdir();
                const tempFilePath = path.join(tempDir, `audio_${Date.now()}.webm`);
                console.log('   Saving temporary file:', tempFilePath);
                fs.writeFileSync(tempFilePath, file.buffer);
                const FormData = require('form-data');
                const form = new FormData();
                form.append('file', fs.createReadStream(tempFilePath), {
                    filename: 'audio.webm',
                    contentType: 'audio/webm'
                });
                form.append('model', 'whisper-1');
                console.log('   Sending to Whisper API...');
                const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                        ...form.getHeaders()
                    },
                    body: form
                });
                console.log('   Whisper response status:', response.status);
                if (!response.ok) {
                    const errorText = await response.text();
                    console.error('❌ Whisper API error:', errorText);
                    throw new Error(`Whisper API failed: ${response.status} - ${errorText}`);
                }
                const transcriptionData = await response.json();
                transcribedText = transcriptionData.text?.trim() || '';
                console.log('✅ Transcription successful:', transcribedText.substring(0, 50));
                try {
                    fs.unlinkSync(tempFilePath);
                }
                catch (cleanupError) {
                    console.warn('Could not clean up temp file:', cleanupError.message);
                }
            }
            catch (transcriptionError) {
                console.error('❌ Transcription failed:', transcriptionError.message);
                return {
                    message: `I had trouble understanding your voice: ${transcriptionError.message}`,
                    transcription: '[Transcription Failed]',
                    conversationId: `voice-error-${Date.now()}`,
                    timestamp: new Date(),
                    mode: 'error'
                };
            }
            if (!transcribedText || transcribedText.length < 2) {
                console.log('❌ Empty or very short transcription:', transcribedText);
                return {
                    message: "I couldn't understand what you said. Please try speaking more clearly or check your microphone.",
                    transcription: '[Transcription Too Short]',
                    conversationId: `voice-error-${Date.now()}`,
                    timestamp: new Date(),
                    mode: 'error'
                };
            }
            console.log('🤖 Processing transcribed text with GPT...');
            console.log('   Transcribed text:', transcribedText);
            const chatResponse = await fetch('https://api.openai.com/v1/chat/completions', {
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
                            content: transcribedText
                        }
                    ],
                    max_tokens: 500,
                    temperature: 0.7,
                })
            });
            if (!chatResponse.ok) {
                console.error('❌ GPT API Error:', chatResponse.status);
                throw new Error(`GPT API error: ${chatResponse.status}`);
            }
            const chatData = await chatResponse.json();
            const aiResponse = chatData.choices[0]?.message?.content || 'Sorry, I could not generate a response.';
            console.log('✅ Voice processing complete');
            const conversationId = body.conversationId || `voice-${Date.now()}`;
            const conversation = this.conversations.get(conversationId) || [];
            conversation.push({ role: 'user', content: transcribedText, timestamp: new Date() }, { role: 'assistant', content: aiResponse, timestamp: new Date() });
            this.conversations.set(conversationId, conversation);
            return {
                message: aiResponse,
                transcription: transcribedText,
                conversationId: conversationId,
                timestamp: new Date(),
                mode: 'openai'
            };
        }
        catch (error) {
            console.error('❌ Voice processing error:', error.message);
            return {
                message: `I had trouble processing your voice command: ${error.message}`,
                transcription: '[Processing Error]',
                conversationId: `voice-error-${Date.now()}`,
                timestamp: new Date(),
                mode: 'error',
                error: error.message
            };
        }
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
    (0, common_1.Post)('ai/text-command'),
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
], AppController.prototype, "processVoiceCommand1", null);
exports.AppController = AppController = __decorate([
    (0, common_1.Controller)('api/v1'),
    __metadata("design:paramtypes", [config_1.ConfigService])
], AppController);
//# sourceMappingURL=app.controller.js.map