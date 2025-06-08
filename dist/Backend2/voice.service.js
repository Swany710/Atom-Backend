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
Object.defineProperty(exports, "__esModule", { value: true });
exports.VoiceService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const FormData = require("form-data");
const axios_1 = require("axios");
let VoiceService = class VoiceService {
    constructor(configService) {
        this.configService = configService;
    }
    async processWithN8n(audioBuffer) {
        const n8nWebhookUrl = this.configService.get('N8N_WEBHOOK_URL', 'http://localhost:5678/webhook/voice-command');
        try {
            const formData = new FormData();
            formData.append('audio', audioBuffer, {
                filename: 'voice-command.webm',
                contentType: 'audio/webm',
            });
            const response = await axios_1.default.post(n8nWebhookUrl, formData, {
                headers: {
                    ...formData.getHeaders(),
                },
                timeout: 30000,
            });
            return response.data;
        }
        catch (error) {
            console.error('n8n request failed:', error);
            throw new Error('Failed to process with n8n workflow');
        }
    }
};
exports.VoiceService = VoiceService;
exports.VoiceService = VoiceService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], VoiceService);
//# sourceMappingURL=voice.service.js.map