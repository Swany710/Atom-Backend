import * as crypto from 'crypto';
import { encryptToken, decryptToken } from '../../crypto.util';
import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios from 'axios';
import { EmailConnection } from './email-connection.entity';
import { EmailProviderName, emailProviderNames } from './email.types';

/**
 * Shape of the profile returned from the Gmail API. The Gmail `users.me.profile`
 * endpoint returns an object with an `emailAddress` field that contains the
 * authenticated user's primary email address. Defining this interface allows
 * TypeScript to safely access the `emailAddress` property on the response.
 */
interface GmailProfile {
  emailAddress: string;
}

/**
 * Shape of the profile returned from Microsoft Graph when querying `me`.
 * The `mail` field is present if the account has a primary SMTP address.
 * Otherwise, the `userPrincipalName` can be used as a fallback. Defining
 * this interface allows us to narrow the unknown type returned by axios and
 * access these properties without compiler errors.
 */
interface MicrosoftProfile {
  mail?: string;
  userPrincipalName?: string;
}

/**
 * Type returned from the OAuth token exchange endpoint for both Google and
 * Microsoft providers. While both providers return additional fields, the
 * application only cares about a handful of them. Defining this interface
 * explicitly makes `axios` infer the shape of `response.data` as something
 * other than `unknown` and prevents TypeScript errors when accessing
 * properties.
 */
interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
}

@Injectable()
export class EmailOAuthService {
  private readonly logger = new Logger(EmailOAuthService.name);

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(EmailConnection)
    private readonly connectionRepo: Repository<EmailConnection>,
  ) {}

  getAuthUrl(provider: EmailProviderName, userId: string): string {
    this.validateProvider(provider);

    if (provider === 'gmail') {
      return this.buildGoogleAuthUrl(userId);
    }

    return this.buildMicrosoftAuthUrl(userId);
  }

  async handleCallback(
    provider: EmailProviderName | undefined,
    code: string,
    state: string,
  ): Promise<EmailConnection> {
    // Google (and Microsoft) only return `code` and `state` in the callback —
    // they do NOT re-send the `provider` query param. Decode the state first
    // to recover the provider that was embedded when the auth URL was built.
    let resolvedProvider: EmailProviderName = provider as EmailProviderName;
    if (!resolvedProvider && state) {
      try {
        const decoded = JSON.parse(
          Buffer.from(state, 'base64url').toString('utf-8'),
        ) as { userId: string; provider: EmailProviderName };
        resolvedProvider = decoded.provider;
      } catch {
        // will fail at validateProvider below with a clear message
      }
    }

    this.validateProvider(resolvedProvider);
    const payload = this.parseState(state, resolvedProvider);

    if (resolvedProvider === 'gmail') {
      return this.exchangeGoogleCode(payload.userId, code);
    }

    return this.exchangeMicrosoftCode(payload.userId, code);
  }

  /** Remove a stored OAuth connection so the user can reconnect with a different account. */
  async disconnectProvider(provider: EmailProviderName, userId: string): Promise<void> {
    this.validateProvider(provider);
    await this.connectionRepo.delete({ userId, provider });
    this.logger.log(`OAuth connection removed: ${provider} / ${userId}`);
  }

  async getConnectionStatus(provider: EmailProviderName, userId: string) {
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

  private validateProvider(provider: EmailProviderName) {
    if (!emailProviderNames.includes(provider)) {
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

  /**
   * Exchange a Google OAuth authorization code for an access token and
   * refresh token. After obtaining the tokens, fetch the user's profile
   * information from Gmail and persist the connection details. Generic
   * types are applied to the axios calls so that `response.data` is
   * correctly inferred and property accesses (e.g. `data.emailAddress`) do
   * not result in the type being treated as `unknown`.
   */
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

    // Fetch the authenticated user's email address using the Gmail API. The
    // generic <GmailProfile> informs axios of the expected response shape.
    const profileResponse = await axios.get<GmailProfile>(
      'https://gmail.googleapis.com/gmail/v1/users/me/profile',
      {
        headers: { Authorization: `Bearer ${access_token}` },
      },
    );

    const emailAddress = profileResponse.data.emailAddress;

    // Upsert: update existing connection if present, otherwise create new.
    // Without this, re-connecting the same userId would hit the unique
    // constraint on (userId, provider) and throw a DB error.
    const existing = await this.connectionRepo.findOne({
      where: { userId, provider: 'gmail' },
    });
    const entity = existing ?? this.connectionRepo.create();
    Object.assign(entity, {
      userId,
      provider: 'gmail' as EmailProviderName,
      emailAddress,
      accessToken: encryptToken(access_token),
      refreshToken: refresh_token ? encryptToken(refresh_token) : entity.refreshToken ?? entity.refreshToken, // keep old refresh token if Google omits it
      expiresAt:    expires_in ? new Date(Date.now() + expires_in * 1000) : undefined,
      scope,
    });
    return this.connectionRepo.save(entity);
  }

  /**
   * Exchange a Microsoft OAuth authorization code for an access token. Then
   * fetch the authenticated user's profile from Microsoft Graph. Generic
   * types are applied to the axios calls so that `response.data` has the
   * correct shape, allowing safe access to the `mail` and
   * `userPrincipalName` properties.
   */
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

    // Fetch the user's profile using Microsoft Graph. Use a generic to define
    // the expected shape of the response and avoid `unknown` types.
    const profileResponse = await axios.get<MicrosoftProfile>(
      'https://graph.microsoft.com/v1.0/me',
      { headers: { Authorization: `Bearer ${access_token}` } },
    );

    const emailAddress = profileResponse.data.mail || profileResponse.data.userPrincipalName;

    const existing = await this.connectionRepo.findOne({
      where: { userId, provider: 'outlook' },
    });
    const entity = existing ?? this.connectionRepo.create();
    Object.assign(entity, {
      userId,
      provider: 'outlook' as EmailProviderName,
      emailAddress,
      accessToken: encryptToken(access_token),
      refreshToken: refresh_token ? encryptToken(refresh_token) : entity.refreshToken ?? entity.refreshToken,
      expiresAt:    expires_in ? new Date(Date.now() + expires_in * 1000) : undefined,
      scope: grantedScope,
    });
    return this.connectionRepo.save(entity);
  }

  private getGoogleScopes(): string[] {
    const defaultScopes = [
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.modify',
      'https://www.googleapis.com/auth/userinfo.email',
      // Calendar scopes — needed for GoogleCalendarService
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.events',
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

  /** Build a signed state token: base64url(JSON) + "." + HMAC-SHA256 */
  private encodeState(payload: { userId: string; provider: EmailProviderName }): string {
    const secret = this.config.get<string>('OAUTH_STATE_SECRET') ?? 'dev-insecure-secret';
    const data   = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const sig    = crypto.createHmac('sha256', secret).update(data).digest('base64url');
    return `${data}.${sig}`;
  }

  /** Verify HMAC signature then decode state payload */
  private parseState(state: string, provider: EmailProviderName) {
    if (!state) throw new BadRequestException('Missing OAuth state.');

    try {
      const dotIndex = state.lastIndexOf('.');
      if (dotIndex === -1) throw new Error('Malformed state (no signature)');

      const data = state.slice(0, dotIndex);
      const sig  = state.slice(dotIndex + 1);

      const secret   = this.config.get<string>('OAUTH_STATE_SECRET') ?? 'dev-insecure-secret';
      const expected = crypto.createHmac('sha256', secret).update(data).digest('base64url');

      if (!crypto.timingSafeEqual(Buffer.from(sig, 'base64url'), Buffer.from(expected, 'base64url'))) {
        throw new Error('State signature mismatch');
      }

      const payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf-8')) as {
        userId: string;
        provider: EmailProviderName;
      };

      if (!payload.userId || payload.provider !== provider) {
        throw new Error('Invalid state payload');
      }

      return payload;
    } catch (error) {
      this.logger.error('Failed to parse OAuth state', error as any);
      throw new BadRequestException('Invalid OAuth state.');
    }
  }
}
