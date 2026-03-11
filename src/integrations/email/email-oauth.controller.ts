import { Controller, Get, Delete, Query, Res, HttpStatus, Req } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Public } from '../../decorators/public.decorator';
import { EmailOAuthService } from './email-oauth.service';
import { GmailService } from './gmail.service';
import { EmailService as OutlookEmailService } from './email.service';
import { EmailProviderName } from './email.types';

/**
 * OAuth flow endpoints for email providers.
 *
 * ALL endpoints are @Public() — the static frontend sends no Authorization header.
 * userId is resolved server-side: req.atomUserId (set by ApiKeyGuard when a JWT/API-key
 * IS present) falls back to OWNER_USER_ID env var, then 'owner'.
 */
@Controller('email/oauth')
export class EmailOAuthController {
  constructor(
    private readonly emailOAuthService: EmailOAuthService,
    private readonly gmailService: GmailService,
    private readonly outlookService: OutlookEmailService,
    private readonly config: ConfigService,
  ) {}

  /** Resolve the caller's userId without requiring an auth header. */
  private userId(req: any): string {
    return (
      req.atomUserId ??
      this.config.get<string>('OWNER_USER_ID') ??
      'owner'
    );
  }

  /** Generate an authorization URL for any supported provider. userId resolved server-side only. */
  @Public()
  @Get('url')
  getAuthUrl(
    @Req() req: any,
    @Query('provider') provider: EmailProviderName,
  ) {
    return this.emailOAuthService.getAuthUrl(provider, this.userId(req));
  }

  /**
   * OAuth callback — MUST be @Public() because Google/Microsoft redirects
   * here directly, without our Authorization header.
   * userId and provider are recovered from the signed HMAC state.
   */
  @Public()
  @Get('callback')
  async handleCallback(
    @Query('provider') provider: EmailProviderName | undefined,
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: any,
  ) {
    let success = false;
    let errorMsg = '';
    let resolvedProvider: EmailProviderName = provider as EmailProviderName;

    // Peek at state to recover provider (Google/Microsoft don't echo it back)
    if (!resolvedProvider && state) {
      try {
        const dotIndex = state.lastIndexOf('.');
        const dataPart = dotIndex !== -1 ? state.slice(0, dotIndex) : state;
        const decoded = JSON.parse(Buffer.from(dataPart, 'base64url').toString('utf-8')) as {
          provider: EmailProviderName;
        };
        resolvedProvider = decoded.provider;
      } catch {
        // will fail in handleCallback with a clear error
      }
    }

    try {
      await this.emailOAuthService.handleCallback(provider, code, state);
      success = true;
    } catch (err) {
      errorMsg = 'OAuth connection failed. Please try again.';
    }

    // Provider-specific labels and postMessage types
    const isOutlook = resolvedProvider === 'outlook';
    const providerLabel = isOutlook ? 'Outlook' : 'Gmail';
    const msgType = isOutlook ? 'ATOM_OUTLOOK_CONNECTED' : 'ATOM_GMAIL_CONNECTED';

    // Use window.opener.location.origin as the postMessage target — evaluated in
    // the browser popup so it always refers to the actual frontend origin.
    const html = success
      ? `<!DOCTYPE html><html><head><title>Connected</title></head><body>
           <p style="font-family:sans-serif;padding:2rem;">
             ✅ ${providerLabel} connected! You can close this window.
           </p>
           <script>
             if (window.opener) {
               try {
                 window.opener.postMessage(
                   { type: ${JSON.stringify(msgType)}, success: true },
                   window.opener.location.origin
                 );
               } catch(e) {}
               setTimeout(() => window.close(), 1500);
             }
           </script>
         </body></html>`
      : `<!DOCTYPE html><html><head><title>Error</title></head><body>
           <p style="font-family:sans-serif;padding:2rem;color:red;">
             ${errorMsg}
           </p>
           <script>
             if (window.opener) {
               try {
                 window.opener.postMessage(
                   { type: ${JSON.stringify(msgType)}, success: false, error: ${JSON.stringify(errorMsg)} },
                   window.opener.location.origin
                 );
               } catch(e) {}
             }
           </script>
         </body></html>`;

    return res.status(HttpStatus.OK).send(html);
  }

  /** Generic connection status for any provider. userId resolved server-side only. */
  @Public()
  @Get('status')
  async getStatus(
    @Req() req: any,
    @Query('provider') provider: EmailProviderName,
  ) {
    return this.emailOAuthService.getConnectionStatus(provider, this.userId(req));
  }

  /**
   * Enriched Gmail status for the settings panel.
   * userId resolved server-side only.
   */
  @Public()
  @Get('gmail-status')
  async getGmailStatus(@Req() req: any) {
    const userId: string = this.userId(req);
    const status = await this.gmailService.getConnectionStatus(userId);
    const oauthConfigured = !!(
      this.config.get('GOOGLE_CLIENT_ID') &&
      this.config.get('GOOGLE_CLIENT_SECRET')
    );

    return {
      ...status,
      oauthConfigured,
      connectUrl: null,
      setupRequired: !oauthConfigured,
    };
  }

  /**
   * Enriched Outlook/Microsoft status for the settings panel.
   * userId resolved server-side only.
   */
  @Public()
  @Get('outlook-status')
  async getOutlookStatus(@Req() req: any) {
    const userId: string = this.userId(req);
    const status = await this.emailOAuthService.getConnectionStatus('outlook', userId);
    const oauthConfigured = !!(
      this.config.get('MICROSOFT_CLIENT_ID') &&
      this.config.get('MICROSOFT_CLIENT_SECRET')
    );

    return {
      ...status,
      oauthConfigured,
      connectUrl: null,
      setupRequired: !oauthConfigured,
    };
  }

  /**
   * Disconnect a stored OAuth connection. userId resolved server-side only.
   * DELETE /email/oauth/disconnect?provider=gmail|outlook
   */
  @Public()
  @Delete('disconnect')
  async disconnect(
    @Req() req: any,
    @Query('provider') provider: string,
  ) {
    const userId: string = this.userId(req);
    try {
      await this.emailOAuthService.disconnectProvider(provider as EmailProviderName, userId);
      return { success: true, message: `${provider} disconnected.` };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}
