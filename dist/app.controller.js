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
const config_1 = require("@nestjs/config");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const ai_voice_service_1 = require("./ai/ai-voice.service");
const chat_memory_entity_1 = require("./ai/chat-memory.entity");
let AppController = class AppController {
    constructor(config, aiVoiceService, chatRepo) {
        this.config = config;
        this.aiVoiceService = aiVoiceService;
        this.chatRepo = chatRepo;
    }
    getHealth() {
        return {
            status: 'healthy',
            service: 'Atom Backend API',
            timestamp: new Date(),
        };
    }
    getStatus() {
        const ok = !!this.config.get('OPENAI_API_KEY');
        return {
            status: ok ? 'available' : 'configuration_error',
            aiService: ok ? 'online' : 'offline',
            timestamp: new Date(),
        };
    }
    async handleText(body) {
        const sessionId = body.conversationId ?? body.userId ?? 'default-user';
        const reply = await this.aiVoiceService.processPrompt(body.message, sessionId);
        return {
            message: reply,
            conversationId: sessionId,
            timestamp: new Date(),
            mode: 'openai',
        };
    }
    async handleVoice(file, body) {
        if (!file?.buffer || file.size < 1_000) {
            return {
                message: 'Audio recording is too short — please speak for at least one second.',
                transcription: '[Too Short]',
                conversationId: body.conversationId ?? body.userId ?? 'voice-error',
                timestamp: new Date(),
                mode: 'error',
            };
        }
        const userId = body.userId ?? 'default-user';
        const convoId = body.conversationId ?? userId;
        const result = await this.aiVoiceService.processVoiceCommand(file.buffer, userId, convoId);
        return {
            message: result.response,
            transcription: result.transcription,
            conversationId: result.conversationId,
            timestamp: new Date(),
            mode: 'openai',
        };
    }
    async getConversation(id) {
        const messages = await this.chatRepo.find({
            where: { sessionId: id },
            order: { createdAt: 'ASC' },
        });
        return { conversationId: id, messages, messageCount: messages.length };
    }
    async clearConversation(id) {
        await this.chatRepo.delete({ sessionId: id });
        return { message: 'Conversation cleared', conversationId: id };
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
], AppController.prototype, "handleText", null);
__decorate([
    (0, common_1.Post)('ai/voice-command1'),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('audio')),
    __param(0, (0, common_1.UploadedFile)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "handleVoice", null);
__decorate([
    (0, common_1.Get)('ai/conversations/:id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "getConversation", null);
__decorate([
    (0, common_1.Delete)('ai/conversations/:id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "clearConversation", null);
exports.AppController = AppController = __decorate([
    (0, common_1.Controller)('api/v1'),
    __param(2, (0, typeorm_1.InjectRepository)(chat_memory_entity_1.ChatMemory)),
    __metadata("design:paramtypes", [config_1.ConfigService,
        ai_voice_service_1.AIVoiceService,
        typeorm_2.Repository])
], AppController);
//# sourceMappingURL=app.controller.js.map