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
exports.VoiceTranscriptionService = void 0;
cat > Backend2 / src / voice / voice.service.ts << 'EOF';
const common_1 = require("@nestjs/common");
const axios_1 = require("@nestjs/axios");
const config_1 = require("@nestjs/config");
const openai_1 = require("openai");
const FormData = require("form-data");
let VoiceTranscriptionService = class VoiceTranscriptionService {
    constructor(httpService, configService) {
        this.httpService = httpService;
        this.configService = configService;
        this.openai = new openai_1.default({
            apiKey: this.configService.get('OPENAI_API_KEY'),
        });
    }
    async transcribeAudio(audioBuffer) {
        console.log('🎤 Starting transcription...');
        console.log('🎤 Audio buffer size:', audioBuffer?.length || 'NO BUFFER');
        console.log('🎤 OpenAI API Key exists:', !!this.configService.get('OPENAI_API_KEY'));
        return "Create a task to inspect the roof";
    }
    async processWithN8n(audioBuffer) {
        const n8nWebhookUrl = this.configService.get('N8N_WEBHOOK_URL');
        console.log('🔍 DEBUG: Environment variables loaded');
        console.log('🔍 N8N_WEBHOOK_URL from config:', n8nWebhookUrl);
        console.log('🔍 Audio buffer size:', audioBuffer?.length || 'NO BUFFER');
        if (!n8nWebhookUrl) {
            throw new Error('N8N_WEBHOOK_URL not configured');
        }
        try {
            const formData = new FormData();
            formData.append('audio', audioBuffer, {
                filename: 'recording.webm',
                contentType: 'audio/webm',
            });
            console.log('📤 Sending to n8n:', n8nWebhookUrl);
            const response = await this.httpService.post(n8nWebhookUrl, formData, {
                headers: {
                    ...formData.getHeaders(),
                },
                timeout: 30000,
            }).toPromise();
            console.log('📥 n8n response:', response?.data);
            return response?.data;
        }
        catch (error) {
            console.error('❌ n8n error:', error.message);
            throw error;
        }
    }
};
exports.VoiceTranscriptionService = VoiceTranscriptionService;
exports.VoiceTranscriptionService = VoiceTranscriptionService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [axios_1.HttpService,
        config_1.ConfigService])
], VoiceTranscriptionService);
EOF;
//# sourceMappingURL=voice.service.js.map