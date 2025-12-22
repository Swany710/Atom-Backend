import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GoogleDriveService } from './google-drive.service';
import { GoogleDriveController } from './google-drive.controller';
import { AuthModule } from '../auth/auth.module';

/**
 * Google Drive Module
 * Provides Google Drive OAuth and file operations functionality
 */
@Module({
  imports: [ConfigModule, AuthModule],
  controllers: [GoogleDriveController],
  providers: [GoogleDriveService],
  exports: [GoogleDriveService],
})
export class GoogleDriveModule {}
