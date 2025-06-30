"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const app_module_1 = require("./app.module");
async function bootstrap() {
    try {
        console.log('🚀 Starting Atom Backend...');
        const app = await core_1.NestFactory.create(app_module_1.AppModule);
        app.enableCors({
            origin: [
                'http://localhost:3000',
                'https://atom-frontend-production-u.railway.app',
                'https://atom-frontend-production-up.railway.app',
                /https:\/\/.*\.railway\.app$/,
                /https:\/\/.*\.up\.railway\.app$/
            ],
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'Authorization'],
            credentials: true
        });
        app.setGlobalPrefix('api/v1', {
            exclude: ['/', '/health']
        });
        const port = process.env.PORT || 3000;
        await app.listen(port);
        console.log('✅ Atom Backend running on port', port);
        console.log('✅ Ready for frontend connections');
    }
    catch (error) {
        console.error('❌ Failed to start application:', error);
        process.exit(1);
    }
}
process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});
process.on('SIGTERM', () => {
    console.log('📦 SIGTERM received, shutting down gracefully');
    process.exit(0);
});
process.on('SIGINT', () => {
    console.log('📦 SIGINT received, shutting down gracefully');
    process.exit(0);
});
bootstrap();
//# sourceMappingURL=main.js.map