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
    getTest() {
        return {
            message: 'Test route is working!',
            timestamp: new Date().toISOString(),
        };
    }
    getAIHealth() {
        console.log('AI Health endpoint called!');
        return {
            status: 'ok',
            message: 'AI Health endpoint is working!',
            timestamp: new Date().toISOString()
        };
    }
    getAIStatus() {
        console.log('AI Status endpoint called!');
        return {
            status: 'available',
            message: 'AI Status endpoint is working!',
            timestamp: new Date().toISOString()
        };
    }
    postAITextCommand1(body) {
        console.log('AI Text Command1 endpoint called with:', body);
        const constructionResponses = [
            "Hello! I'm Atom, your AI construction assistant. I can help with project planning, material estimates, safety protocols, and construction management. What specific aspect of your project would you like assistance with?",
            "Great to hear from you! As your construction AI, I can provide guidance on building codes, project scheduling, cost estimation, and safety compliance. Tell me about your current construction challenge.",
            "Hi there! I'm here to help with your construction needs - whether it's structural planning, material selection, permit requirements, or project management. What construction topic can I assist you with today?",
            "Welcome! I specialize in construction assistance including foundation work, framing, electrical planning, plumbing layout, and project coordination. How can I help make your construction project successful?"
        ];
        const randomResponse = constructionResponses[Math.floor(Math.random() * constructionResponses.length)];
        return {
            message: randomResponse,
            conversationId: `text-${Date.now()}`,
            timestamp: new Date().toISOString(),
            mode: 'demo'
        };
    }
    postAIVoiceCommand1(body) {
        console.log('AI Voice Command1 endpoint called!');
        const voiceResponses = [
            "I received your voice message! While I'm in demo mode, I'm ready to help with construction planning, safety guidelines, and project management.",
            "Voice command processed! I can assist with building permits, material calculations, construction scheduling, and safety protocols.",
            "Got your audio! I'm here to help with construction challenges like structural design, cost estimation, and project coordination.",
            "Voice message received! Let me know how I can help with your construction project - planning, materials, safety, or technical guidance."
        ];
        const randomResponse = voiceResponses[Math.floor(Math.random() * voiceResponses.length)];
        return {
            message: randomResponse,
            transcription: '[Demo Mode] Hello Atom, can you help with my construction project?',
            conversationId: `voice-${Date.now()}`,
            timestamp: new Date().toISOString(),
            mode: 'demo'
        };
    }
    postAITextCommand(body) {
        return this.postAITextCommand1(body);
    }
    postAIVoiceCommand(body) {
        return this.postAIVoiceCommand1(body);
    }
    postAIText(body) {
        return this.postAITextCommand1(body);
    }
    postAIVoice(body) {
        return this.postAIVoiceCommand1(body);
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
    (0, common_1.Get)('test'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AppController.prototype, "getTest", null);
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
    __metadata("design:returntype", void 0)
], AppController.prototype, "postAITextCommand1", null);
__decorate([
    (0, common_1.Post)('ai/voice-command1'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AppController.prototype, "postAIVoiceCommand1", null);
__decorate([
    (0, common_1.Post)('ai/text-command'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AppController.prototype, "postAITextCommand", null);
__decorate([
    (0, common_1.Post)('ai/voice-command'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AppController.prototype, "postAIVoiceCommand", null);
__decorate([
    (0, common_1.Post)('ai/text'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AppController.prototype, "postAIText", null);
__decorate([
    (0, common_1.Post)('ai/voice'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AppController.prototype, "postAIVoice", null);
exports.AppController = AppController = __decorate([
    (0, common_1.Controller)(),
    __metadata("design:paramtypes", [app_service_1.AppService])
], AppController);
//# sourceMappingURL=app.controller.js.map