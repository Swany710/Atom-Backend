# Atom Multi-Tenancy (Org Layer) Design

Status: DRAFT — approved design becomes migrations 1700000000006+
Scope: backend only (Atom-Backend). Frontend changes limited to signup flow + JWT handling.

---

## 1. Current state (audited 2026-07-16)

| Table | Tenant scoping today | Problem when selling |
|---|---|---|
| `users` | none — flat user list | no company grouping, no roles |
| `email_connections` | `userId` (bare varchar, no FK) | OK per-user, but no org rollup |
| `chat_memory` | `sessionId` only — **no userId** | can't prove isolation; cleanup impossible per customer |
| `knowledge_base_entries` | **NONE — fully global** | every customer sees every other customer's KB. Blocker. |
| `pending_actions` | `userId` | fine, needs FK + org |
| `scheduled_tasks` | `userId` | fine, needs FK + org |
| `user_memory` | `userId` | fine, needs FK + org |
| AccuLynx | **single global `ACCULYNX_API_KEY` env var** | all customers would hit YOUR CRM. Blocker. |

No foreign keys exist anywhere. JWT payload = `{ sub, email }`.

---

## 2. Tenancy model decision

**One org per user (org column on membership), single-org membership.**

Customers are contracting companies; each employee belongs to exactly one company.
A join table (multi-org membership) adds complexity Atom doesn't need yet — the
schema below still allows migrating to a join table later without breaking IDs.

### New tables

```sql
CREATE TABLE organizations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(255) NOT NULL,
  slug        VARCHAR(100) UNIQUE NOT NULL,        -- for subdomains later
  plan        VARCHAR(50)  NOT NULL DEFAULT 'beta', -- beta | starter | pro
  is_active   BOOLEAN      NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- org-level integration credentials (AccuLynx today, others later)
CREATE TABLE integration_credentials (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider    VARCHAR(50) NOT NULL,                -- 'acculynx'
  credentials TEXT NOT NULL,                       -- encrypted JSON via crypto.util
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, provider)
);
```

### Users table additions

```sql
ALTER TABLE users
  ADD COLUMN org_id UUID REFERENCES organizations(id),
  ADD COLUMN role   VARCHAR(20) NOT NULL DEFAULT 'member';  -- owner | admin | member
```

Roles:
- **owner** — billing, delete org, manage integrations, invite/remove users
- **admin** — manage integrations, invite users, manage org KB
- **member** — use the assistant, own connections/conversations only

### Tenant columns on existing tables

Add `org_id UUID REFERENCES organizations(id)` + composite index to:
`email_connections`, `pending_actions`, `scheduled_tasks`, `user_memory`.

`chat_memory` additionally gets `user_id UUID REFERENCES users(id)` (currently
missing entirely). Index: `(org_id, user_id, session_id)`.

Also convert existing bare-varchar `userId` columns to real FKs
(`REFERENCES users(id) ON DELETE CASCADE`) after backfill validation.

### Knowledge base — special case

```sql
ALTER TABLE knowledge_base_entries
  ADD COLUMN org_id UUID NULL REFERENCES organizations(id) ON DELETE CASCADE;
```

`org_id = NULL` means **shared library** (the 48-product spec library you're
ingesting — every tenant can read it, only you can write it). Non-null = private
org KB. Every KB query becomes:

```sql
WHERE (org_id = :currentOrg OR org_id IS NULL) AND "isActive" = true
```

This gives you a product feature for free: "comes preloaded with a manufacturer
spec library."

---

## 3. Auth & request context changes

### JWT payload

```ts
interface JwtPayload {
  sub: string;      // user UUID
  email: string;
  org: string;      // org UUID   ← new
  role: string;     // owner|admin|member ← new
}
```

Existing tokens (no `org` claim) are rejected → beta users just log in again.

### Registration flow

`POST /auth/register` gains `companyName`. Creates org + user as `owner` in one
transaction. New endpoint `POST /orgs/invite` (owner/admin) issues invite tokens;
invited users register into the existing org as `member`.

### Guard / request context

`JwtAuthGuard` sets `req.atomUserId`, `req.atomOrgId`, `req.atomRole`.
Add a lightweight `TenantContextService` using `AsyncLocalStorage` so services
don't need org_id threaded through every method signature. Every repository
query in every service adds the org predicate — **no query ships without it**.

New `RolesGuard` + `@Roles('owner','admin')` decorator for integration-credential
and invite endpoints.

### AccuLynx service

`AcculynxService` stops reading `ACCULYNX_API_KEY` from env. It resolves the key
per-request from `integration_credentials` (decrypt via crypto.util, cache in
memory keyed by org_id with short TTL). Env var remains as fallback ONLY for
your own org during transition, then delete it.

---

## 4. Defense in depth: Supabase RLS (phase 2)

Backend connects as one DB role, so RLS uses a per-transaction GUC:

```sql
ALTER TABLE knowledge_base_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON knowledge_base_entries
  USING (org_id = current_setting('app.org_id')::uuid OR org_id IS NULL);
```

A TypeORM interceptor runs `SET LOCAL app.org_id = :org` at transaction start.
This catches any future query that forgets the org predicate. Ship after the
app-layer scoping is stable — RLS misconfiguration failures are silent empty
results and painful to debug while the schema is still moving.

---

## 5. Migration & rollout plan (sequential)

1. **Migration 006 — schema**: create `organizations`, `integration_credentials`;
   add nullable `org_id`/`role`/`user_id` columns + indexes. Nullable = deploys
   safely against live data.
2. **Migration 007 — backfill**: create one org per existing user
   (`name = displayName || email`, user becomes `owner`); stamp org_id onto all
   their rows; chat_memory user_id backfilled by joining session ownership.
   Orphan rows (sessionIds matching no user) flagged, not deleted.
3. **Migration 008 — tighten**: set `org_id` NOT NULL on user-owned tables
   (NOT on knowledge_base_entries), add the FKs.
4. **Code — auth**: JWT payload, register-with-company, guard, TenantContext.
5. **Code — service scoping**: module by module (email → conversations →
   pending-actions → scheduled-tasks → memory → KB → AccuLynx). Each module's
   existing tests get an org-isolation test: user in org B must get 404/empty
   for org A's data.
6. **AccuLynx per-org credentials** + settings UI hookup.
7. **RLS phase 2** once 1–6 is verified in staging.

Rollback: migrations 006/007 are additive; 008 is the only destructive-ish step
and runs only after staging validation.

---

## 6. Explicitly out of scope (later)

- Billing/Stripe (hangs off `organizations.plan`)
- Multi-org membership join table
- Per-org subdomains (slug column reserves the door)
- SOC 2 controls (audit module already logs; add org_id to audit events in step 5)
