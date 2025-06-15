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
var VoiceTranscriptionService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.VoiceTranscriptionService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const openai_1 = require("openai");
const fs = require("fs");
const path = require("path");
let VoiceTranscriptionService = VoiceTranscriptionService_1 = class VoiceTranscriptionService {
    constructor(configService) {
        this.configService = configService;
        this.logger = new common_1.Logger(VoiceTranscriptionService_1.name);
        this.openai = new openai_1.default({
            apiKey: this.configService.get('OPENAI_API_KEY'),
        });
    }
    async transcribeAudio(buffer, format = 'mp3') {
        const tempFilePath = path.join(__dirname, `temp_audio_${Date.now()}.${format}`);
        fs.writeFileSync(tempFilePath, buffer);
        try {
            const transcription = await this.openai.audio.transcriptions.create({
                file: fs.createReadStream(tempFilePath),
                model: 'whisper-1',
                response_format: 'json',
                language: 'en',
            });
            return transcription.text;
        }
        catch (error) {
            this.logger.error('Transcription failed', error);
            throw error;
        }
        finally {
            fs.unlinkSync(tempFilePath);
        }
    }
};
exports.VoiceTranscriptionService = VoiceTranscriptionService;
exports.VoiceTranscriptionService = VoiceTranscriptionService = VoiceTranscriptionService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], VoiceTranscriptionService);
//# sourceMappingURL=voice-transcription.service.js.map