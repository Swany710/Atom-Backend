import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios from 'axios';
import { EmailConnection } from './email-connection.entity';
import { EmailProvider, emailProviders } from './email.types';

interface OAuthStatePayload {
  userId: string;
  provider: EmailProvider;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
}

interface GmailProfileResponse {
  emailAddress?: string;
}

interface MicrosoftProfileResponse {
  mail?: string;
  userPrincipalName?: string;
}

@Injectable()
export class EmailOAuthService {
  private readonly logger = new Logger(EmailOAuthService.name);

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(EmailConnection)
    private readonly connectionRepo: Repository<EmailConnection>,
  ) {}

  getAuthUrl(provider: EmailProvider, userId: string): string {
    this.validateProvider(provider);

    if (provider === 'gmail') {
      return this.buildGoogleAuthUrl(userId);
    }

    return this.buildMicrosoftAuthUrl(userId);
  }

  async handleCallback(
    provider: EmailProvider,
    code: string,
    state: string,
  ): Promise<EmailConnection> {
    this.validateProvider(provider);
    const payload = this.parseState(state, provider);

    if (provider === 'gmail') {
      return this.exchangeGoogleCode(payload.userId, code);
    }

    return this.exchangeMicrosoftCode(payload.userId, code);
  }

  async getConnectionStatus(provider: EmailProvider, userId: string) {
    this.validateProvider(provider);
    const connection = await this.connectionRepo.findOne({
      where: { userId, provider },
    });

    return {
      connected: !!connection,
      emailAddress: connection?.emailAddress,
      provider,
    };
  }

  private validateProvider(provider: EmailProvider) {
    if (!emailProviders.includes(provider)) {
      throw new BadRequestException('Unsupported email provider.');
    }
  }

  private buildGoogleAuthUrl(userId: string): string {
    const clientId = this.config.get<string>('GOOGLE_CLIENT_ID');
    const redirectUri = this.config.get<string>('GOOGLE_REDIRECT_URI');

    if (!clientId || !redirectUri) {
      throw new BadRequestException('Google OAuth is not configured.');
    }

    const scope = this.getGoogleScopes().join(' ');
    const state = this.encodeState({ userId, provider: 'gmail' });

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope,
      access_type: 'offline',
      prompt: 'consent',
      state,
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  private buildMicrosoftAuthUrl(userId: string): string {
    const clientId = this.config.get<string>('MICROSOFT_CLIENT_ID');
    const tenantId = this.config.get<string>('MICROSOFT_TENANT_ID') || 'common';
    const redirectUri = this.config.get<string>('MICROSOFT_REDIRECT_URI');

    if (!clientId || !redirectUri) {
      throw new BadRequestException('Microsoft OAuth is not configured.');
    }

    const scope = this.getMicrosoftScopes().join(' ');
    const state = this.encodeState({ userId, provider: 'outlook' });

    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: redirectUri,
      response_mode: 'query',
      scope,
      state,
    });

    return `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?${params.toString()}`;
  }

  private async exchangeGoogleCode(userId: string, code: string) {
    const clientId = this.config.get<string>('GOOGLE_CLIENT_ID');
    const clientSecret = this.config.get<string>('GOOGLE_CLIENT_SECRET');
    const redirectUri = this.config.get<string>('GOOGLE_REDIRECT_URI');

    if (!clientId || !clientSecret || !redirectUri) {
      throw new BadRequestException('Google OAuth is not configured.');
    }

    const tokenResponse = await axios.post<TokenResponse>(
      'https://oauth2.googleapis.com/token',
      new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    );

    const { access_token, refresh_token, expires_in, scope } = tokenResponse.data;
    const profileResponse = await axios.get<GmailProfileResponse>(
      'https://gmail.googleapis.com/gmail/v1/users/me/profile',
      {
        headers: { Authorization: `Bearer ${access_token}` },
      },
    );

    const emailAddress = profileResponse.data?.emailAddress;

    return this.connectionRepo.save({
      userId,
      provider: 'gmail',
      emailAddress,
      accessToken: access_token,
      refreshToken: refresh_token,
      expiresAt: expires_in ? new Date(Date.now() + expires_in * 1000) : undefined,
      scope,
    });
  }

  private async exchangeMicrosoftCode(userId: string, code: string) {
    const clientId = this.config.get<string>('MICROSOFT_CLIENT_ID');
    const clientSecret = this.config.get<string>('MICROSOFT_CLIENT_SECRET');
    const tenantId = this.config.get<string>('MICROSOFT_TENANT_ID') || 'common';
    const redirectUri = this.config.get<string>('MICROSOFT_REDIRECT_URI');

    if (!clientId || !clientSecret || !redirectUri) {
      throw new BadRequestException('Microsoft OAuth is not configured.');
    }

    const scope = this.getMicrosoftScopes().join(' ');
    const tokenResponse = await axios.post<TokenResponse>(
      `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
      new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
        code,
        scope,
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    );

    const { access_token, refresh_token, expires_in, scope: grantedScope } =
      tokenResponse.data;

    const profileResponse = await axios.get<MicrosoftProfileResponse>(
      'https://graph.microsoft.com/v1.0/me',
      { headers: { Authorization: `Bearer ${access_token}` } },
    );

    const emailAddress =
      profileResponse.data?.mail || profileResponse.data?.userPrincipalName;

    return this.connectionRepo.save({
      userId,
      provider: 'outlook',
      emailAddress,
      accessToken: access_token,
      refreshToken: refresh_token,
      expiresAt: expires_in ? new Date(Date.now() + expires_in * 1000) : undefined,
      scope: grantedScope,
    });
  }

  private getGoogleScopes(): string[] {
    const defaultScopes = [
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.modify',
      'https://www.googleapis.com/auth/userinfo.email',
    ];

    const configured = this.config.get<string>('GOOGLE_SCOPES');
    return configured ? configured.split(',').map(scope => scope.trim()) : defaultScopes;
  }

  private getMicrosoftScopes(): string[] {
    const defaultScopes = [
      'offline_access',
      'https://graph.microsoft.com/Mail.ReadWrite',
      'https://graph.microsoft.com/Mail.Send',
      'https://graph.microsoft.com/User.Read',
    ];

    const configured = this.config.get<string>('MICROSOFT_SCOPES');
    return configured ? configured.split(',').map(scope => scope.trim()) : defaultScopes;
  }

  private encodeState(payload: OAuthStatePayload): string {
    return Buffer.from(JSON.stringify(payload)).toString('base64url');
  }

  private parseState(state: string, provider: EmailProvider): OAuthStatePayload {
    if (!state) {
      throw new BadRequestException('Missing OAuth state.');
    }

    try {
      const decoded = Buffer.from(state, 'base64url').toString('utf-8');
      const payload = JSON.parse(decoded) as OAuthStatePayload;

      if (!payload.userId || payload.provider !== provider) {
        throw new Error('Invalid state payload');
      }

      return payload;
    } catch (error) {
      this.logger.error('Failed to parse OAuth state', error);
      throw new BadRequestException('Invalid OAuth state.');
    }
  }
}
