"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
artifacts: function_calls
    < invoke;
name = "artifacts" >
    name;
"command" > create < /parameter>
    < parameter;
name = "type" > application / vnd.ant.code < /parameter>
    < parameter;
name = "language" > typescript < /parameter>
    < parameter;
name = "title" > Main;
Application;
Entry;
Point < /parameter>
    < parameter;
name = "id" > main - ts < /parameter>
    < parameter;
name = "content" > ;
const core_1 = require("@nestjs/core");
const app_module_1 = require("./app.module");
const common_1 = require("@nestjs/common");
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule);
    app.enableCors({
        origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
        credentials: true,
    });
    app.useGlobalPipes(new common_1.ValidationPipe());
    app.setGlobalPrefix('api/v1');
    const port = process.env.PORT || 3001;
    await app.listen(port);
    console.log(Construction, Assistant, Backend, running, on, http, console.log(API, Documentation, http));
}
bootstrap();
/parameter>
    < /invoke>;
//# sourceMappingURL=main.js.map