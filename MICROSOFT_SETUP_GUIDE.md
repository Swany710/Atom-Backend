# Microsoft 365 (Outlook & Calendar) Integration Setup Guide

This guide will help you set up Microsoft Graph API access for Outlook email and Calendar in your Atom AI Assistant.

## Prerequisites

- Microsoft 365 account (work, school, or personal)
- Access to Azure Portal
- Node.js project with @microsoft/microsoft-graph-client installed

---

## Step 1: Register Application in Azure AD

1. Go to [Azure Portal](https://portal.azure.com/)
2. Sign in with your Microsoft account
3. Navigate to **Azure Active Directory**
4. Click **App registrations** in the left sidebar
5. Click **+ New registration**

### Fill in Application Details:

- **Name:** Atom AI Assistant
- **Supported account types:**
  - Choose "Accounts in this organizational directory only" for single-tenant
  - OR "Accounts in any organizational directory" for multi-tenant
  - OR "Personal Microsoft accounts" for consumer accounts
- **Redirect URI:** Leave blank for now (we'll use app-only auth)
- Click **Register**

### Save Your Application Details:

After registration, you'll see:
- **Application (client) ID:** `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`
- **Directory (tenant) ID:** `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`

**IMPORTANT:** Copy both IDs immediately!

---

## Step 2: Create Client Secret

1. In your app registration, click **Certificates & secrets** in the left sidebar
2. Click **+ New client secret**
3. **Description:** Atom Backend Secret
4. **Expires:** Choose expiration (recommended: 24 months)
5. Click **Add**

### Save Your Secret:

You'll see:
- **Value:** `your-secret-value`

**CRITICAL:** Copy this immediately! It won't be shown again.

---

## Step 3: Configure API Permissions

1. In your app registration, click **API permissions** in the left sidebar
2. Click **+ Add a permission**
3. Select **Microsoft Graph**
4. Select **Application permissions** (not Delegated)

### Add Required Permissions:

#### For Calendar:
- `Calendars.Read` - Read calendars in all mailboxes
- `Calendars.ReadWrite` - Read and write calendars in all mailboxes

#### For Email:
- `Mail.Read` - Read mail in all mailboxes
- `Mail.ReadWrite` - Read and write mail in all mailboxes
- `Mail.Send` - Send mail as any user

#### Click **Add permissions**

### Grant Admin Consent:

**IMPORTANT:** This step requires admin privileges.

1. Click **Grant admin consent for [Your Organization]**
2. Click **Yes** to confirm
3. Verify all permissions show "Granted for [Your Organization]"

**If you don't have admin access:**
- Ask your IT administrator to grant consent
- OR use "Delegated permissions" instead (requires different implementation)

---

## Step 4: Configure Environment Variables

1. Open your `.env` file (or create from `.env.example`)
2. Add the credentials from Azure:

```env
MICROSOFT_TENANT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
MICROSOFT_CLIENT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
MICROSOFT_CLIENT_SECRET=your-secret-value
MICROSOFT_USER_EMAIL=your-email@yourcompany.com
```

**Explanation:**
- `MICROSOFT_TENANT_ID`: Directory (tenant) ID from Step 1
- `MICROSOFT_CLIENT_ID`: Application (client) ID from Step 1
- `MICROSOFT_CLIENT_SECRET`: Secret value from Step 2
- `MICROSOFT_USER_EMAIL`: The email address whose calendar/mailbox to access

---

## Step 5: Verify Setup

Restart your backend:

```bash
npm run start:dev
```

Check the logs for:
```
[CalendarService] Microsoft Graph API (Calendar) initialized successfully
[EmailService] Microsoft Graph API (Outlook) initialized successfully
```

---

## Step 6: Test the Integration

### Test Calendar

```bash
curl -X POST http://localhost:3000/api/v1/ai/text-command1 \
  -H "Content-Type: application/json" \
  -d '{
    "message": "What meetings do I have today?",
    "userId": "test-user"
  }'
```

### Test Email

```bash
curl -X POST http://localhost:3000/api/v1/ai/text-command1 \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Send an email to test@example.com saying hello",
    "userId": "test-user"
  }'
```

---

## Authentication Types

### Current Implementation: App-Only Authentication

**What it means:**
- The app accesses ONE mailbox/calendar (specified by `MICROSOFT_USER_EMAIL`)
- Uses "Client Credentials" OAuth flow
- No user interaction required
- Requires admin consent for application permissions

**Good for:**
- Single-user personal assistant
- Service accounts
- Automated processes

**Not good for:**
- Multi-user applications (each user needs their own calendar/email access)

---

### For Multi-User Support: Delegated Permissions

To support multiple users accessing their own calendars/emails:

#### 1. Change API Permissions

Remove "Application permissions" and add "Delegated permissions":
- `Calendars.ReadWrite`
- `Mail.ReadWrite`
- `Mail.Send`
- `User.Read`

#### 2. Update Redirect URI

In Azure portal → App registrations → Authentication:
- Add redirect URI: `http://localhost:3000/auth/microsoft/callback`

#### 3. Implement OAuth Flow Per User

You'll need to:
1. Store each user's refresh token in database
2. Implement OAuth callback endpoint
3. Get user consent for each user
4. Use refresh tokens to access their data

(This requires additional implementation - see "Advanced: Multi-User Support" below)

---

## Troubleshooting

### "Calendar/Email API not initialized"

**Cause:** Missing or invalid credentials

**Solution:**
1. Check that all four env vars are set: `MICROSOFT_TENANT_ID`, `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_USER_EMAIL`
2. Restart the backend after adding credentials
3. Check logs for initialization errors

---

### "Insufficient privileges"

**Cause:** Missing API permissions or admin consent not granted

**Solution:**
1. Go to Azure Portal → App registrations → API permissions
2. Verify all required permissions are added
3. Click "Grant admin consent for [Organization]"
4. Wait 5-10 minutes for permissions to propagate
5. Restart backend

---

### "Invalid client secret"

**Cause:** Secret expired or incorrect

**Solution:**
1. Go to Azure Portal → App registrations → Certificates & secrets
2. Create a new client secret
3. Update `MICROSOFT_CLIENT_SECRET` in `.env`
4. Restart backend

---

### "Mailbox not found" or "User not found"

**Cause:** `MICROSOFT_USER_EMAIL` is incorrect

**Solution:**
1. Verify the email address exists in your organization
2. Use the full email address (e.g., `john@contoso.com`)
3. Ensure the user has a mailbox provisioned

---

### "Access denied" or "Unauthorized"

**Cause:** Tenant mismatch or wrong account type

**Solution:**
1. Verify `MICROSOFT_TENANT_ID` matches your organization
2. If using personal account, ensure app registration supports personal accounts
3. Check that you're using "Application permissions" not "Delegated permissions"

---

## Security Best Practices

### 🔒 Never Commit Credentials

Ensure `.env` is in `.gitignore`:

```bash
echo ".env" >> .gitignore
```

### 🔒 Use Environment Variables in Production

For production deployments:
- Use Railway Secrets, Azure Key Vault, or AWS Secrets Manager
- Never hardcode credentials
- Rotate secrets regularly (before expiration)

### 🔒 Limit Permissions

Only request the minimum permissions needed:
- If you don't need to send emails, remove `Mail.Send`
- If you only need read access, remove `.ReadWrite` permissions

### 🔒 Monitor API Usage

Microsoft Graph has rate limits:
- Monitor your app's API calls
- Implement caching to reduce requests
- Handle throttling errors gracefully

### 🔒 Add User Authentication

**CRITICAL:** Before going to production, add user authentication!

Right now, anyone with the API endpoint can access YOUR calendar and email. You must:
1. Implement JWT authentication
2. Store per-user credentials in database (for multi-user)
3. Verify user owns the sessionId before executing calendar/email actions

See the main code review document for authentication implementation details.

---

## Advanced: Multi-User Support

To support multiple users with their own Microsoft accounts:

### 1. Database Schema

Add a `user_credentials` table:

```sql
CREATE TABLE user_credentials (
  id UUID PRIMARY KEY,
  user_id VARCHAR NOT NULL UNIQUE,
  microsoft_refresh_token TEXT,
  microsoft_access_token TEXT,
  microsoft_token_expiry TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### 2. OAuth Flow Implementation

Create endpoints for user authorization:

```typescript
@Get('auth/microsoft/login')
async loginMicrosoft(@Res() res: Response) {
  const authUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?` +
    `client_id=${clientId}&` +
    `response_type=code&` +
    `redirect_uri=${redirectUri}&` +
    `scope=Calendars.ReadWrite Mail.ReadWrite Mail.Send User.Read offline_access&` +
    `response_mode=query`;

  return res.redirect(authUrl);
}

@Get('auth/microsoft/callback')
async callbackMicrosoft(@Query('code') code: string) {
  // Exchange code for tokens
  const tokenResponse = await axios.post(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
      scope: 'Calendars.ReadWrite Mail.ReadWrite Mail.Send offline_access',
    }
  );

  // Save tokens to database
  await this.credentialsRepo.save({
    userId: extractedUserId,
    microsoftRefreshToken: tokenResponse.data.refresh_token,
    microsoftAccessToken: tokenResponse.data.access_token,
    microsoftTokenExpiry: new Date(Date.now() + tokenResponse.data.expires_in * 1000),
  });

  return { success: true, message: 'Microsoft account connected' };
}
```

### 3. Per-User Graph Client

Modify services to use per-user tokens:

```typescript
private async getGraphClientForUser(userId: string): Promise<Client> {
  const credentials = await this.credentialsRepo.findOne({ userId });

  if (!credentials) {
    throw new Error('User has not connected Microsoft account');
  }

  // Check if token expired
  if (credentials.microsoftTokenExpiry < new Date()) {
    // Refresh token
    const refreshed = await this.refreshAccessToken(credentials.microsoftRefreshToken);
    credentials.microsoftAccessToken = refreshed.access_token;
    credentials.microsoftTokenExpiry = new Date(Date.now() + refreshed.expires_in * 1000);
    await this.credentialsRepo.save(credentials);
  }

  return Client.init({
    authProvider: (done) => {
      done(null, credentials.microsoftAccessToken);
    },
  });
}
```

---

## Microsoft Graph API Limits

Be aware of Microsoft Graph throttling limits:

- **Per-app limits:** 10,000 requests per 10 minutes per tenant
- **Per-mailbox limits:** 10,000 requests per 10 minutes per mailbox
- **Concurrent requests:** Max 4 concurrent requests per mailbox

**Best practices:**
- Implement exponential backoff on 429 errors
- Cache frequently accessed data
- Batch operations when possible

---

## Resources

- [Microsoft Graph API Documentation](https://docs.microsoft.com/en-us/graph/overview)
- [Calendar API Reference](https://docs.microsoft.com/en-us/graph/api/resources/calendar)
- [Mail API Reference](https://docs.microsoft.com/en-us/graph/api/resources/mail-api-overview)
- [Azure AD App Registration](https://docs.microsoft.com/en-us/azure/active-directory/develop/quickstart-register-app)
- [Microsoft Graph SDK for JavaScript](https://github.com/microsoftgraph/msgraph-sdk-javascript)

---

## Summary

You've now set up:
- ✅ Azure AD application registration
- ✅ Microsoft Graph API permissions
- ✅ Client credentials for app-only authentication
- ✅ Outlook email access
- ✅ Calendar access

Your AI assistant can now:
- 📧 Send and read Outlook emails
- 📅 View Outlook calendar events
- 📅 Create calendar events with Teams meeting links
- 🔍 Search emails and calendar

Next steps:
1. Implement user authentication (CRITICAL before production)
2. Add per-user credential storage for multi-user support
3. Implement error handling and retry logic
4. Add more advanced features (attachments, recurring events, etc.)
5. Deploy to production with secure credential management
