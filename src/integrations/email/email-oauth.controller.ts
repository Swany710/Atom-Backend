import { Controller, Get, Delete, Query, Res, HttpStatus, Req } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Public } from '../../decorators/public.decorator';
import { EmailOAuthService } from './email-oauth.service';
import { GmailService } from './gmail.service';
import { EmailProviderName } from './email.types';

/**
 * OAuth flow endpoints for email providers.
 *
 * Only /callback is @Public() — Google redirects here without our auth header.
 * All other endpoints require Authorization: Bearer <API_KEY> via the global guard.
 * userId is always resolved server-side from req.atomUserId, never from query params.
 */
@Controller('email/oauth')
export class EmailOAuthController {
  constructor(
    private readonly emailOAuthService: EmailOAuthService,
    private readonly gmailService: GmailService,
    private readonly config: ConfigService,
  ) {}

  /** Generate an authorization URL. userId resolved server-side only. */
  @Get('url')
  getAuthUrl(
    @Req() req: any,
    @Query('provider') provider: EmailProviderName,
  ) {
    const userId: string = req.atomUserId;
    return this.emailOAuthService.getAuthUrl(provider, userId);
  }

  /**
   * OAuth callback — MUST be @Public() because Google/Microsoft redirects
   * here directly, without our Authorization header.
   * userId is recovered from the signed HMAC state, not from query params.
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

    try {
      await this.emailOAuthService.handleCallback(provider, code, state);
      success = true;
    } catch (err) {
      // Return generic error to client — no internal details
      errorMsg = 'OAuth connection failed. Please try again.';
    }

    const allowedOrigin = this.config.get<string>('ALLOWED_ORIGINS')?.split(',')[0]?.trim()
      ?? 'null';

    const html = success
      ? `<!DOCTYPE html><html><head><title>Connected</title></head><body>
           <p style="font-family:sans-serif;padding:2rem;">
             Gmail connected! You can close this window.
           </p>
           <script>
             if (window.opener) {
               window.opener.postMessage(
                 { type: 'ATOM_GMAIL_CONNECTED', success: true },
                 ${JSON.stringify(allowedOrigin)}
               );
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
               window.opener.postMessage(
                 { type: 'ATOM_GMAIL_CONNECTED', success: false, error: ${JSON.stringify(errorMsg)} },
                 ${JSON.stringify(allowedOrigin)}
               );
             }
           </script>
         </body></html>`;

    return res.status(HttpStatus.OK).send(html);
  }

  /** Connection status. userId resolved server-side only. */
  @Get('status')
  async getStatus(
    @Req() req: any,
    @Query('provider') provider: EmailProviderName,
  ) {
    const userId: string = req.atomUserId;
    return this.emailOAuthService.getConnectionStatus(provider, userId);
  }

  /**
   * Enriched Gmail status for the settings panel.
   * userId resolved server-side only.
   */
  @Get('gmail-status')
  async getGmailStatus(@Req() req: any) {
    const userId: string = req.atomUserId;
    const status = await this.gmailService.getConnectionStatus(userId);
    const oauthConfigured = !!(
      this.config.get('GOOGLE_CLIENT_ID') &&
      this.config.get('GOOGLE_CLIENT_SECRET')
    );

    return {
      ...status,
      oauthConfigured,
      connectUrl: null,  // frontend fetches /email/oauth/url for the real URL
      setupRequired: !oauthConfigured,
    };
  }

  /**
   * Disconnect a stored OAuth connection. userId resolved server-side only.
   * DELETE /email/oauth/disconnect?provider=gmail
   */
  @Delete('disconnect')
  async disconnect(
    @Req() req: any,
    @Query('provider') provider: string,
  ) {
    const userId: string = req.atomUserId;
    try {
      await this.emailOAuthService.disconnectProvider(provider as EmailProviderName, userId);
      return { success: true, message: `${provider} disconnected.` };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}
