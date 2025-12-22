import {
  Injectable,
  UnauthorizedException,
  InternalServerErrorException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { AuthService } from '../auth/auth.service';
import { ListFilesDto } from './dto/list-files.dto';
import { Readable } from 'stream';

/**
 * Google Drive Service
 * Handles Google Drive OAuth authentication and file operations
 */
@Injectable()
export class GoogleDriveService {
  private oauth2Client: OAuth2Client;

  constructor(
    private configService: ConfigService,
    private authService: AuthService,
  ) {
    this.oauth2Client = new google.auth.OAuth2(
      this.configService.get<string>('GOOGLE_CLIENT_ID'),
      this.configService.get<string>('GOOGLE_CLIENT_SECRET'),
      this.configService.get<string>('GOOGLE_REDIRECT_URI'),
    );
  }

  /**
   * Get Google OAuth authorization URL for Drive access
   * @returns Authorization URL
   */
  getAuthUrl(): string {
    const scopes = [
      'https://www.googleapis.com/auth/drive.readonly',
      'https://www.googleapis.com/auth/drive.file',
      'https://www.googleapis.com/auth/drive.metadata.readonly',
    ];

    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      prompt: 'consent',
    });
  }

  /**
   * Exchange authorization code for tokens
   * @param code Authorization code
   * @param userId User ID
   * @returns Success message
   */
  async exchangeCodeForTokens(
    code: string,
    userId: string,
  ): Promise<{ message: string }> {
    try {
      const { tokens } = await this.oauth2Client.getToken(code);

      if (!tokens.access_token) {
        throw new BadRequestException('Failed to obtain access token');
      }

      const expiryDate = new Date();
      if (tokens.expiry_date) {
        expiryDate.setTime(tokens.expiry_date);
      } else {
        expiryDate.setHours(expiryDate.getHours() + 1);
      }

      await this.authService.updateGoogleTokens(
        userId,
        'google-id',
        tokens.access_token,
        tokens.refresh_token || null,
        expiryDate,
      );

      return { message: 'Google Drive connected successfully' };
    } catch (error) {
      throw new BadRequestException('Invalid authorization code');
    }
  }

  /**
   * List files from Google Drive
   * @param userId User ID
   * @param listFilesDto Query parameters
   * @returns List of files
   */
  async listFiles(userId: string, listFilesDto: ListFilesDto): Promise<any> {
    const drive = await this.getDriveClient(userId);

    try {
      const response = await drive.files.list({
        pageSize: listFilesDto.pageSize,
        fields: listFilesDto.fields || 'nextPageToken, files(id, name, mimeType, size, createdTime, modifiedTime)',
        q: listFilesDto.query,
        pageToken: listFilesDto.pageToken,
      });

      return {
        files: response.data.files || [],
        nextPageToken: response.data.nextPageToken,
      };
    } catch (error) {
      throw new InternalServerErrorException('Failed to list files');
    }
  }

  /**
   * Get file metadata
   * @param userId User ID
   * @param fileId Google Drive file ID
   * @returns File metadata
   */
  async getFileMetadata(userId: string, fileId: string): Promise<any> {
    const drive = await this.getDriveClient(userId);

    try {
      const response = await drive.files.get({
        fileId,
        fields: 'id, name, mimeType, size, createdTime, modifiedTime, parents, webViewLink, webContentLink',
      });

      return response.data;
    } catch (error) {
      throw new NotFoundException('File not found');
    }
  }

  /**
   * Download file from Google Drive
   * @param userId User ID
   * @param fileId Google Drive file ID
   * @returns File stream and metadata
   */
  async downloadFile(
    userId: string,
    fileId: string,
  ): Promise<{ stream: Readable; metadata: any }> {
    const drive = await this.getDriveClient(userId);

    try {
      // Get file metadata first
      const metadata = await this.getFileMetadata(userId, fileId);

      // Download file content
      const response = await drive.files.get(
        {
          fileId,
          alt: 'media',
        },
        { responseType: 'stream' },
      );

      return {
        stream: response.data as Readable,
        metadata,
      };
    } catch (error) {
      throw new NotFoundException('File not found or cannot be downloaded');
    }
  }

  /**
   * Search files in Google Drive
   * @param userId User ID
   * @param searchTerm Search term
   * @returns Matching files
   */
  async searchFiles(userId: string, searchTerm: string): Promise<any[]> {
    const query = `name contains '${searchTerm}' and trashed=false`;

    const result = await this.listFiles(userId, {
      query,
      pageSize: 20,
    });

    return result.files;
  }

  /**
   * Upload file to Google Drive
   * @param userId User ID
   * @param fileName File name
   * @param mimeType File MIME type
   * @param fileBuffer File buffer
   * @returns Uploaded file metadata
   */
  async uploadFile(
    userId: string,
    fileName: string,
    mimeType: string,
    fileBuffer: Buffer,
  ): Promise<any> {
    const drive = await this.getDriveClient(userId);

    try {
      const response = await drive.files.create({
        requestBody: {
          name: fileName,
          mimeType,
        },
        media: {
          mimeType,
          body: Readable.from(fileBuffer),
        },
        fields: 'id, name, mimeType, size, webViewLink',
      });

      return response.data;
    } catch (error) {
      throw new InternalServerErrorException('Failed to upload file');
    }
  }

  /**
   * Delete file from Google Drive
   * @param userId User ID
   * @param fileId File ID
   */
  async deleteFile(userId: string, fileId: string): Promise<void> {
    const drive = await this.getDriveClient(userId);

    try {
      await drive.files.delete({
        fileId,
      });
    } catch (error) {
      throw new NotFoundException('File not found or cannot be deleted');
    }
  }

  /**
   * Get authenticated Drive client for user
   * @param userId User ID
   * @returns Drive API client
   */
  private async getDriveClient(userId: string) {
    const user = await this.authService.getUserById(userId);

    if (!user.googleAccessToken) {
      throw new UnauthorizedException('Google Drive not connected');
    }

    // Check if token is expired
    if (user.googleTokenExpiry && user.googleTokenExpiry < new Date()) {
      if (!user.googleRefreshToken) {
        throw new UnauthorizedException(
          'Google Drive token expired, please reconnect',
        );
      }

      await this.refreshAccessToken(userId, user.googleRefreshToken);
      const updatedUser = await this.authService.getUserById(userId);
      this.oauth2Client.setCredentials({
        access_token: updatedUser.googleAccessToken,
        refresh_token: updatedUser.googleRefreshToken,
      });
    } else {
      this.oauth2Client.setCredentials({
        access_token: user.googleAccessToken,
        refresh_token: user.googleRefreshToken || undefined,
      });
    }

    return google.drive({ version: 'v3', auth: this.oauth2Client });
  }

  /**
   * Refresh access token
   * @param userId User ID
   * @param refreshToken Refresh token
   */
  private async refreshAccessToken(
    userId: string,
    refreshToken: string,
  ): Promise<void> {
    try {
      this.oauth2Client.setCredentials({
        refresh_token: refreshToken,
      });

      const { credentials } = await this.oauth2Client.refreshAccessToken();

      const expiryDate = new Date();
      if (credentials.expiry_date) {
        expiryDate.setTime(credentials.expiry_date);
      } else {
        expiryDate.setHours(expiryDate.getHours() + 1);
      }

      await this.authService.updateGoogleTokens(
        userId,
        'google-id',
        credentials.access_token!,
        credentials.refresh_token || null,
        expiryDate,
      );
    } catch (error) {
      throw new UnauthorizedException('Failed to refresh token');
    }
  }
}
