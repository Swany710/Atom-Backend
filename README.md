# Atom AI Assistant Backend

An intelligent AI personal assistant powered by OpenAI that manages your calendar, emails, and more through natural conversation.

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/new/template)

---

## 🎯 Features

- 🤖 **AI-Powered Conversation** - Natural language understanding with OpenAI GPT-4
- 📅 **Calendar Management** - View and create Outlook calendar events with Teams meeting links
- 📧 **Email Integration** - Send, read, and manage Outlook emails
- 🎤 **Voice Commands** - Process voice input via OpenAI Whisper
- 💬 **Context Memory** - Maintains conversation history across sessions
- 🔧 **Function Calling** - AI intelligently selects which tools to use

---

## 🚀 Quick Deploy to Railway

**Fastest way to get started (10 minutes):**

1. **Click the Railway button above** or follow [`QUICK_START.md`](QUICK_START.md)
2. **Add PostgreSQL** database in Railway
3. **Set environment variables** (see below)
4. **Test your API** endpoint

**Detailed guide:** See [`RAILWAY_DEPLOYMENT.md`](RAILWAY_DEPLOYMENT.md)

---

## 📋 Prerequisites

- **Railway Account** - [Sign up here](https://railway.app) ($5/month free credit)
- **OpenAI API Key** - [Get here](https://platform.openai.com/api-keys)
- **Microsoft 365 Account** - For calendar and email
- **Azure AD App** - Follow [`MICROSOFT_SETUP_GUIDE.md`](MICROSOFT_SETUP_GUIDE.md)

---

## ⚙️ Environment Variables

### Required Variables

```env
# Database (auto-set by Railway)
DATABASE_URL=postgresql://...

# OpenAI
OPENAI_API_KEY=sk-your-openai-key

# Microsoft 365 (from Azure Portal)
MICROSOFT_TENANT_ID=your-tenant-id
MICROSOFT_CLIENT_ID=your-application-id
MICROSOFT_CLIENT_SECRET=your-client-secret
MICROSOFT_USER_EMAIL=you@yourcompany.com

# Server
PORT=3000  # Auto-set by Railway
NODE_ENV=production
```

See [`.env.example`](.env.example) for full configuration.

---

## 📖 Documentation

| Guide | Purpose |
|-------|---------|
| [`QUICK_START.md`](QUICK_START.md) | Deploy to Railway in 10 minutes |
| [`RAILWAY_DEPLOYMENT.md`](RAILWAY_DEPLOYMENT.md) | Detailed Railway deployment guide |
| [`MICROSOFT_SETUP_GUIDE.md`](MICROSOFT_SETUP_GUIDE.md) | Set up Azure AD for Microsoft 365 |
| [`FUNCTION_CALLING_GUIDE.md`](FUNCTION_CALLING_GUIDE.md) | How the AI function calling works |
| [`TESTING_GUIDE.md`](TESTING_GUIDE.md) | Test calendar and email features |

---

## 🧪 Testing Your Deployment

Once deployed to Railway, test your endpoints:

### Health Check
```bash
curl https://your-app.up.railway.app/api/v1/ai/health
```

### Test Calendar
```bash
curl -X POST https://your-app.up.railway.app/api/v1/ai/text-command1 \
  -H "Content-Type: application/json" \
  -d '{
    "message": "What meetings do I have today?",
    "userId": "test-user"
  }'
```

### Test Email
```bash
curl -X POST https://your-app.up.railway.app/api/v1/ai/text-command1 \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Send an email to john@example.com",
    "userId": "test-user"
  }'
```

### Test Voice
```bash
curl -X POST https://your-app.up.railway.app/api/v1/ai/voice-command1 \
  -F "audio=@recording.mp3" \
  -F "userId=test-user"
```

---

## 🏗️ Architecture

### Tech Stack

- **Framework:** NestJS 10
- **Database:** PostgreSQL with TypeORM
- **AI:** OpenAI GPT-4.1-mini + Whisper
- **Integrations:** Microsoft Graph API
- **Deployment:** Railway.app

### Architecture Flow

```
User Request (Text/Voice)
    ↓
AI Voice Service
    ↓
OpenAI Function Calling
    ├→ Calendar Service → Microsoft Graph Calendar API
    ├→ Email Service → Microsoft Graph Mail API
    ├→ Knowledge Base (coming soon)
    └→ CRM Integration (coming soon)
    ↓
Natural Language Response
```

---

## 🛠️ Local Development

### Install Dependencies
```bash
npm install
```

### Set Up Environment
```bash
cp .env.example .env
# Edit .env with your credentials
```

### Run Database Migration
```bash
# TypeORM auto-creates tables on first run (synchronize: true)
```

### Start Development Server
```bash
npm run start:dev
```

Server runs on `http://localhost:3000`

---

## 📦 Project Structure

```
Atom-Backend/
├── src/
│   ├── ai/                      # AI & function calling
│   │   ├── ai-voice.service.ts  # Main AI orchestrator
│   │   └── chat-memory.entity.ts
│   ├── integrations/
│   │   ├── calendar/            # Outlook Calendar
│   │   │   └── calendar.service.ts
│   │   └── email/               # Outlook Email
│   │       └── email.service.ts
│   ├── conversation/            # Conversation management
│   └── main.ts
├── docs/                        # Documentation
├── railway.json                 # Railway config
├── Dockerfile                   # Container config
└── package.json
```

---

## 🔐 Security Notes

**⚠️ IMPORTANT:** This is a development/testing version. Before production:

- [ ] Implement JWT authentication
- [ ] Add rate limiting
- [ ] Enable input validation
- [ ] Use per-user credential storage
- [ ] Implement RBAC (Role-Based Access Control)
- [ ] Add audit logging
- [ ] Enable HTTPS only
- [ ] Set up monitoring (Sentry, etc.)

See the code review document for detailed security recommendations.

---

## 💰 Cost Estimates (Railway)

### Free Tier ($5/month credit)
- **Compute:** ~500 hours/month
- **Database:** Generous free tier
- **Bandwidth:** Sufficient for testing

### With Auto-Sleep Enabled
- Sleeps after 30 min inactivity
- Wakes on first request
- Can last entire month on free tier

### Estimated Monthly Cost (Active Testing)
- **Hobby Plan:** ~$5-10/month
- **Production:** ~$20-50/month depending on traffic

---

## 🚢 Deployment Options

### Railway (Recommended for Testing)
- ✅ Easy setup
- ✅ Free tier
- ✅ Auto-deploys
- ✅ Managed database
- 📄 Guide: [`RAILWAY_DEPLOYMENT.md`](RAILWAY_DEPLOYMENT.md)

### Other Platforms
- **Heroku:** Similar to Railway
- **AWS:** More control, higher cost
- **Azure:** Good Microsoft integration
- **DigitalOcean:** App Platform

---

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

---

## 📝 Roadmap

### ✅ Completed
- [x] OpenAI GPT-4 integration
- [x] Function calling framework
- [x] Microsoft Calendar integration
- [x] Outlook email integration
- [x] Voice transcription (Whisper)
- [x] Conversation memory
- [x] Railway deployment

### 🚧 In Progress
- [ ] User authentication (JWT)
- [ ] RAG knowledge base integration
- [ ] CRM integration (Salesforce/HubSpot)

### 🔮 Future
- [ ] Multi-user support
- [ ] File attachments
- [ ] Recurring calendar events
- [ ] Email templates
- [ ] Analytics dashboard
- [ ] Mobile app support

---

## 📄 License

This project is private and proprietary.

---

## 🆘 Support

- **Documentation:** See `docs/` folder
- **Issues:** Create GitHub issue
- **Railway Support:** [Railway Discord](https://discord.gg/railway)
- **Microsoft Graph:** [Microsoft Docs](https://docs.microsoft.com/en-us/graph/)

---

## 🙏 Acknowledgments

- **OpenAI** - GPT-4 and Whisper APIs
- **Microsoft** - Graph API for Calendar and Email
- **NestJS** - Amazing backend framework
- **Railway** - Simple and affordable deployment

---

**Built with ❤️ for construction professionals and beyond**

---

## Quick Links

- [Deploy Now](https://railway.app/new/template)
- [Quick Start Guide](QUICK_START.md)
- [Microsoft Setup](MICROSOFT_SETUP_GUIDE.md)
- [Testing Guide](TESTING_GUIDE.md)

**Happy building! 🚀**
