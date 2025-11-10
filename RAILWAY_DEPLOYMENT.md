# Railway Deployment Guide - Atom AI Assistant

This guide will help you deploy your Atom AI Assistant backend to Railway.app for cost-effective testing.

## Why Railway?

- **Free tier:** $5/month of usage credit
- **Auto-sleep:** Apps sleep after inactivity (saves money)
- **Easy deployment:** Git-based deploys
- **Managed PostgreSQL:** Built-in database
- **Environment variables:** Secure credential management

---

## Prerequisites

- GitHub account with your code pushed
- Railway account (sign up at https://railway.app)
- Microsoft Azure credentials (from MICROSOFT_SETUP_GUIDE.md)
- OpenAI API key

---

## Step 1: Create Railway Account

1. Go to [Railway.app](https://railway.app)
2. Click **Login** → **Login with GitHub**
3. Authorize Railway to access your repositories
4. You'll get **$5 free credit per month** on the trial plan

---

## Step 2: Create New Project

1. Click **New Project**
2. Select **Deploy from GitHub repo**
3. Choose your repository: `Swany710/Atom-Backend`
4. Railway will automatically detect it's a Node.js app

---

## Step 3: Add PostgreSQL Database

Your app needs a database. Railway makes this easy:

1. In your project, click **New**
2. Select **Database** → **Add PostgreSQL**
3. Railway automatically creates a database and sets `DATABASE_URL`
4. No manual configuration needed!

---

## Step 4: Configure Environment Variables

Click on your service → **Variables** tab

### Required Variables:

```env
# Database (automatically set by Railway)
DATABASE_URL=<automatically-set>

# OpenAI
OPENAI_API_KEY=sk-your-openai-api-key

# Microsoft 365
MICROSOFT_TENANT_ID=your-tenant-id
MICROSOFT_CLIENT_ID=your-application-id
MICROSOFT_CLIENT_SECRET=your-client-secret
MICROSOFT_USER_EMAIL=your-email@yourcompany.com

# Server (optional - Railway sets PORT automatically)
NODE_ENV=production
```

### How to Add Variables:

1. Click **Variables** tab
2. Click **+ New Variable**
3. Enter name and value
4. Click **Add**
5. Repeat for each variable

**IMPORTANT:** Don't set `PORT` - Railway sets this automatically!

---

## Step 5: Configure Build & Deploy

Railway should auto-detect your configuration from `railway.json`, but verify:

1. Click **Settings** tab
2. Under **Build & Deploy**:
   - **Builder:** NIXPACKS (auto-detected)
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm run start:prod`
3. Click **Save**

---

## Step 6: Deploy!

Railway auto-deploys when you push to GitHub:

1. **Initial deploy:** Already started when you created the project
2. **Watch the logs:** Click **Deployments** to see build progress
3. **Wait for success:** Look for "Build successful" and "Deployment live"

---

## Step 7: Get Your Deployment URL

1. Go to **Settings** tab
2. Under **Networking**, click **Generate Domain**
3. Railway creates a public URL: `your-app-name.up.railway.app`
4. Copy this URL - this is your API endpoint!

---

## Step 8: Verify Deployment

### Check Health Endpoint

```bash
curl https://your-app-name.up.railway.app/api/v1/ai/health
```

**Expected response:**
```json
{
  "status": "healthy",
  "service": "Atom Backend API",
  "timestamp": "2025-10-22T..."
}
```

### Check Status

```bash
curl https://your-app-name.up.railway.app/api/v1/ai/status
```

**Expected response:**
```json
{
  "status": "available",
  "aiService": "online",
  "timestamp": "2025-10-22T..."
}
```

---

## Step 9: Test AI Features

### Test Calendar

```bash
curl -X POST https://your-app-name.up.railway.app/api/v1/ai/text-command1 \
  -H "Content-Type: application/json" \
  -d '{
    "message": "What meetings do I have today?",
    "userId": "test-user"
  }'
```

### Test Email

```bash
curl -X POST https://your-app-name.up.railway.app/api/v1/ai/text-command1 \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Send a test email to yourself",
    "userId": "test-user"
  }'
```

---

## Step 10: Monitor Usage & Costs

### View Logs

1. Click your service
2. Click **Deployments** tab
3. Click latest deployment
4. View real-time logs

**Look for:**
```
[CalendarService] Microsoft Graph API (Calendar) initialized successfully
[EmailService] Microsoft Graph API (Outlook) initialized successfully
✅ Atom App Module loaded - Ready for frontend connection
🚀 Atom Backend running on port 3000
```

### Check Costs

1. Go to **Account Settings** (top right)
2. Click **Usage**
3. See your current usage against $5 free credit

**Cost-saving tips:**
- Railway sleeps apps after 30 min inactivity (free tier)
- Only active time counts against your credit
- Database is always on but has generous free tier

---

## Updating Your Deployment

Railway auto-deploys on every git push:

```bash
# Make changes to your code
git add .
git commit -m "your changes"
git push origin main  # or your branch name

# Railway automatically:
# 1. Detects the push
# 2. Builds your app
# 3. Deploys the new version
# 4. Zero-downtime deployment!
```

---

## Environment Variable Management

### Add New Variable

1. Go to **Variables** tab
2. Click **+ New Variable**
3. Enter name and value
4. App automatically restarts with new variable

### Update Existing Variable

1. Go to **Variables** tab
2. Click on variable to edit
3. Update value
4. App automatically restarts

### Secure Variables

Railway variables are:
- ✅ Encrypted at rest
- ✅ Only accessible to your project
- ✅ Never exposed in logs
- ✅ Can be shared across services

---

## Troubleshooting

### Build Fails

**Error:** `npm install failed`

**Solution:**
1. Check **Deployments** → **Build Logs**
2. Verify `package.json` is valid
3. Ensure all dependencies are listed
4. Try deploying again (sometimes transient failures)

---

### App Crashes on Start

**Error:** `Application failed to respond`

**Solution:**
1. Check **Deployments** → **Deploy Logs**
2. Look for error messages
3. Common issues:
   - Missing environment variables
   - Database connection failed
   - Port binding issue (make sure you don't set PORT manually)

---

### Database Connection Error

**Error:** `Connection to database failed`

**Solution:**
1. Verify PostgreSQL service is running (green indicator)
2. Check that `DATABASE_URL` is set automatically
3. Restart your service
4. Check database logs for issues

---

### Microsoft Graph API Errors

**Error:** `Calendar/Email API not initialized`

**Solution:**
1. Verify all Microsoft env vars are set:
   - `MICROSOFT_TENANT_ID`
   - `MICROSOFT_CLIENT_ID`
   - `MICROSOFT_CLIENT_SECRET`
   - `MICROSOFT_USER_EMAIL`
2. Check Deploy Logs for initialization messages
3. Verify Azure AD app has correct permissions
4. Ensure admin consent was granted

---

### OpenAI API Errors

**Error:** `Invalid API key`

**Solution:**
1. Verify `OPENAI_API_KEY` starts with `sk-`
2. Check key is valid at https://platform.openai.com/api-keys
3. Ensure no extra spaces in the variable
4. Regenerate key if needed

---

## Cost Optimization Tips

### 1. Use Hobby Plan Efficiently

**Free tier includes:**
- $5 credit per month
- Unlimited projects
- Auto-sleep after inactivity
- Community support

**What counts against credit:**
- Active compute time (when app is running)
- Database storage (generous free tier)
- Outbound bandwidth

### 2. Enable Auto-Sleep

Already enabled in `railway.json`:
```json
{
  "deploy": {
    "sleepApplication": false  // Change to true for testing
  }
}
```

**To enable:**
1. Edit `railway.json`
2. Set `sleepApplication: true`
3. Commit and push
4. App will sleep after 30 minutes of inactivity

### 3. Monitor Usage

- Check usage daily: **Settings** → **Usage**
- Set up budget alerts (Pro plan feature)
- Delete old deployments: **Deployments** → **⋯** → **Remove**

### 4. Use Volume for Large Files

If you store files (not applicable for your current app):
- Use Railway Volumes instead of ephemeral storage
- Cheaper than compute resources

---

## Scaling on Railway

### Current Configuration

From `railway.json`:
```json
{
  "deploy": {
    "numReplicas": 1,  // Single instance
    "multiRegionConfig": {
      "us-east4-eqdc4a": {
        "numReplicas": 1  // US East region
      }
    }
  }
}
```

### To Scale Up (When Needed)

1. Edit `railway.json`:
```json
{
  "deploy": {
    "numReplicas": 2  // 2 instances for high availability
  }
}
```

2. Commit and push
3. Railway automatically scales

**Cost impact:** 2x compute costs (but still very affordable)

---

## CI/CD with Railway

Railway provides automatic CI/CD:

### Automatic Deploys

- ✅ Push to GitHub → Auto-deploy
- ✅ Build logs available
- ✅ Rollback to previous deployment
- ✅ Zero-downtime deploys

### Manual Deploys

If you want to control when deploys happen:

1. Go to **Settings** → **Service**
2. Under **Deploys**, toggle **Auto Deploy** to OFF
3. Manually trigger deploys from Railway dashboard

### Deployment Notifications

1. Go to **Settings** → **Integrations**
2. Connect to Slack, Discord, or webhooks
3. Get notified on successful/failed deploys

---

## Database Backups

Railway doesn't auto-backup on free tier. To backup manually:

```bash
# Install Railway CLI
npm i -g @railway/cli

# Login
railway login

# Link to your project
railway link

# Backup database
railway run pg_dump $DATABASE_URL > backup.sql

# Restore database
railway run psql $DATABASE_URL < backup.sql
```

---

## Production Checklist

Before going live with real users:

- [ ] Set `NODE_ENV=production` in Railway
- [ ] Verify all environment variables are set
- [ ] Test all endpoints (health, status, text, voice)
- [ ] Check logs for any errors
- [ ] Set up custom domain (Settings → Networking)
- [ ] Enable error monitoring (Sentry integration)
- [ ] Set up database backups
- [ ] Configure CORS for your frontend domain
- [ ] Implement rate limiting
- [ ] Add user authentication (CRITICAL!)
- [ ] Review Azure AD permissions
- [ ] Test Microsoft 365 integration
- [ ] Set budget alerts

---

## Custom Domain (Optional)

To use your own domain:

1. Go to **Settings** → **Networking**
2. Click **Custom Domain**
3. Enter your domain (e.g., `api.yourdomain.com`)
4. Add CNAME record to your DNS:
   - **Name:** `api`
   - **Value:** `your-app-name.up.railway.app`
5. Wait for DNS propagation (5-60 minutes)
6. Railway auto-provisions SSL certificate

---

## Railway CLI (Optional but Useful)

Install Railway CLI for local testing:

```bash
# Install
npm i -g @railway/cli

# Login
railway login

# Link to project
railway link

# Run locally with Railway env vars
railway run npm run start:dev

# Open project dashboard
railway open

# View logs
railway logs
```

---

## Support & Resources

- **Railway Docs:** https://docs.railway.app
- **Railway Discord:** https://discord.gg/railway
- **Railway Status:** https://status.railway.app
- **Pricing:** https://railway.app/pricing

---

## Summary

You've now deployed your Atom AI Assistant to Railway! 🎉

**What you get:**
- ✅ Public API endpoint
- ✅ Managed PostgreSQL database
- ✅ Auto-deploys on git push
- ✅ Secure environment variables
- ✅ $5/month free credit
- ✅ Auto-sleep to save costs

**Next steps:**
1. Test all features
2. Monitor costs
3. Connect your frontend
4. Add authentication
5. Scale when needed

**Your API is live at:**
```
https://your-app-name.up.railway.app
```

Happy testing! 🚀
