export declare class VoiceController {
    handleVoiceCommand(file: Express.Multer.File): Promise<{
        status: string;
    }>;
}
