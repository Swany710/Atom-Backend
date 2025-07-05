interface MulterFile {
    fieldname: string;
    originalname: string;
    encoding: string;
    mimetype: string;
    size: number;
    buffer: Buffer;
}
export declare class N8NVoiceController {
    forwardToN8N(file: MulterFile): Promise<{
        status: string;
        result: unknown;
    }>;
}
export {};
