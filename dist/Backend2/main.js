"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const app_module_1 = require("./app.module");
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule);
    app.enableCors({
        origin: 'http://localhost:3001',
        credentials: true,
    });
    app.setGlobalPrefix('api/v1');
    const port = 3000;
    await app.listen(port);
    console.log(`🚀 Voice Backend running on: http://localhost:${port}`);
}
bootstrap();
//# sourceMappingURL=main.js.map