# Registering Atom in Azure (Microsoft / Outlook)

Everything below is taken from Atom's actual code, not from a generic template.
Where a value must match exactly, it says so.

---

## Before you start: the one thing people get wrong

**Atom serves exactly ONE OAuth callback, shared by Google and Microsoft:**

```
<your-backend-origin>/email/oauth/callback
```

`EmailOAuthController` is `@Controller('email/oauth')` with `@Get('callback')`, and `main.ts` sets
no global prefix — so that is the literal path. The provider is recovered from the signed `state`
parameter, not from the URL, which is why there is no separate Outlook path.

So for a Railway deployment it is:

```
https://<your-backend>.up.railway.app/email/oauth/callback
```

and for local development:

```
http://localhost:3000/email/oauth/callback
```

Older versions of `.env.example` documented `/integrations/email/outlook/callback`. **That route has
never existed.** If you register it, consent will succeed and then dump you on a 404 with no useful
error. Corrected in the same commit as this doc.

---

## 1. Create the app registration

**Microsoft Entra admin center** → **Applications** → **App registrations** → **New registration**

| Field | Value |
|---|---|
| Name | `Atom` (anything — user-facing on the consent screen) |
| Supported account types | See below |
| Redirect URI | **Web** → `https://<your-backend>/email/oauth/callback` |

Make sure the redirect URI platform is **Web**, not "Single-page application". Atom exchanges the
code server-side with a client secret; SPA registrations use PKCE and will reject that exchange.

### Which account type?

Your config has `MICROSOFT_TENANT_ID=common`, which means the app authenticates both work/school
*and* personal Microsoft accounts. Match the registration to it:

- **`common`** (your current default) → choose **"Accounts in any organizational directory and
  personal Microsoft accounts"**.
- If everyone is on one company tenant, set `MICROSOFT_TENANT_ID` to that tenant's GUID and choose
  **"Accounts in this organizational directory only"**. More restrictive, and it removes the
  personal-account consent path.

The tenant ID in your env and the account type on the registration have to agree, or you'll get
`AADSTS50194` / `AADSTS700016` at sign-in.

---

## 2. Add the API permissions

**Your app** → **API permissions** → **Add a permission** → **Microsoft Graph** →
**Delegated permissions**

Add all four. Delegated, *not* Application — Atom acts as you, reading your mailbox. Application
permissions would grant access to the entire tenant's mail and contacts, which is far more than
this needs.

| Permission | Why Atom needs it |
|---|---|
| `Mail.ReadWrite` | Read, search, archive, delete, mark read |
| `Mail.Send` | Send and reply |
| `Calendars.ReadWrite` | View and manage calendar events |
| `Contacts.Read` | Search your contacts for the address-book import (read-only) |
| `offline_access` | Refresh tokens — without it the connection dies in ~1 hour |
| `User.Read` | Resolve which mailbox got connected |

`offline_access` and `User.Read` may already be listed by default. Add them if not.

Then, if **"Grant admin consent for &lt;tenant&gt;"** is available, click it. Not always required —
Microsoft supports dynamic consent, so Atom can request these at runtime — but if your tenant
restricts user consent, sign-in fails until an admin grants them.

> There is **no "enable this API" step** on the Microsoft side. That's a Google Cloud concept
> (People API). Microsoft Graph is always available; permissions are the only gate.

---

## 3. Create a client secret

**Your app** → **Certificates & secrets** → **Client secrets** → **New client secret**

Copy the **Value** immediately — it is shown once and is unrecoverable afterwards. The "Secret ID"
is not the secret.

Set an expiry you'll actually remember. When it lapses, Outlook stops working with an auth error
that looks nothing like "your secret expired".

---

## 4. Fill in the environment variables

From **Overview** on the app registration:

```bash
MICROSOFT_CLIENT_ID=<Application (client) ID>
MICROSOFT_CLIENT_SECRET=<the secret VALUE from step 3>
MICROSOFT_TENANT_ID=common          # or your tenant GUID, matching step 1
MICROSOFT_REDIRECT_URI=https://<your-backend>/email/oauth/callback
```

`MICROSOFT_SCOPES` can stay empty — the defaults in `email-oauth.service.ts` already include all
six permissions above. Only set it to *narrow* what Atom asks for.

Redeploy after setting these. `buildMicrosoftAuthUrl()` reads them at request time, but the process
needs to pick up the new environment.

---

## 5. Connect and verify

1. Open Atom → **Settings → Connections** → **Connect Outlook**
2. Sign in and accept the consent screen — it should now list mail, calendar **and contacts**
3. Verify contacts specifically: **Contacts panel → "From my email"** → search a name you know is
   there

If the scope didn't land you'll get Atom's 🔐 reconnect message rather than a cryptic failure —
`DirectorySearchService` checks the granted scope stored at connect time and detects a 403 /
insufficient-scope response from Graph.

---

## Troubleshooting

| Symptom | Cause |
|---|---|
| 404 after consent | Redirect URI doesn't match the served route. It is `/email/oauth/callback` — see the top of this doc. |
| `AADSTS50011` redirect URI mismatch | The URI in Azure differs from `MICROSOFT_REDIRECT_URI` — they must be byte-identical, including scheme, trailing slash and case. |
| `AADSTS65001` consent required | Admin consent not granted, and your tenant restricts user consent. Do step 2's final action. |
| `AADSTS7000215` invalid client secret | You copied the Secret **ID** instead of the **Value**, or it expired. |
| `AADSTS50194` / `AADSTS700016` | Account type on the registration disagrees with `MICROSOFT_TENANT_ID`. |
| Connects, then breaks about an hour later | `offline_access` missing — no refresh token was issued. |
| Mail and calendar work, contacts say "reconnect" | Registration predates `Contacts.Read`. Add the permission, then **reconnect the mailbox** — a refresh token only carries the scopes it was issued with and cannot be upgraded in place. |

---

## The equivalent for Google, for reference

Google needs the same redirect URI (`/email/oauth/callback`) in **Credentials → OAuth 2.0 Client
IDs → Authorised redirect URIs**, plus one extra step Microsoft has no analogue for: the
**People API must be enabled** under APIs & Services → Library. The `contacts.readonly` scope alone
is not sufficient — without the API enabled you get a 403 reading
`People API has not been used in project … before or it is disabled`.
