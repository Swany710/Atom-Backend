import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
    }),
  ],
  controllers: [AppController],
  providers: [AppService, ConfigService], // Add ConfigService to providers
})
export class AppModule {
  constructor() {
    console.log('✅ App Module with real OpenAI personal assistant integration loaded');
  }
}