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
const app_service_1 = require("./app.service");
let AppController = class AppController {
    constructor(appService) {
        this.appService = appService;
        this.conversations = new Map();
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
            service: 'AI Voice Service',
            timestamp: new Date().toISOString(),
            version: '1.0.0'
        };
    }
    getAIStatus() {
        return {
            status: 'available',
            aiService: 'mock',
            mode: 'mock',
            timestamp: new Date().toISOString()
        };
    }
    async handleTextCommand(body) {
        try {
            if (!body || !body.message) {
                return {
                    message: "Please provide a message in your request.",
                    conversationId: `error-${Date.now()}`,
                    timestamp: new Date(),
                    mode: 'error',
                };
            }
            const mockResponses = [
                "Hello! I'm Atom, your AI construction assistant. I'm currently running in demonstration mode. How can I help with your construction project?",
                "I understand you're asking about construction. I'm here to help with project planning, material estimates, safety guidelines, and more!",
                "As your construction AI assistant, I can help with planning, scheduling, cost estimation, and technical questions. What would you like to know?",
                "Great question! While I'm in demo mode, I'm designed to help with all aspects of construction management. Tell me more about your project!",
            ];
            const currentConversationId = body.conversationId || `${body.userId || 'user'}-${Date.now()}`;
            const randomResponse = mockResponses[Math.floor(Math.random() * mockResponses.length)];
            const conversationHistory = this.conversations.get(currentConversationId) || [];
            conversationHistory.push({ role: 'user', content: body.message }, { role: 'assistant', content: randomResponse });
            this.conversations.set(currentConversationId, conversationHistory);
            return {
                message: randomResponse,
                conversationId: currentConversationId,
                timestamp: new Date(),
                mode: 'mock',
            };
        }
        catch (error) {
            console.error('Text command error:', error);
            return {
                message: "I'm having technical difficulties right now, but I'm your AI construction assistant Atom. Please try again in a moment!",
                conversationId: `error-${Date.now()}`,
                timestamp: new Date(),
                mode: 'error',
            };
        }
    }
    async handleVoiceCommand(body) {
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
        }
        catch (error) {
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
    getUserConversations() {
        return {
            conversations: Array.from(this.conversations.keys()),
            count: this.conversations.size,
            mode: 'mock'
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
    (0, common_1.Get)('api/v1/ai/health'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AppController.prototype, "getAIHealth", null);
__decorate([
    (0, common_1.Get)('api/v1/ai/status'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AppController.prototype, "getAIStatus", null);
__decorate([
    (0, common_1.Post)('api/v1/ai/text'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "handleTextCommand", null);
__decorate([
    (0, common_1.Post)('api/v1/ai/voice'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "handleVoiceCommand", null);
__decorate([
    (0, common_1.Get)('api/v1/ai/conversations/:userId'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AppController.prototype, "getUserConversations", null);
exports.AppController = AppController = __decorate([
    (0, common_1.Controller)(),
    __metadata("design:paramtypes", [app_service_1.AppService])
], AppController);
//# sourceMappingURL=app.controller.js.map