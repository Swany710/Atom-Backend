export declare class AppService {
    getHello(): string;
    getHealth(): {
        status: string;
        timestamp: string;
        uptime: number;
        memory: NodeJS.MemoryUsage;
        environment: string;
    };
    getVersion(): {
        version: string;
        name: string;
        description: string;
        author: string;
    };
}
