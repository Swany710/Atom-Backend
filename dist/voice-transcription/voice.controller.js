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
exports.VoiceController = void 0;
const common_1 = require("@nestjs/common");
const platform_express_1 = require("@nestjs/platform-express");
const voice_transcription_service_1 = require("./voice-transcription.service");
const axios = require("axios");
let VoiceController = class VoiceController {
    constructor(transcriptionService) {
        this.transcriptionService = transcriptionService;
    }
    async transcribe(file) {
        if (!file) {
            throw new common_1.HttpException('No file uploaded', common_1.HttpStatus.BAD_REQUEST);
        }
        const transcription = await this.transcriptionService.transcribeAudio(file.buffer, 'mp3');
        try {
            await axios.post('https://your-n8n-domain/webhook/voice', {
                text: transcription,
                timestamp: new Date().toISOString(),
            });
        }
        catch (error) {
            console.error('Failed to trigger N8N webhook:', error.message);
        }
        return { transcription };
    }
};
exports.VoiceController = VoiceController;
__decorate([
    (0, common_1.Post)('transcribe'),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('file')),
    __param(0, (0, common_1.UploadedFile)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], VoiceController.prototype, "transcribe", null);
exports.VoiceController = VoiceController = __decorate([
    (0, common_1.Controller)('voice'),
    __metadata("design:paramtypes", [voice_transcription_service_1.VoiceTranscriptionService])
], VoiceController);
//# sourceMappingURL=voice.controller.js.map