import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
    }),
  ],
  controllers: [AppController], // Only the main controller with AI routes built-in
  providers: [AppService],
})
export class AppModule {
  constructor() {
    console.log('✅ Simple App Module with built-in AI routes loaded');
  }
}