import { AppService } from './app.service';
export declare class AppController {
    private readonly appService;
    constructor(appService: AppService);
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
