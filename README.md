# Atom Backend

AI-powered personal assistant backend built with NestJS. Connects to email, calendar, CRM, and an AI chat/voice interface powered by GPT-4o-mini and Whisper.

## Features

- **AI Chat & Voice** — text and voice commands processed by GPT-4o-mini with function calling
- **Email** — Gmail (OAuth2) and Outlook (Microsoft Graph) integration
- **Calendar** — Google Calendar read/write
- **CRM** — contact and interaction tracking via Supabase
- **Conversation Memory** — persistent chat history per user session

## Tech Stack

- NestJS (TypeScript)
- Supabase (PostgreSQL via TypeORM)
- OpenAI API (GPT-4o-mini + Whisper-1)
- Railway deployment / Docker
- N8N workflow automation

## Getting Started

```bash
npm install
cp .env.example .env   # fill in your secrets
npm run start:dev
```

## Environment Variables

Create a `.env` file with the following keys (never commit this file):

```
# OpenAI
OPENAI_API_KEY=

# Supabase / Database
DATABASE_URL=
SUPABASE_URL=
SUPABASE_KEY=

# Email provider: 'gmail' or 'outlook'
EMAIL_PROVIDER=

# Gmail OAuth2
GMAIL_CLIENT_ID=
GMAIL_CLIENT_SECRET=
GMAIL_REDIRECT_URI=

# Microsoft / Outlook OAuth2
MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=
MICROSOFT_TENANT_ID=
MICROSOFT_REDIRECT_URI=

# Google Calendar
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=

# App
PORT=3000
FRONTEND_URL=
JWT_SECRET=
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/v1/ai/health | Health check |
| GET | /api/v1/ai/status | AI service status |
| POST | /api/v1/ai/text-command | Send a text message to the AI |
| POST | /api/v1/ai/voice-command | Upload audio for transcription + AI response |
| GET | /api/v1/ai/conversations/:id | Fetch conversation history |
| DELETE | /api/v1/ai/conversations/:id | Clear conversation history |

## Deployment

Deployed on Railway. Set all environment variables in the Railway dashboard — do not use a `.env` file in production.

```bash
npm run build
npm run start:prod
```
