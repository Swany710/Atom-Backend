import { Controller, Get, Query, Res, HttpStatus, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Public } from '../../decorators/public.decorator';
import { EmailOAuthService } from './email-oauth.service';
import { GmailService } from './gmail.service';
import { EmailProviderName } from './email.types';

/**
 * Controller to handle OAuth-related HTTP endpoints for email providers.
 * All routes are @Public() — they must be reachable before any API key
 * is set (and the OAuth callback is hit by Google, not by our own client).
 */
@Public()
@Controller('email/oauth')
export class EmailOAuthController {
  constructor(
    private readonly emailOAuthService: EmailOAuthService,
    private readonly gmailService: GmailService,
    private readonly config: ConfigService,
  ) {}

  /** Generate an authorization URL for the specified email provider. */
  @Get('url')
  getAuthUrl(
    @Query('provider') provider: EmailProviderName,
    @Query('userId') userId: string,
  ) {
    return this.emailOAuthService.getAuthUrl(provider, userId);
  }

  /**
   * Handle the OAuth callback after the user has granted access.
   * Returns an HTML page that closes the OAuth popup and notifies the
   * parent window (the Atom settings panel) that the connection succeeded.
   */
  @Get('callback')
  async handleCallback(
    @Query('provider') provider: EmailProviderName,
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
      errorMsg = err instanceof Error ? err.message : String(err);
    }

    // Return HTML that closes the popup and tells the parent window the result
    const html = success
      ? `<!DOCTYPE html><html><head><title>Connected</title></head><body>
           <p style="font-family:sans-serif;padding:2rem;">
             ✅ Gmail connected! You can close this window.
           </p>
           <script>
             if (window.opener) {
               window.opener.postMessage({ type: 'ATOM_GMAIL_CONNECTED', success: true }, '*');
               setTimeout(() => window.close(), 1500);
             }
           </script>
         </body></html>`
      : `<!DOCTYPE html><html><head><title>Error</title></head><body>
           <p style="font-family:sans-serif;padding:2rem;color:red;">
             ❌ Connection failed: ${errorMsg}
           </p>
           <script>
             if (window.opener) {
               window.opener.postMessage({
                 type: 'ATOM_GMAIL_CONNECTED',
                 success: false,
                 error: ${JSON.stringify(errorMsg)}
               }, '*');
             }
           </script>
         </body></html>`;

    return res.status(HttpStatus.OK).send(html);
  }

  /** Check whether a user has an active email connection for the given provider. */
  @Get('status')
  async getStatus(
    @Query('provider') provider: EmailProviderName,
    @Query('userId') userId: string,
  ) {
    return this.emailOAuthService.getConnectionStatus(provider, userId);
  }

  /**
   * Enriched settings status: returns Gmail connection info, the "from"
   * email address, and whether the Google OAuth credentials are configured.
   * Used by the Atom settings panel.
   */
  @Get('gmail-status')
  async getGmailStatus(@Query('userId') userId = 'default-user') {
    const status = await this.gmailService.getConnectionStatus(userId);
    const oauthConfigured = !!(
      this.config.get('GOOGLE_CLIENT_ID') &&
      this.config.get('GOOGLE_CLIENT_SECRET')
    );

    return {
      ...status,
      oauthConfigured,
      connectUrl: oauthConfigured
        ? null   // frontend will fetch /email/oauth/url to get the real URL
        : null,
      setupRequired: !oauthConfigured,
    };
  }
}
