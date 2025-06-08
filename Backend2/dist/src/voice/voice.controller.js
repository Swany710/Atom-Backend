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
cat > Backend2 / src / voice / voice.controller.ts << 'EOF';
const common_1 = require("@nestjs/common");
const platform_express_1 = require("@nestjs/platform-express");
const voice_service_1 = require("./voice.service");
let VoiceController = class VoiceController {
    constructor(voiceService) {
        this.voiceService = voiceService;
    }
    async processVoiceCommand(file) {
        console.log('🎯 Voice command received');
        console.log('🎯 File size:', file?.size || 'NO FILE');
        if (!file || !file.buffer) {
            return { error: 'No audio file received' };
        }
        try {
            const transcription = await this.voiceService.transcribeAudio(file.buffer);
            console.log('🎯 Transcription result:', transcription);
            const n8nResult = await this.voiceService.processWithN8n(file.buffer);
            console.log('🎯 n8n result:', n8nResult);
            return {
                transcription,
                n8nResult,
                timestamp: new Date(),
            };
        }
        catch (error) {
            console.error('🎯 Processing error:', error);
            return {
                transcription: 'Could not transcribe audio',
                error: error.message,
                timestamp: new Date(),
            };
        }
    }
};
exports.VoiceController = VoiceController;
__decorate([
    (0, common_1.Post)('process'),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('audio')),
    __param(0, (0, common_1.UploadedFile)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], VoiceController.prototype, "processVoiceCommand", null);
exports.VoiceController = VoiceController = __decorate([
    (0, common_1.Controller)('voice'),
    __metadata("design:paramtypes", [voice_service_1.VoiceTranscriptionService])
], VoiceController);
EOF;
//# sourceMappingURL=voice.controller.js.map