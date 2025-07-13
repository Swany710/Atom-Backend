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
const ai_voice_service_1 = require("./ai/ai-voice.service");
const platform_express_1 = require("@nestjs/platform-express");
const config_1 = require("@nestjs/config");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const chat_memory_entity_1 = require("./ai/chat-memory.entity");
let AppController = class AppController {
    constructor(configService, aiVoiceService, chatRepo) {
        this.configService = configService;
        this.aiVoiceService = aiVoiceService;
        this.chatRepo = chatRepo;
    }
    getHealth() {
        return {
            status: 'healthy',
            timestamp: new Date(),
            service: 'Atom Backend API',
        };
    }
    getStatus() {
        const apiKey = this.configService.get('OPENAI_API_KEY');
        const isConfigured = !!apiKey && apiKey.startsWith('sk-');
        return {
            status: isConfigured ? 'available' : 'configuration_error',
            aiService: isConfigured ? 'online' : 'offline',
            mode: isConfigured ? 'openai' : 'error',
            timestamp: new Date(),
        };
    }
    async processTextCommand1(body) {
        try {
            const sessionId = body.userId ?? `anon-${Date.now()}`;
            const aiResponse = await this.aiVoiceService.processPrompt(body.message, sessionId);
            return {
                message: aiResponse,
                conversationId: sessionId,
                timestamp: new Date(),
                mode: 'openai',
            };
        }
        catch (error) {
            console.error('❌ Text processing error:', error.message);
            return {
                message: `I'm experiencing technical difficulties: ${error.message}`,
                conversationId: `error-${Date.now()}`,
                timestamp: new Date(),
                mode: 'error',
                error: error.message,
            };
        }
    }
    async processVoiceCommand1(file, body) {
        try {
            if (!file || !file.buffer || file.size < 1000) {
                return {
                    message: "Audio recording is too short — please speak clearly for at least 1 second.",
                    transcription: '[Too Short]',
                    conversationId: `voice-error-${Date.now()}`,
                    timestamp: new Date(),
                    mode: 'error',
                };
            }
            const sessionId = body.userId ?? `anon-${Date.now()}`;
            const buffer = file.buffer;
            file.originalname = file.originalname || 'audio.mp3';
            file.mimetype = file.mimetype || 'audio/mpeg';
            const result = await this.aiVoiceService.processVoiceCommand(buffer, sessionId);
            return {
                message: 'Something',
                transcription: '...',
                conversationId: sessionId,
                timestamp: new Date(),
                mode: 'openai'
            };
        }
        catch (error) {
            console.error('❌ Voice processing error:', error.message || error);
            return {
                message: `Voice processing failed: ${error.message || 'Unknown error'}`,
                transcription: '[Whisper Error]',
                conversationId: `voice-error-${Date.now()}`,
                timestamp: new Date(),
                mode: 'error',
            };
        }
    }
    async getConversation(id) {
        const messages = await this.chatRepo.find({
            where: { sessionId: id },
            order: { createdAt: 'ASC' },
        });
        return {
            conversationId: id,
            messages,
            messageCount: messages.length,
            timestamp: new Date(),
        };
    }
    async clearConversation(id) {
        await this.chatRepo.delete({ sessionId: id });
        return { message: 'Conversation cleared', timestamp: new Date() };
    }
    async getAllConversations() {
        const results = await this.chatRepo
            .createQueryBuilder('chat')
            .select('chat.sessionId', 'id')
            .addSelect('COUNT(*)', 'messageCount')
            .addSelect('MAX(chat.createdAt)', 'lastTimestamp')
            .groupBy('chat.sessionId')
            .orderBy('lastTimestamp', 'DESC')
            .getRawMany();
        return {
            conversations: results.map((row) => ({
                id: row.id,
                messageCount: parseInt(row.messageCount, 10),
                lastMessage: row.lastTimestamp,
            })),
        };
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
    __metadata("design:returntype", Promise)
], AppController.prototype, "getConversation", null);
__decorate([
    (0, common_1.Delete)('ai/conversations/:id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "clearConversation", null);
__decorate([
    (0, common_1.Get)('ai/conversations'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AppController.prototype, "getAllConversations", null);
exports.AppController = AppController = __decorate([
    (0, common_1.Controller)('api/v1'),
    __param(2, (0, typeorm_1.InjectRepository)(chat_memory_entity_1.ChatMemory)),
    __metadata("design:paramtypes", [config_1.ConfigService,
        ai_voice_service_1.AIVoiceService,
        typeorm_2.Repository])
], AppController);
//# sourceMappingURL=app.controller.js.map