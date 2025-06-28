interface MulterFile {
    fieldname: string;
    originalname: string;
    encoding: string;
    mimetype: string;
    size: number;
    buffer: Buffer;
}
export declare class VoiceController {
    handleVoiceCommand(file: MulterFile): Promise<{
        status: string;
        result: any;
    }>;
}
export {};
