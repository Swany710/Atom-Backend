# Quick Start - Deploy to Railway in 10 Minutes

Get your Atom AI Assistant running on Railway quickly!

---

## ⚡ Fast Track Deployment

### 1. Prerequisites (2 minutes)

✅ GitHub account
✅ Railway account → [Sign up here](https://railway.app)
✅ OpenAI API key → [Get it here](https://platform.openai.com/api-keys)
✅ Microsoft 365 credentials → See `MICROSOFT_SETUP_GUIDE.md`

---

### 2. Deploy to Railway (3 minutes)

```bash
# Option A: Use Railway Button (Easiest)
# Click the button in README or visit:
# https://railway.app/new/template?template=<your-template>

# Option B: Manual Deploy
1. Go to https://railway.app
2. Login with GitHub
3. Click "New Project"
4. Select "Deploy from GitHub repo"
5. Choose: Swany710/Atom-Backend
6. Wait for auto-deploy to complete ✅
```

---

### 3. Add Database (1 minute)

```bash
1. In Railway project, click "+ New"
2. Select "Database" → "Add PostgreSQL"
3. Done! DATABASE_URL is auto-set ✅
```

---

### 4. Set Environment Variables (3 minutes)

Click **Variables** tab and add:

```env
# OpenAI (REQUIRED)
OPENAI_API_KEY=sk-your-key-here

# Microsoft 365 (REQUIRED - from Azure Portal)
MICROSOFT_TENANT_ID=your-tenant-id
MICROSOFT_CLIENT_ID=your-client-id
MICROSOFT_CLIENT_SECRET=your-secret
MICROSOFT_USER_EMAIL=you@yourcompany.com

# Optional
NODE_ENV=production
```

💡 **Tip:** Don't set `PORT` - Railway sets this automatically!

---

### 5. Generate Public URL (1 minute)

```bash
1. Go to "Settings" tab
2. Under "Networking", click "Generate Domain"
3. Copy URL: https://your-app.up.railway.app ✅
```

---

### 6. Test It! (2 minutes)

```bash
# Test health
curl https://your-app.up.railway.app/api/v1/ai/health

# Test AI
curl -X POST https://your-app.up.railway.app/api/v1/ai/text-command1 \
  -H "Content-Type: application/json" \
  -d '{"message": "What meetings do I have today?", "userId": "test"}'
```

---

## ✅ You're Live!

Your AI assistant is now running on Railway!

**What you have:**
- ✅ API endpoint: `https://your-app.up.railway.app`
- ✅ PostgreSQL database (managed)
- ✅ Auto-deploys on git push
- ✅ $5/month free credit
- ✅ Auto-sleep to save costs

---

## 🎯 Next Steps

### Immediate:
- [ ] Test calendar: "What's on my calendar?"
- [ ] Test email: "Send a test email"
- [ ] Check logs for errors
- [ ] Monitor costs

### Soon:
- [ ] Connect your frontend app
- [ ] Add custom domain
- [ ] Implement user authentication
- [ ] Add error monitoring

### Later:
- [ ] Add RAG knowledge base
- [ ] Add CRM integration
- [ ] Scale up as needed

---

## 💰 Cost Tracking

**Free tier includes:**
- $5 credit/month
- ~500 hours of compute
- Generous database storage

**Monitor usage:**
1. Go to Account Settings
2. Click "Usage"
3. See current spend

**Enable auto-sleep to save:**
Edit `railway.json`:
```json
{
  "deploy": {
    "sleepApplication": true  // Sleeps after 30 min inactivity
  }
}
```

---

## 🚨 Troubleshooting

### App won't start?
→ Check Deploy Logs for errors
→ Verify all env vars are set
→ Check DATABASE_URL exists

### Microsoft Graph errors?
→ Verify Azure AD credentials
→ Check admin consent granted
→ See `MICROSOFT_SETUP_GUIDE.md`

### Out of credits?
→ Upgrade to Hobby plan ($5/month)
→ Enable auto-sleep
→ Optimize usage

---

## 📚 Full Guides

- **Detailed Railway Setup:** `RAILWAY_DEPLOYMENT.md`
- **Microsoft 365 Setup:** `MICROSOFT_SETUP_GUIDE.md`
- **Testing Guide:** `TESTING_GUIDE.md`
- **Function Calling:** `FUNCTION_CALLING_GUIDE.md`

---

## 🆘 Need Help?

- Railway Discord: https://discord.gg/railway
- Railway Docs: https://docs.railway.app
- GitHub Issues: Create issue in your repo

---

**That's it! You're ready to go! 🚀**
