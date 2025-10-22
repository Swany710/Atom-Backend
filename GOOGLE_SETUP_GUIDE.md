# Google Calendar & Gmail Integration Setup Guide

This guide will help you set up Google Calendar and Gmail API access for your Atom AI Assistant.

## Prerequisites

- Google account
- Access to Google Cloud Console
- Node.js project with googleapis installed

---

## Step 1: Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click "Select a project" → "New Project"
3. Enter project name: `Atom AI Assistant`
4. Click "Create"
5. Wait for project creation to complete

---

## Step 2: Enable Required APIs

### Enable Gmail API

1. In Google Cloud Console, navigate to **APIs & Services** → **Library**
2. Search for "Gmail API"
3. Click on "Gmail API"
4. Click **Enable**

### Enable Google Calendar API

1. In the same Library page, search for "Google Calendar API"
2. Click on "Google Calendar API"
3. Click **Enable**

---

## Step 3: Configure OAuth Consent Screen

1. Navigate to **APIs & Services** → **OAuth consent screen**
2. Select **External** user type (or Internal if you have Google Workspace)
3. Click **Create**

### Fill in App Information:

- **App name:** Atom AI Assistant
- **User support email:** your-email@example.com
- **Developer contact email:** your-email@example.com
- Click **Save and Continue**

### Add Scopes:

1. Click **Add or Remove Scopes**
2. Filter and select the following scopes:
   - `https://www.googleapis.com/auth/gmail.send`
   - `https://www.googleapis.com/auth/gmail.readonly`
   - `https://www.googleapis.com/auth/gmail.modify`
   - `https://www.googleapis.com/auth/gmail.compose`
   - `https://www.googleapis.com/auth/calendar`
   - `https://www.googleapis.com/auth/calendar.events`
3. Click **Update** → **Save and Continue**

### Add Test Users (for External apps):

1. Click **Add Users**
2. Add your email address
3. Click **Save and Continue**
4. Click **Back to Dashboard**

---

## Step 4: Create OAuth 2.0 Credentials

1. Navigate to **APIs & Services** → **Credentials**
2. Click **Create Credentials** → **OAuth client ID**
3. Select **Application type:** Web application
4. **Name:** Atom Backend
5. **Authorized redirect URIs:** Click **Add URI**
   - Add: `http://localhost:3000/auth/google/callback`
   - (Add production URL later: `https://your-domain.com/auth/google/callback`)
6. Click **Create**

### Save Your Credentials:

You'll see a popup with:
- **Client ID:** `xxxxx.apps.googleusercontent.com`
- **Client Secret:** `xxxxxxxxxx`

**IMPORTANT:** Copy both values immediately!

---

## Step 5: Configure Environment Variables

1. Open your `.env` file (or create from `.env.example`)
2. Add the credentials:

```env
GOOGLE_CLIENT_ID=xxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxxxxxxxxx
```

3. Save the file

---

## Step 6: Obtain Refresh Token

You need to go through OAuth flow once to get a refresh token.

### Option A: Use the Built-in Auth Endpoints (Recommended)

**Coming Soon:** I'll add OAuth endpoints to the backend.

For now, use Option B.

### Option B: Use a Node.js Script

Create a file `get-google-token.js`:

```javascript
const { google } = require('googleapis');
const readline = require('readline');

const CLIENT_ID = 'your-client-id.apps.googleusercontent.com';
const CLIENT_SECRET = 'your-client-secret';
const REDIRECT_URI = 'http://localhost:3000/auth/google/callback';

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
];

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

// Step 1: Generate auth URL
const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: SCOPES,
  prompt: 'consent', // Force to always return refresh token
});

console.log('\n✅ STEP 1: Authorize this app by visiting this URL:');
console.log('\n', authUrl, '\n');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

rl.question('✅ STEP 2: Enter the authorization code from the redirect URL: ', async (code) => {
  try {
    const { tokens } = await oauth2Client.getToken(code);

    console.log('\n✅ SUCCESS! Your tokens:');
    console.log('\nAdd this to your .env file:');
    console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`);
    console.log('\n');

  } catch (error) {
    console.error('Error getting tokens:', error);
  }
  rl.close();
});
```

Run the script:

```bash
node get-google-token.js
```

Follow the prompts:
1. Visit the URL shown
2. Sign in with your Google account
3. Grant permissions
4. Copy the `code` parameter from the redirect URL
5. Paste it into the terminal
6. Copy the `GOOGLE_REFRESH_TOKEN` to your `.env` file

---

## Step 7: Verify Setup

Add the refresh token to `.env`:

```env
GOOGLE_REFRESH_TOKEN=1//xxxxxxxxxxxxxxxxxxxxxxxxx
```

Restart your backend:

```bash
npm run start:dev
```

Check the logs for:
```
[CalendarService] Google Calendar API initialized successfully
[EmailService] Gmail API initialized successfully
```

---

## Step 8: Test the Integration

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

## Troubleshooting

### "Calendar/Email API not initialized"

**Cause:** Missing or invalid credentials

**Solution:**
1. Check that all three env vars are set: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`
2. Restart the backend after adding credentials
3. Check logs for initialization errors

### "Invalid grant" or "Token expired"

**Cause:** Refresh token is invalid or revoked

**Solution:**
1. Go through OAuth flow again (Step 6)
2. Get a new refresh token
3. Update `.env` file
4. Restart backend

### "Access denied" or "Insufficient permissions"

**Cause:** App doesn't have required scopes

**Solution:**
1. Go to Google Cloud Console → OAuth consent screen
2. Verify all required scopes are added (see Step 3)
3. Revoke previous authorization: https://myaccount.google.com/permissions
4. Go through OAuth flow again with `prompt: 'consent'`

### "Redirect URI mismatch"

**Cause:** The redirect URI in your code doesn't match Google Console

**Solution:**
1. Go to Google Cloud Console → Credentials
2. Edit your OAuth client
3. Ensure `http://localhost:3000/auth/google/callback` is in Authorized redirect URIs
4. Try OAuth flow again

---

## Security Best Practices

### 🔒 Never Commit Credentials

Ensure `.env` is in `.gitignore`:

```bash
echo ".env" >> .gitignore
```

### 🔒 Use Environment Variables in Production

For production deployments:
- Use Railway Secrets, Heroku Config Vars, or AWS Secrets Manager
- Never hardcode credentials
- Rotate tokens periodically

### 🔒 Limit Scopes

Only request the minimum scopes needed:
- If you don't need to send emails, remove `gmail.send`
- If you only need read access, remove modify scopes

### 🔒 Add User Authentication

**CRITICAL:** Before going to production, add user authentication!

Right now, anyone with the API endpoint can access YOUR calendar and email. You must:
1. Implement JWT authentication
2. Store refresh tokens per user in database
3. Verify user owns the sessionId before executing calendar/email actions

See the main code review document for authentication implementation details.

---

## Advanced: Multiple User Support

To support multiple users with their own Google accounts:

### 1. Database Schema

Add a `user_credentials` table:

```sql
CREATE TABLE user_credentials (
  id UUID PRIMARY KEY,
  user_id VARCHAR NOT NULL UNIQUE,
  google_refresh_token TEXT,
  google_access_token TEXT,
  google_token_expiry TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### 2. Per-User Token Management

Store each user's refresh token after they authorize:

```typescript
async saveUserCredentials(userId: string, tokens: any) {
  await this.credentialsRepo.save({
    userId,
    googleRefreshToken: tokens.refresh_token,
    googleAccessToken: tokens.access_token,
    googleTokenExpiry: new Date(tokens.expiry_date),
  });
}
```

### 3. Dynamic OAuth Client

Create OAuth client per request with user's tokens:

```typescript
private async getCalendarForUser(userId: string) {
  const credentials = await this.credentialsRepo.findOne({ userId });

  const oauth2Client = new google.auth.OAuth2(
    this.config.get('GOOGLE_CLIENT_ID'),
    this.config.get('GOOGLE_CLIENT_SECRET'),
    'http://localhost:3000/auth/google/callback'
  );

  oauth2Client.setCredentials({
    refresh_token: credentials.googleRefreshToken,
  });

  return google.calendar({ version: 'v3', auth: oauth2Client });
}
```

---

## Resources

- [Google Calendar API Documentation](https://developers.google.com/calendar/api/v3/reference)
- [Gmail API Documentation](https://developers.google.com/gmail/api/reference/rest)
- [OAuth 2.0 for Web Server Applications](https://developers.google.com/identity/protocols/oauth2/web-server)
- [googleapis npm package](https://www.npmjs.com/package/googleapis)

---

## Summary

You've now set up:
- ✅ Google Cloud Project
- ✅ Gmail API access
- ✅ Google Calendar API access
- ✅ OAuth 2.0 credentials
- ✅ Refresh token for backend access

Your AI assistant can now:
- 📧 Send and read emails
- 📅 View calendar events
- 📅 Create calendar events
- 🔍 Search emails and calendar

Next steps:
1. Add user authentication
2. Implement per-user credential storage
3. Add more advanced features (attachments, recurring events, etc.)
4. Deploy to production with secure credential management
