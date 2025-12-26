import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmailService } from './email.service';
import { EmailOAuthService } from './email-oauth.service';
import { EmailController } from './email.controller';
import { EmailConnection } from './email-connection.entity';

@Module({
  imports: [TypeOrmModule.forFeature([EmailConnection])],
  providers: [EmailService, EmailOAuthService],
  controllers: [EmailController],
  exports: [EmailService],
})
export class EmailModule {}
