import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Query,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  Res,
  StreamableFile,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { Response } from 'express';
import { GoogleDriveService } from './google-drive.service';
import { ListFilesDto } from './dto/list-files.dto';
import { JwtAuthGuard } from '../shared/guards/jwt-auth.guard';
import { CurrentUser } from '../shared/decorators/current-user.decorator';
import { User } from '../auth/entities/user.entity';

/**
 * Google Drive Controller
 * Handles Google Drive OAuth and file operations
 */
@ApiTags('Google Drive')
@Controller('google-drive')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class GoogleDriveController {
  constructor(private readonly googleDriveService: GoogleDriveService) {}

  /**
   * Get Google Drive OAuth authorization URL
   */
  @Get('auth-url')
  @ApiOperation({ summary: 'Get Google Drive OAuth authorization URL' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Authorization URL retrieved',
  })
  getAuthUrl(): { authUrl: string } {
    const authUrl = this.googleDriveService.getAuthUrl();
    return { authUrl };
  }

  /**
   * Handle OAuth callback and exchange code for tokens
   */
  @Post('callback')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Exchange OAuth code for tokens' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Google Drive connected successfully',
  })
  async handleCallback(
    @Body('code') code: string,
    @CurrentUser() user: User,
  ): Promise<{ message: string }> {
    return this.googleDriveService.exchangeCodeForTokens(code, user.id);
  }

  /**
   * List files from Google Drive
   */
  @Get('files')
  @ApiOperation({ summary: 'List files from Google Drive' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Files retrieved successfully',
  })
  async listFiles(
    @Query() listFilesDto: ListFilesDto,
    @CurrentUser() user: User,
  ): Promise<any> {
    return this.googleDriveService.listFiles(user.id, listFilesDto);
  }

  /**
   * Get file metadata
   */
  @Get('files/:fileId/metadata')
  @ApiOperation({ summary: 'Get file metadata' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'File metadata retrieved',
  })
  async getFileMetadata(
    @Param('fileId') fileId: string,
    @CurrentUser() user: User,
  ): Promise<any> {
    return this.googleDriveService.getFileMetadata(user.id, fileId);
  }

  /**
   * Download file from Google Drive
   */
  @Get('files/:fileId/download')
  @ApiOperation({ summary: 'Download file from Google Drive' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'File downloaded successfully',
  })
  async downloadFile(
    @Param('fileId') fileId: string,
    @CurrentUser() user: User,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { stream, metadata } = await this.googleDriveService.downloadFile(
      user.id,
      fileId,
    );

    res.set({
      'Content-Type': metadata.mimeType,
      'Content-Disposition': `attachment; filename="${metadata.name}"`,
    });

    return new StreamableFile(stream);
  }

  /**
   * Search files in Google Drive
   */
  @Get('search')
  @ApiOperation({ summary: 'Search files in Google Drive' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Search results retrieved',
  })
  async searchFiles(
    @Query('q') searchTerm: string,
    @CurrentUser() user: User,
  ): Promise<any[]> {
    return this.googleDriveService.searchFiles(user.id, searchTerm);
  }

  /**
   * Delete file from Google Drive
   */
  @Delete('files/:fileId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete file from Google Drive' })
  @ApiResponse({
    status: HttpStatus.NO_CONTENT,
    description: 'File deleted successfully',
  })
  async deleteFile(
    @Param('fileId') fileId: string,
    @CurrentUser() user: User,
  ): Promise<void> {
    await this.googleDriveService.deleteFile(user.id, fileId);
  }
}
