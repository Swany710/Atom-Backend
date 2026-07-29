# Atom — System Overview

**What it is, what each part does, and how it's secured.**
Written 29 July 2026, against backend `894d75ba` and frontend `204592b`.

---

## 1. What Atom is

Atom is a **voice-driven personal assistant for a roofing and contracting business**. You talk to
it; it reads your email, works your calendar, moves jobs through AccuLynx, answers product-spec
questions from your own document library, takes notes, and sets reminders — then confirms with you
before it changes anything.

The design goal is *one operator, hands full, on a roof.* That's why voice is the primary interface
and why every write action stops for confirmation.

### The one-line version of the architecture

```
  You (voice or text)
        │
        ▼
  ┌─────────────┐   speech ⇄ text    ┌────────────┐
  │  Frontend   │◄──────────────────►│ ElevenLabs │
  │ (static JS) │                    └────────────┘
  └──────┬──────┘
         │ HTTPS via same-origin proxy
         ▼
  ┌──────────────────────────────────────────────┐
  │  Backend (NestJS on Railway)                 │
  │                                              │
  │   Claude ── decides what to do, calls tools  │
  │     │                                        │
  │     ├── Gmail / Outlook                      │
  │     ├── Google Calendar / Outlook Calendar   │
  │     ├── AccuLynx CRM                         │
  │     ├── Knowledge base (pgvector search)     │
  │     ├── Notes + scheduled tasks              │
  │     └── every write → confirmation first     │
  └──────────────────┬───────────────────────────┘
                     ▼
            Supabase / PostgreSQL
```

### Provider split — a hard rule

| Job | Provider | Notes |
|---|---|---|
| Speech → text, text → speech | **ElevenLabs** | The only speech provider. No fallback, by design. |
| Reasoning, tool selection, orchestration | **Anthropic (Claude)** | Everything Atom *decides* goes through here. |
| Embeddings | **OpenAI** | `text-embedding-3-small`, knowledge base only. Nothing else. |

Nothing crosses those lines. This is enforced in code comments at each boundary specifically so a
future change doesn't quietly re-add a cross-vendor fallback.

---

## 2. What you can actually ask it to do

Atom has **37 tools**. Grouped by what they touch:

**Email (14)** — `read_emails`, `search_emails`, `get_email`, `get_thread`, `send_email`,
`reply_email`, `delete_email`, `archive_email`, `mark_email_read`, `list_email_labels`, plus
provider auth/status. Works against **Gmail or Outlook** — resolved per user, so different people in
the org can be on different mail systems.

**Calendar (5)** — `check_calendar`, `search_calendar`, `create_calendar_event`,
`update_calendar_event`, `delete_calendar_event`. Google or Outlook. Defaults to Central Time.

**AccuLynx CRM (11)** — the deepest integration:

- `get_crm_jobs`, `get_crm_job`, `crm_get_contacts`, `crm_my_pipeline` — read
- `crm_create_lead` — full lead creation (trades, work type, category, source, insurance fields)
- `crm_update_job_details` / `crm_update_insurance` / `crm_update_adjuster` / `crm_update_homeowner`
  — each maps to one tab of the job file
- `crm_job_checkup` — "is this job ready to submit?" reports what's missing
- `crm_job_advance` — what's needed to move a job to the next milestone
- `crm_insurance_companies` — the account's carrier dropdown (Atom never writes free-text carriers)
- `crm_add_note`, `crm_email_job_contact` — write to the job file

**Knowledge base (2)** — `search_knowledge_base`, `get_general_info`. Semantic search over your
uploaded manufacturer spec sheets, SOPs, and company docs.

**Notes & tasks (5)** — `create_note`, `list_notes`, `delete_note`, `schedule_task`,
`list_scheduled_tasks`, `cancel_scheduled_task`.

**Contacts — Atom's own address book (5)** — `search_contacts`, `create_contact`,
`update_contact`, `delete_contact`, `search_mailbox_contacts`.

This is deliberately **separate from AccuLynx contacts**. AccuLynx contacts belong to jobs and are
gated by the CRM access policy; these are the company's own people — suppliers, subs, adjusters,
referrals. Org-scoped, so the whole company shares one book. Phone and address are stored free-text
because AccuLynx's requirements (exactly ten digits, numeric state IDs) are fine for a CRM record
and hostile to "just save this number".

`search_mailbox_contacts` searches your connected Gmail or Outlook contacts **read-only** — it finds
people, it never saves them. Atom shows what it found and asks which to add, then calls
`create_contact` (confirmation-gated) per person you pick. It will not bulk-import, and that's
deliberate: Google's "other contacts" holds every address auto-saved from mail you've ever sent, and
dumping that in would bury the people who matter.

> **Requires a one-time reconnect.** Gmail contacts are not in the Gmail API — they live in the
> **Google People API**, which needs the `contacts.readonly` scope *and* that API enabled on your
> Google Cloud project. Outlook needs `Contacts.Read`. A refresh token only carries the scopes it
> was issued with, so existing connections cannot be upgraded in place. Atom detects the missing
> permission and tells you to reconnect rather than reporting a generic failure.

### Things worth knowing about the CRM integration

- **Trade types replace, they don't append.** Saying "add siding" to a roofing job must pass
  `["Roofing","Siding"]` — passing just `["Siding"]` wipes roofing. Atom is instructed on this.
- **Atom cannot move a job between milestones or buckets.** AccuLynx has no API for it. Atom will
  tell you what's missing and where to click, but never claim it made the move.
- **Atom cannot see job documents.** No API lists them. It will walk you through the checklist and
  ask you to confirm each upload — it will never state that a document is present.
- **AccuLynx cannot send email.** Verified against their full v2 endpoint index. `crm_email_job_contact`
  sends through *your* mailbox and posts a record onto the job file. That distinction is preserved in
  every message Atom gives you.

---

## 3. Section-by-section breakdown

### Frontend — `Swany710/atom-frontend`

A **static JS app** (no framework) served by a small Express server. Deliberately simple.

| File | What it does |
|---|---|
| `server.js` | Express host + **authenticating reverse proxy** to the backend. Also sets CSP. |
| `public/js/api.js` | The only place `fetch` is called. Base URL, timeouts, JWT injection, error shape, 401 handling, safe-read retry. |
| `public/js/voice.js` | Live voice: mic → VAD turn detection → `/ai/voice` → `/ai/speak` → repeat. Barge-in, waveform, dictation mode. |
| `public/js/chat.js` | Text chat, conversation rendering, status line, confirm/cancel cards. |
| `public/js/panels.js` | The feature panels — jobs pipeline, new lead form, connections, admin/team. |
| `public/js/boot.js` | Login screen, app bootstrap, role-based nav gating. |
| `public/js/dispatch.js` | Maps `data-action` attributes to functions (exists so CSP can forbid inline scripts). |

**Three input modes:** Live (hands-free voice), Text, and Dictate (browser speech-to-text into the
box so you can edit before sending).

**How live voice works now.** The mic opens once per session and taps a *silent* analyser. Energy-based
voice-activity detection decides when you started and stopped talking; the turn is posted to
`/ai/voice`; the reply is spoken back; the mic reopens. Talking over Atom cuts him off. There's a
watchdog so a stalled audio element can never leave the loop waiting with the mic closed.

### Backend — `Swany710/Atom-Backend`

NestJS + TypeORM on Railway, PostgreSQL via Supabase.

| Module | Responsibility |
|---|---|
| **voice** | All AI entry points: `/ai/text`, `/ai/voice`, `/ai/speak`, conversation history. Thin facade → orchestrator. |
| **claude** | `ClaudeOrchestratorService` — the brain. System prompt, tool-use loop, streaming, prompt caching. |
| **tools** | Tool *definitions* (what Claude may call) and tool *execution* (what actually happens), split deliberately. |
| **transcription** | ElevenLabs Scribe (STT) and ElevenLabs TTS. |
| **conversations** | Chat history persistence + the sanitiser that keeps message shape API-valid. |
| **memory** | Longer-term user memory in three layers (profile / episodic / tasks), injected into the prompt. |
| **pending-actions** | The confirmation system. Every write passes through here. |
| **integrations/email** | Gmail + Outlook transports behind a common interface, with a per-user router. |
| **integrations/calendar** | Google + Outlook calendars. |
| **integrations/crm** | AccuLynx client (~1,600 lines) + the per-user access policy. |
| **knowledge-base** | Document ingest, chunking, OpenAI embeddings, pgvector cosine search. |
| **notes / scheduled-tasks** | Quick notes; future actions run by a per-minute cron. |
| **contacts** | Atom's own address book + read-only search of the user's Gmail/Outlook contacts. |
| **organizations** | Multi-tenancy: orgs, members, roles, invites, AccuLynx user mapping. |
| **auth** | Invite-only registration, login, JWT issuance. |
| **admin** | Owner/admin dashboards: stats, users, pending actions, activity, invite codes. |
| **audit** | Append-only record of every write action. |
| **guards / filters / middleware** | Auth guard, roles guard, global exception filter, correlation IDs. |

### The two systems that make Atom safe to use

**1. The pending-action confirmation system.**

No write ever executes on the first call. When Claude calls a write tool without a confirmation
token, the backend instead creates a `pending_actions` record and returns a summary for you to
approve. When you say yes, Claude re-calls the same tool *with* the token.

The claim is an **atomic compare-and-swap** — a single conditional `UPDATE ... WHERE
id/userId/status='pending'/expiresAt > now`. That one statement is the only thing that flips
pending → confirmed, so a double-tapped "yes" or a client retry cannot execute an action twice.
Confirmations expire after **5 minutes**.

Gated tools: `send_email`, `reply_email`, `delete_email`, `archive_email`, all three calendar
mutations, `crm_add_note`, `crm_email_job_contact`, `crm_create_lead`, all four `crm_update_*`, and
`delete_note`. Saving a personal note is deliberately *not* gated — it saves instantly, by design.

**2. The UPPA guardrail.**

You are a **contractor, not a licensed public adjuster**. Unlicensed Public Adjusting laws prohibit
contractors from negotiating, adjusting, or advising on claims for a homeowner. Atom will not:

- draft or send anything that negotiates a claim, argues coverage, demands supplement approval, or
  interprets policy language
- advise a homeowner on what their policy covers, what to say to their insurer, or whether to accept
  a settlement
- present the company as representing the homeowner in the claim

It **will**: document damage factually, provide manufacturer specs and repair scopes for your own
work, schedule inspections, record claim numbers and dates of loss (record-keeping is fine), and
communicate factual project information.

This lives in the system prompt *and* is repeated at the tool level on `crm_email_job_contact`,
because that's the tool that puts words in front of a homeowner.

---

## 4. Security

### Authentication

Two modes, one guard (`ApiKeyGuard`):

- **JWT** — normal user login. Carries `sub` (user), `org`, `role`. 24-hour expiry. Tokens minted
  before the org layer existed are rejected, forcing a fresh login with a properly scoped token.
- **API key** — service/owner credential. Compared with `crypto.timingSafeEqual` over SHA-256
  hashes, so neither timing nor length leaks.

Registration is **invite-only**. Passwords are bcrypt-hashed. Login is throttled to 5/min and
registration to 10/min, on top of a global 120/min limit.

### The proxy — a subtle but important fix

The frontend proxies API calls so the browser never holds the backend API key. The catch: that key
is an **owner-level credential**. Previously every anonymous request got signed with it, meaning
anyone who could reach the frontend had full access to the owner's email, calendar, and CRM without
logging in.

Now only three paths pass anonymously — `/auth/login`, `/auth/register`, `/health` — and everything
else returns 401 until the browser presents a JWT. Logged-in requests forward the user's own token
and are scoped to them.

### Multi-tenancy and CRM scoping

Every request carries org context (via `AsyncLocalStorage`, so services don't have to pass the
request around). Roles are `owner`, `admin`, `member`.

CRM access deserves its own note, because **the AccuLynx API key is account-scoped — AccuLynx itself
cannot restrict what a user sees.** So the backend does it:

- **owner / admin** → all jobs, read and write
- **member, mapped** to an AccuLynx user → only jobs where they're an assigned rep
- **member, unmapped** → **no CRM access at all** (fails closed)

The key never leaves the backend, so this is a hard gate, not advisory.

### Data protection

- OAuth tokens and integration credentials encrypted at rest with **AES-256-GCM** (96-bit IV, auth
  tag verified). Key is `TOKEN_ENCRYPTION_KEY`, validated as exactly 64 hex chars at boot.
- Database TLS. With `DATABASE_TLS_STRICT=true` the certificate is actually verified; without it you
  get encrypted-but-unverified plus a loud warning.
- Row-level security enabled on `notes`, `invite_codes`, `organizations`, `integration_credentials`.
- Conversation sessions are ownership-checked — a session ID must start with the requesting user's
  ID, so you can't read or clear someone else's history.

### Browser-side hardening

Content-Security-Policy with **no `unsafe-inline` for scripts**. Every inline `<script>` was moved to
a file and every inline `onclick` became a `data-action` handled by `dispatch.js` — so injected
markup cannot execute. Plus `frame-ancestors: none`, `object-src: none`, and Helmet's standard
headers on both tiers. All rendered message content is HTML-escaped.

### Auditing

Every write action is recorded: what, who, which system, a sanitised snapshot of the arguments, the
result, and a correlation ID that ties it back to the originating request.

### Fail-safes worth knowing about

- **Tool loop cap** — max 12 tool round-trips per turn, so a stuck tool can't spin indefinitely
  burning API spend.
- **Provider timeouts** — every external call has a hard wall-clock timeout. Reads retry; **writes
  never retry**, so a slow send can't become two sends.
- **Truncation is reported** — if a reply hits the token ceiling, Atom says so instead of stopping
  mid-sentence and looking finished.
- **Capability reporting** — boot logs which AI features are configured, and `/health/ready` returns
  a `capabilities` block. A missing key is visible immediately instead of at the first voice request.

---

## 5. Data model

| Table | Holds |
|---|---|
| `organizations` | Tenants. |
| `users` | Accounts, bcrypt hashes, org membership, role, AccuLynx user mapping. |
| `invite_codes` | Invite-only registration. |
| `chat_memory` | Conversation history (newest 40 rows loaded per turn). |
| `user_memory` | Longer-term memory in three layers. |
| `pending_actions` | Confirmation records. 5-minute expiry. |
| `notes` | Personal quick notes. |
| `contacts` | Atom's own address book — org-scoped, RLS on. `source`/`externalId` track mailbox imports so a re-import updates instead of duplicating. |
| `scheduled_tasks` | Future actions — `reminder` and `send_email`, run by a per-minute cron. |
| `knowledge_base_entries` | Document chunks + 1536-dim embedding vectors. |
| `email_connections` / `integration_credentials` | Encrypted OAuth tokens and API keys. |

Twelve migrations, run automatically in production.

---

## 6. Testing

| Suite | Covers |
|---|---|
| `conversation-memory.sanitize.spec.ts` | Message-shape contract + a seeded 3,000-case fuzz. |
| `crm-email-job-contact.spec.ts` | The email tool's failure paths — 10 cases. |
| `pending-action.service.spec.ts` | The confirmation system, including atomic-claim semantics. |
| `api-key.guard.spec.ts` | Auth modes. |
| `env.validation.spec.ts` | Boot-time config validation. |
| `auth.service.spec.ts` | Registration and login. |
| `voice.controller.spec.ts` / `voice.service.spec.ts` | Voice endpoints and pipeline. |
| `tests/live-voice.harness.js` (frontend) | 15 cases against the real `voice.js` — turn-taking, barge-in, deadlocks. |

Run: `npx jest` in the backend, `npm run test:voice` in the frontend.

Coverage is honest but thin in places — the AccuLynx client and the tool-execution layer are the
biggest untested surfaces.

---

## 7. Where the sharp edges are

Being straight about what I'd watch:

1. **No CI.** Everything is verified by hand. A `npm test` on push would be the single highest-value
   addition, plus a daily smoke test that round-trips a real audio clip — that's what would have
   caught the OpenAI model shutdown in May instead of you finding it in July.
2. **The 40-row history cliff.** Past 40 messages Atom simply forgets, mid-project, with no warning.
   Summarising older turns instead of dropping them is the fix.
3. **JWT in `localStorage`.** Standard practice, still XSS-reachable. The CSP is the real mitigation
   here, and it's solid.
4. **Connection pool at 3–5.** Fine for now, tight for a growing team.
5. **Rate limiting is global, not per-user.** One person's runaway loop can starve everyone else.
6. **A worker process doesn't exit cleanly after tests** — likely a DB pool or timer left open.
   Harmless locally, will hang CI.
7. **The AccuLynx API is the binding constraint on a lot of ideas.** No email sending, no message
   reading, no milestone moves, no document listing, no task API. Worth checking their endpoint index
   before designing anything CRM-shaped.

---

## 8. Deploying

Required in Railway:

```bash
ELEVENLABS_API_KEY=...   # all speech I/O — no fallback
ANTHROPIC_API_KEY=...    # all reasoning
OPENAI_API_KEY=...       # embeddings only
DATABASE_URL=...         # Supabase
JWT_SECRET=...           # 32+ chars
API_KEY=...              # 32+ chars, owner-level
TOKEN_ENCRYPTION_KEY=... # exactly 64 hex chars
OAUTH_STATE_SECRET=...   # 32+ chars
ALLOWED_ORIGINS=...      # never "*" in production
OWNER_USER_ID=...
GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REDIRECT_URI
```

Boot refuses to start if any are missing or malformed. Then check `curl <backend>/health/ready` —
anything `false` in the `capabilities` block is a feature that will fail at runtime.
