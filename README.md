# Atom Backend

AI-powered personal assistant backend built with NestJS.

It connects to email, calendar, CRM, and knowledge-base systems, and supports both text and voice interactions.

## Current AI Provider Architecture

> **Important (current behavior in code):**
>
> - **Anthropic Claude** handles reasoning, chat responses, and tool orchestration.
> - **OpenAI** is used for **audio only**:
>   - Whisper (`whisper-1`) for speech-to-text
>   - OpenAI TTS (`tts-1`) for text-to-speech

## Features

- **AI Chat + Voice**
  - Text commands (`/api/v1/ai/text`)
  - Voice commands (`/api/v1/ai/voice` and legacy `/api/v1/ai/voice-command`)
  - Optional TTS audio responses
- **Conversation Memory**
  - Persistent chat history per conversation/user session
- **Email Integrations**
  - Gmail + Outlook OAuth flows
  - Read/search/thread/send/reply/archive/delete/label operations
- **Calendar Integration**
  - Google Calendar read/search/create/update/delete
- **CRM Integration**
  - AccuLynx jobs, contacts, notes, lead creation
- **Knowledge Base**
  - Content CRUD/search endpoints
- **Security + Ops**
  - API-key and JWT bearer auth
  - Request throttling
  - Health + readiness checks
  - Correlation IDs and global exception handling

## Tech Stack

- **Framework:** NestJS (TypeScript)
- **Database:** PostgreSQL (Supabase supported) via TypeORM
- **LLM Orchestration:** Anthropic SDK
- **Audio I/O:** OpenAI SDK (Whisper + TTS)
- **Infra/Deploy:** Railway + Docker
- **Automation:** n8n (optional deployment included in `n8n-deployment/`)

## API Overview

### AI / Conversation

- `GET /api/v1/ai/health`
- `POST /api/v1/ai/text`
- `POST /api/v1/ai/voice`
- `POST /api/v1/ai/voice-command` (legacy alias)
- `POST /api/v1/ai/speak`
- `POST /api/v1/ai/sync-turn`
- `POST /api/v1/ai/realtime-token`
- `GET /api/v1/ai/conversations/:id`
- `DELETE /api/v1/ai/conversations/:id`

### Platform Health

- `GET /health` (liveness)
- `GET /health/ready` (DB readiness)

### Auth

- `POST /auth/register`
- `POST /auth/login`

### Integrations

- Email: `/api/v1/integrations/email/*`
- Calendar: `/api/v1/integrations/calendar/*`
- CRM: `/api/v1/integrations/crm/*`
- Knowledge Base: `/api/v1/knowledge-base/*`

### API Docs

- Swagger UI: `/api/docs` (unless `SWAGGER_ENABLED=false`)

## Environment Variables

Create a `.env` file for local development.

### Core

```bash
PORT=3000
NODE_ENV=development
ALLOWED_ORIGINS=*
API_KEY=your-dev-api-key
OWNER_USER_ID=owner-user-id
JWT_SECRET=replace-with-long-secret
JWT_EXPIRES_IN=7d
```

### AI Providers

```bash
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
```

### Database

```bash
DATABASE_URL=
DATABASE_SSL=false
SUPABASE_URL=
SUPABASE_KEY=
```

### OAuth / Encryption

```bash
TOKEN_ENCRYPTION_KEY=
OAUTH_STATE_SECRET=

# Gmail OAuth
GMAIL_CLIENT_ID=
GMAIL_CLIENT_SECRET=
GMAIL_REDIRECT_URI=

# Outlook OAuth
MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=
MICROSOFT_TENANT_ID=
MICROSOFT_REDIRECT_URI=

# Google Calendar OAuth
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=
```

### Optional

```bash
SWAGGER_ENABLED=true
EMAIL_PROVIDER=gmail
```

## Local Development

```bash
npm install
cp .env.example .env  # if present, otherwise create .env manually
npm run start:dev
```

## Test & Build

```bash
npm test
npm run build
```

## Deployment

### Railway

This repo includes a `railway.json` configured for Railway runtime v2.

```bash
npm run build
npm run start:prod
```

Set production environment variables in Railway (do not rely on `.env` in production).

### Docker

A multi-stage Dockerfile is included:

- **builder stage** compiles TypeScript
- **runner stage** installs production deps and runs `dist/main.js`

## Notes

- The repository also includes an `n8n-deployment/` directory with deployment docs/files for running n8n alongside the backend.
