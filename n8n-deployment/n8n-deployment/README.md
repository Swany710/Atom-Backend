# N8N Deployment on Railway for Atom AI Assistant

This directory contains all configuration files needed to deploy N8N on Railway as part of your Atom AI personal assistant application.

## 📋 Prerequisites

Before deploying, ensure you have:

- ✅ Railway account with CLI installed
- ✅ GitHub repository for version control
- ✅ Supabase project with connection credentials
- ✅ Google Cloud Console project (for Gmail/Calendar OAuth)
- ✅ OpenAI API key (if planning AI workflows)

## 🚀 Quick Deployment Steps

### 1. Create N8N Service on Railway

#### Option A: Using Railway Dashboard (Recommended for first-time)

1. Go to [Railway Dashboard](https://railway.app/dashboard)
2. Click on your existing project (where Atom backend is deployed)
3. Click **"+ New Service"** → **"Empty Service"**
4. Name it: `atom-n8n`
5. Click on the service → **"Settings"** tab

#### Option B: Using Railway CLI

```bash
# Navigate to your n8n-deployment directory
cd n8n-deployment

# Login to Railway
railway login

# Link to your existing project
railway link

# Create new service
railway service create atom-n8n

# Link this directory to the service
railway service
```

### 2. Configure GitHub Integration

1. In Railway service settings, go to **"Source"** section
2. Click **"Connect Repo"**
3. Select your Atom repository
4. Set **Root Directory** to: `n8n-deployment` (or wherever you placed these files)
5. Railway will auto-detect the Dockerfile

### 3. Set Environment Variables

In Railway service → **"Variables"** tab, add these (refer to `.env.example` for all variables):

#### Critical Variables (Set These First):

```bash
# Core Configuration
N8N_PORT=5678
N8N_PROTOCOL=https
N8N_HOST=${{RAILWAY_PUBLIC_DOMAIN}}
WEBHOOK_URL=https://${{RAILWAY_PUBLIC_DOMAIN}}

# Database (Use your Supabase connection)
DB_TYPE=postgresdb
DB_POSTGRESDB_CONNECTION_URL=postgresql://postgres.[ref]:[password]@[host]:6543/postgres
DB_POSTGRESDB_SCHEMA=n8n

# Security (CHANGE THESE!)
N8N_BASIC_AUTH_ACTIVE=true
N8N_BASIC_AUTH_USER=admin
N8N_BASIC_AUTH_PASSWORD=your-secure-password-here

# Encryption (Generate with: openssl rand -base64 32)
N8N_ENCRYPTION_KEY=your-encryption-key-here

# Execution
EXECUTIONS_PROCESS=main
EXECUTIONS_DATA_SAVE_ON_ERROR=all
EXECUTIONS_DATA_SAVE_ON_SUCCESS=all

# Timezone
GENERIC_TIMEZONE=America/Chicago
TIMEZONE=America/Chicago

# CORS (Add your frontend/backend domains)
N8N_CORS_ENABLED=true
N8N_CORS_ORIGINS=https://your-frontend.up.railway.app,https://your-backend.up.railway.app
```

### 4. Generate Required Secrets

```bash
# Generate encryption key
openssl rand -base64 32

# Generate secure password
openssl rand -base64 24
```

### 5. Deploy

Railway will automatically deploy when you push to GitHub. Or trigger manual deploy:

```bash
# Using Railway CLI
railway up

# Or in Dashboard: Click "Deploy" button
```

### 6. Verify Deployment

1. Check deployment logs in Railway dashboard
2. Once deployed, Railway will provide a public URL: `https://atom-n8n-production-xxxx.up.railway.app`
3. Access N8N UI: Navigate to your Railway URL
4. Login with your `N8N_BASIC_AUTH_USER` and `N8N_BASIC_AUTH_PASSWORD`

## 🔧 Post-Deployment Configuration

### 1. Set Up Supabase N8N Schema

N8N needs its own schema in your Supabase database:

```sql
-- Connect to your Supabase SQL Editor
-- Run this to create N8N schema:

CREATE SCHEMA IF NOT EXISTS n8n;

-- Grant permissions to your Supabase user
GRANT ALL PRIVILEGES ON SCHEMA n8n TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA n8n TO postgres;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA n8n TO postgres;

-- N8N will auto-create its tables on first run
```

### 2. Configure Google OAuth (Gmail & Calendar)

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable APIs:
   - Gmail API
   - Google Calendar API
4. Create OAuth 2.0 credentials:
   - **Application type**: Web application
   - **Authorized redirect URIs**: `https://[your-n8n-domain].up.railway.app/rest/oauth2-credential/callback`
5. Copy Client ID and Client Secret
6. Add to Railway N8N service environment variables:
   ```
   GOOGLE_CLIENT_ID=your-client-id
   GOOGLE_CLIENT_SECRET=your-client-secret
   ```

### 3. Configure N8N Credentials in UI

After logging into N8N:

1. Click **"Credentials"** in left sidebar
2. Click **"Add Credential"**
3. Add these credentials:
   - **Gmail**: Select "OAuth2" → Use your Google Client ID/Secret
   - **Google Calendar**: Same OAuth2 credentials
   - **OpenAI**: Add your API key (if using AI nodes)
   - **HTTP Request**: For calling your NestJS backend

## 🔗 Integration with NestJS Backend

### Update Your NestJS Backend

Add these environment variables to your Atom backend service in Railway:

```bash
N8N_WEBHOOK_URL=https://[your-n8n-domain].up.railway.app
N8N_API_KEY=[generate-api-key-in-n8n]
```

### Create N8N Service in NestJS

You'll create a service to call N8N webhooks (we'll do this in next step).

## 📊 Health Monitoring

### Check N8N Status

```bash
# Health endpoint
curl https://[your-n8n-domain].up.railway.app/healthz

# Should return: {"status":"ok"}
```

### Railway Logs

Monitor logs in Railway dashboard for any issues:
- Click on N8N service
- Go to "Deployments" tab
- Click on latest deployment
- View logs in real-time

## 🔐 Security Checklist

- [ ] Changed default N8N_BASIC_AUTH_PASSWORD
- [ ] Generated strong N8N_ENCRYPTION_KEY
- [ ] Configured CORS with specific domains (not *)
- [ ] Using HTTPS (Railway provides this automatically)
- [ ] Supabase connection uses connection pooler (port 6543)
- [ ] Google OAuth credentials restricted to your domain
- [ ] N8N UI protected with basic auth

## 🐛 Troubleshooting

### Issue: N8N won't start

**Solution**: Check logs for database connection errors. Verify Supabase credentials.

### Issue: Webhooks not accessible

**Solution**: 
1. Check `WEBHOOK_URL` and `N8N_HOST` are set correctly
2. Verify CORS settings include your backend domain
3. Check Railway public networking is enabled

### Issue: Google OAuth fails

**Solution**:
1. Verify redirect URI in Google Console matches exactly: `https://[domain]/rest/oauth2-credential/callback`
2. Ensure Gmail and Calendar APIs are enabled
3. Check OAuth consent screen is configured

### Issue: Database connection timeout

**Solution**:
1. Use Supabase connection pooler (port 6543, not 5432)
2. Check connection string format
3. Verify n8n schema exists and has proper permissions

## 📚 Next Steps

After successful deployment:

1. ✅ **Create your first workflow**: "Send Email via Gmail"
2. ✅ **Set up webhook endpoint**: For NestJS to trigger workflows
3. ✅ **Test integration**: Send test email from your Atom app
4. ✅ **Build calendar workflows**: Create/update events
5. ✅ **Add error handling**: Workflow error notifications

## 🔗 Useful Links

- [N8N Documentation](https://docs.n8n.io/)
- [Railway Documentation](https://docs.railway.app/)
- [N8N Community Nodes](https://www.npmjs.com/search?q=n8n-nodes-)
- [Supabase Connection Pooling](https://supabase.com/docs/guides/database/connecting-to-postgres#connection-pooler)

## 💾 Backup Strategy

N8N workflows are stored in your Supabase database. To backup:

```sql
-- Export N8N workflows
SELECT * FROM n8n.workflow_entity;

-- Export credentials (encrypted)
SELECT * FROM n8n.credentials_entity;
```

Consider enabling Supabase automatic backups for production.

---

**Status**: Ready for deployment ✅

Once deployed, proceed to creating your first N8N workflow for email automation.
