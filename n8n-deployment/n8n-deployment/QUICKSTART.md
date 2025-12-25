# 🚀 N8N Railway Quick Start Guide

## TL;DR - Fastest Path to Deployment

### Step 1: Prepare Supabase (2 minutes)

```bash
# 1. Login to Supabase Dashboard
# 2. Go to SQL Editor
# 3. Copy and run the contents of supabase-init.sql
# 4. Verify you see "n8n" schema created
```

### Step 2: Generate Secrets (1 minute)

```bash
# Generate encryption key
openssl rand -base64 32
# Copy output → This is your N8N_ENCRYPTION_KEY

# Generate admin password
openssl rand -base64 24
# Copy output → This is your N8N_BASIC_AUTH_PASSWORD
```

### Step 3: Deploy on Railway (5 minutes)

#### Using Railway Dashboard (Easiest):

1. **Go to Railway**: https://railway.app/dashboard
2. **Select your Atom project** (where your backend is)
3. **Create new service**:
   - Click "+ New Service" → "Empty Service"
   - Name: `atom-n8n`
4. **Connect GitHub**:
   - Settings → Source → Connect Repo
   - Select your Atom repository
   - Root Directory: `n8n-deployment` (where these files are)
5. **Set Environment Variables** (Settings → Variables):

```bash
# Copy-paste these (replace values in brackets):

N8N_PORT=5678
N8N_PROTOCOL=https
N8N_HOST=${{RAILWAY_PUBLIC_DOMAIN}}
WEBHOOK_URL=https://${{RAILWAY_PUBLIC_DOMAIN}}

DB_TYPE=postgresdb
DB_POSTGRESDB_CONNECTION_URL=postgresql://postgres.[your-ref]:[password]@[host]:6543/postgres
DB_POSTGRESDB_SCHEMA=n8n

N8N_BASIC_AUTH_ACTIVE=true
N8N_BASIC_AUTH_USER=admin
N8N_BASIC_AUTH_PASSWORD=[paste-generated-password]

N8N_ENCRYPTION_KEY=[paste-generated-key]

EXECUTIONS_PROCESS=main
EXECUTIONS_DATA_SAVE_ON_ERROR=all
EXECUTIONS_DATA_SAVE_ON_SUCCESS=all

GENERIC_TIMEZONE=America/Chicago

N8N_CORS_ENABLED=true
N8N_CORS_ORIGINS=https://[your-frontend].up.railway.app,https://[your-backend].up.railway.app
```

6. **Deploy**:
   - Railway auto-deploys when you save variables
   - Watch logs: Click service → Deployments → Latest → View Logs

### Step 4: Access N8N (2 minutes)

1. **Get your URL**: Railway provides it after deployment
   - Format: `https://atom-n8n-production-xxxx.up.railway.app`
2. **Login**:
   - Username: `admin` (or what you set)
   - Password: [your generated password]
3. **Verify**: You should see N8N dashboard

### Step 5: Configure Google OAuth (5 minutes)

1. **Google Cloud Console**: https://console.cloud.google.com/
2. **Create/Select Project**: Name it "Atom AI Assistant"
3. **Enable APIs**:
   - APIs & Services → Enable APIs → Search "Gmail API" → Enable
   - Search "Google Calendar API" → Enable
4. **Create OAuth Credentials**:
   - APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID
   - Application type: Web application
   - Name: "N8N Atom"
   - Authorized redirect URIs: `https://[your-n8n-domain].up.railway.app/rest/oauth2-credential/callback`
   - Click Create → Copy Client ID and Client Secret
5. **Add to Railway**:
   - Go back to Railway → N8N service → Variables
   - Add:
     ```
     GOOGLE_CLIENT_ID=[your-client-id]
     GOOGLE_CLIENT_SECRET=[your-client-secret]
     ```
   - Service will auto-redeploy

### Step 6: Add Google Credentials in N8N (3 minutes)

1. **In N8N UI**: Click "Credentials" (left sidebar)
2. **Add Gmail**:
   - Click "Add Credential"
   - Search "Gmail OAuth2 API"
   - Select it
   - It will auto-fill from your environment variables
   - Click "Connect" → Follow Google OAuth flow
   - Save
3. **Add Google Calendar**:
   - Same process as Gmail
   - Search "Google Calendar OAuth2 API"
   - Connect and authorize

---

## ✅ You're Done!

**N8N is now running and connected to Google services.**

### Quick Test:

1. In N8N, click "Workflows" → "Create Workflow"
2. Add node: "Gmail" → "Send Email"
3. Select your Gmail credential
4. Fill in test email details
5. Click "Execute Node"
6. Check your inbox!

---

## 🎯 Next Steps

You're now ready to:
- Create workflows for calendar management
- Set up webhook endpoints for NestJS integration
- Build email automation workflows

Continue with the main README.md for:
- Creating production workflows
- Integrating with your NestJS backend
- Building complex multi-step automations

---

## 🐛 Common Issues

**Can't access N8N UI?**
- Check Railway logs for startup errors
- Verify N8N_PORT is 5678
- Ensure public networking is enabled in Railway

**Database connection failed?**
- Use Supabase connection pooler (port 6543, not 5432)
- Verify connection string format
- Check n8n schema exists in Supabase

**Google OAuth not working?**
- Verify redirect URI exactly matches: `https://[domain]/rest/oauth2-credential/callback`
- Check APIs are enabled in Google Console
- Ensure OAuth consent screen is configured

**Webhooks returning 404?**
- Check WEBHOOK_URL and N8N_HOST variables
- Verify CORS includes your backend domain
- Test health endpoint: `curl https://[domain]/healthz`

---

## 📞 Need Help?

Check the detailed README.md for comprehensive troubleshooting and configuration options.

**Estimated Total Time**: ~20 minutes from start to working N8N instance
