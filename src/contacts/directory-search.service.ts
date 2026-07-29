import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { google } from 'googleapis';
import { EmailConnection } from '../integrations/email/email-connection.entity';
import { decryptToken } from '../crypto.util';
import { providerRead } from '../utils/provider-call';
import type { ContactInput } from './contacts.service';

/** A candidate found in the user's mailbox directory — NOT yet saved. */
export interface DirectoryMatch extends ContactInput {
  source:      'google' | 'outlook';
  externalId:  string;
  displayName: string;
}

export interface DirectorySearchResult {
  success:   boolean;
  matches?:  DirectoryMatch[];
  provider?: 'google' | 'outlook';
  error?:    string;
  /** True when the failure is a missing OAuth scope rather than a real fault. */
  needsReconnect?: boolean;
}

/**
 * DirectorySearchService — read-only search of the user's Gmail or Outlook
 * contacts. Finds candidates; it never saves anything.
 *
 * ── Why this needs a reconnect ───────────────────────────────────────────────
 * Gmail contacts are NOT in the Gmail API. They live in the Google People API
 * (people.googleapis.com), which needs the `contacts.readonly` scope AND the
 * People API enabled on the Google Cloud project. Outlook needs `Contacts.Read`
 * on Microsoft Graph.
 *
 * Neither scope was requested by earlier versions of Atom, and a refresh token
 * only carries the scopes consented to when it was issued — so an existing
 * connection CANNOT be upgraded in place. The user has to reconnect the mailbox
 * once. We detect that case (403 / insufficient scope) and say so plainly
 * instead of reporting a generic failure.
 *
 * ── Why search-only, never bulk ──────────────────────────────────────────────
 * Google's "other contacts" includes every address auto-saved from mail the
 * user has ever sent. Importing that wholesale would bury the real contacts.
 * So this searches, returns candidates, and the caller confirms each one.
 */
@Injectable()
export class DirectorySearchService {
  private readonly logger = new Logger(DirectorySearchService.name);

  /** Scope needed on each provider for the calls below. */
  static readonly GOOGLE_SCOPE    = 'https://www.googleapis.com/auth/contacts.readonly';
  static readonly MICROSOFT_SCOPE = 'https://graph.microsoft.com/Contacts.Read';

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(EmailConnection)
    private readonly connectionRepo: Repository<EmailConnection>,
  ) {}

  /** Which mailbox this user has connected, if any. */
  private async connectionFor(userId: string): Promise<EmailConnection | null> {
    const gmail = await this.connectionRepo.findOne({ where: { userId, provider: 'gmail' } });
    if (gmail?.refreshToken) return gmail;
    const outlook = await this.connectionRepo.findOne({ where: { userId, provider: 'outlook' } });
    if (outlook?.refreshToken) return outlook;
    return null;
  }

  /** Did the stored consent include the contacts scope? */
  private hasScope(conn: EmailConnection, scope: string): boolean {
    // A null scope column predates scope tracking — assume not granted and let
    // the API call be the judge, rather than blocking a connection that works.
    if (!conn.scope) return false;
    return conn.scope.includes(scope) || conn.scope.includes(scope.split('/').pop() ?? '');
  }

  private reconnectHint(provider: 'google' | 'outlook'): DirectorySearchResult {
    const what = provider === 'google'
      ? 'Google contacts access'
      : 'Outlook contacts access';
    return {
      success: false,
      needsReconnect: true,
      provider,
      error:
        `Atom does not have ${what} yet. Open Settings → Connections and reconnect your ` +
        'mailbox — the permission screen will now ask for read-only access to your ' +
        'contacts. Nothing is imported automatically; Atom will still ask before ' +
        'adding anyone.',
    };
  }

  // ── Entry point ───────────────────────────────────────────────────────────

  async search(userId: string, query: string, limit = 15): Promise<DirectorySearchResult> {
    const q = query?.trim();
    if (!q) return { success: false, error: 'Enter a name, email, or phone number to search for.' };

    const conn = await this.connectionFor(userId);
    if (!conn) {
      return {
        success: false,
        error: 'No mailbox is connected. Open Settings → Connections and connect Gmail or Outlook first.',
      };
    }

    return conn.provider === 'gmail'
      ? this.searchGoogle(conn, q, limit)
      : this.searchOutlook(conn, q, limit);
  }

  // ── Google People API ─────────────────────────────────────────────────────

  private async searchGoogle(conn: EmailConnection, q: string, limit: number): Promise<DirectorySearchResult> {
    if (!this.hasScope(conn, DirectorySearchService.GOOGLE_SCOPE)) {
      return this.reconnectHint('google');
    }

    const clientId     = this.config.get<string>('GOOGLE_CLIENT_ID');
    const clientSecret = this.config.get<string>('GOOGLE_CLIENT_SECRET');
    const redirectUri  = this.config.get<string>('GOOGLE_REDIRECT_URI');
    if (!clientId || !clientSecret) {
      return { success: false, error: 'Google OAuth is not configured on the server.' };
    }

    try {
      const auth = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
      auth.setCredentials({
        refresh_token: conn.refreshToken ? decryptToken(conn.refreshToken) : undefined,
        access_token:  decryptToken(conn.accessToken),
      });

      const people = google.people({ version: 'v1', auth });

      const res: any = await providerRead(
        () => people.people.searchContacts({
          query:      q,
          pageSize:   limit,
          readMask:   'names,emailAddresses,phoneNumbers,addresses,organizations',
        } as any),
        'google.people.searchContacts',
      );

      const matches = (res.data?.results ?? [])
        .map((r: any) => this.mapGooglePerson(r.person))
        .filter(Boolean) as DirectoryMatch[];

      return { success: true, provider: 'google', matches };
    } catch (err: any) {
      const status = err?.code ?? err?.response?.status;
      const msg    = err?.response?.data?.error?.message ?? err.message ?? String(err);

      // 403 with an insufficient-scope / disabled-API message is the reconnect case.
      if (status === 403 || /insufficient|scope|not been used|disabled/i.test(msg)) {
        this.logger.warn(`Google contacts search denied: ${msg}`);
        return this.reconnectHint('google');
      }
      this.logger.error(`Google contacts search failed: ${msg}`);
      return { success: false, provider: 'google', error: msg };
    }
  }

  private mapGooglePerson(person: any): DirectoryMatch | null {
    if (!person) return null;

    const name    = person.names?.[0] ?? {};
    const email   = person.emailAddresses?.[0]?.value;
    const phone   = person.phoneNumbers?.[0]?.value;
    const org     = person.organizations?.[0] ?? {};
    const addr    = person.addresses?.[0] ?? {};

    const firstName = name.givenName  ?? undefined;
    const lastName  = name.familyName ?? undefined;
    const display   = name.displayName
      ?? [firstName, lastName].filter(Boolean).join(' ')
      ?? org.name ?? email ?? 'Unnamed contact';

    if (!firstName && !lastName && !org.name && !email) return null;

    return {
      source:      'google',
      externalId:  person.resourceName ?? '',
      displayName: display,
      firstName,
      lastName,
      companyName: org.name  ?? undefined,
      title:       org.title ?? undefined,
      email,
      phone,
      street1:     addr.streetAddress   ?? undefined,
      street2:     addr.extendedAddress ?? undefined,
      city:        addr.city            ?? undefined,
      state:       addr.region          ?? undefined,
      zip:         addr.postalCode      ?? undefined,
    };
  }

  // ── Microsoft Graph ───────────────────────────────────────────────────────

  private async searchOutlook(conn: EmailConnection, q: string, limit: number): Promise<DirectorySearchResult> {
    if (!this.hasScope(conn, DirectorySearchService.MICROSOFT_SCOPE)) {
      return this.reconnectHint('outlook');
    }

    try {
      const token = decryptToken(conn.accessToken);

      // $search needs ConsistencyLevel: eventual. Graph matches across
      // displayName/email, which is what a person expects from a name query.
      const url = 'https://graph.microsoft.com/v1.0/me/contacts'
        + `?$top=${limit}`
        + `&$select=id,givenName,surname,displayName,companyName,jobTitle,emailAddresses,`
        + `businessPhones,mobilePhone,homeAddress,businessAddress`
        + `&$search=${encodeURIComponent(`"${q}"`)}`;

      const res: any = await providerRead(
        () => fetch(url, {
          headers: {
            Authorization:      `Bearer ${token}`,
            ConsistencyLevel:   'eventual',
            Accept:             'application/json',
          },
        }).then(async r => {
          if (!r.ok) {
            const body = await r.text();
            const e: any = new Error(`Graph ${r.status}: ${body}`);
            e.status = r.status;
            throw e;
          }
          return r.json();
        }),
        'microsoft.graph.contacts.search',
      );

      const matches = (res?.value ?? [])
        .map((c: any) => this.mapGraphContact(c))
        .filter(Boolean) as DirectoryMatch[];

      return { success: true, provider: 'outlook', matches };
    } catch (err: any) {
      const status = err?.status;
      const msg    = err.message ?? String(err);

      if (status === 403 || /insufficient|scope|Authorization_RequestDenied/i.test(msg)) {
        this.logger.warn(`Outlook contacts search denied: ${msg}`);
        return this.reconnectHint('outlook');
      }
      this.logger.error(`Outlook contacts search failed: ${msg}`);
      return { success: false, provider: 'outlook', error: msg };
    }
  }

  private mapGraphContact(c: any): DirectoryMatch | null {
    if (!c) return null;

    const email = c.emailAddresses?.[0]?.address;
    const phone = c.mobilePhone ?? c.businessPhones?.[0];
    const addr  = c.homeAddress?.street ? c.homeAddress : (c.businessAddress ?? {});

    if (!c.givenName && !c.surname && !c.companyName && !email) return null;

    return {
      source:      'outlook',
      externalId:  c.id ?? '',
      displayName: c.displayName
        ?? [c.givenName, c.surname].filter(Boolean).join(' ')
        ?? c.companyName ?? email ?? 'Unnamed contact',
      firstName:   c.givenName   ?? undefined,
      lastName:    c.surname     ?? undefined,
      companyName: c.companyName ?? undefined,
      title:       c.jobTitle    ?? undefined,
      email,
      phone,
      street1:     addr.street          ?? undefined,
      city:        addr.city            ?? undefined,
      state:       addr.state           ?? undefined,
      zip:         addr.postalCode      ?? undefined,
    };
  }
}
