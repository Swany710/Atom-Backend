# CRM Access Policy — Per-User Job Scoping for AccuLynx

**Date:** 2026-07-19
**Status:** Approved design, queued behind org-layer completion (TENANCY-DESIGN.md)
**Decision:** Hardcoded policy (not per-org configurable). Admin-set identity mapping. Fail closed.

## Problem

The AccuLynx API key is account-scoped — AccuLynx has no per-user API keys or OAuth, so every Atom user's CRM calls run with full account visibility. Within a company, a sales rep using Atom could read/update any job, even ones they can't see inside AccuLynx itself. Atom login emails can't be trusted as identity (users may register with personal emails), and self-entered AccuLynx emails would allow spoofing.

## Verified live against AccuLynx v2 (2026-07-19)

- Base job payload (`GET /jobs/{id}`) has **no** rep/assignment fields.
- `GET /jobs/{id}/representatives` → `{count, pageSize, pageStartIndex, items[{id, type: "CompanyRepresentative", user: {id, _link}}]}` — assigned rep as AccuLynx **user ID**.
- `GET /users/{id}` → `{firstName, lastName, emailAddress, role: {id, name}}` (e.g. Seth Anderson, seth@mcgeerestoration.com, role Sales).
- `GET /users?pageSize=N` → full company roster (47 users) for the admin dropdown.
- Reps differ per job (verified on two jobs). `/jobs/{id}/team|users|assignments` are 404s — representatives is the endpoint.

## Design

### 1. Schema

`users` table: add `acculynx_user_id uuid NULL`.

- Writable ONLY by `admin` role (admin API + dashboard). Users must never be able to set or edit their own mapping — that is the anti-spoofing guarantee.
- Store the AccuLynx user **ID**, not email. The admin dropdown displays "Name (email)" from the live `/users` roster but saves the ID. Immune to email changes; direct ID compare at check time.

### 2. Hardcoded policy

| Atom role | CRM access |
|---|---|
| `admin`, `office` | All jobs, read + write |
| `sales` | Only jobs where a `CompanyRepresentative` user ID == their `acculynx_user_id` |
| `sales` with no mapping | **No CRM access** (fail closed, clear message: "ask your admin to link your AccuLynx account") |

### 3. Enforcement point

A `CrmAccessPolicyService` check in the tool-execution layer (`tool-execution.service.ts`), before any CRM tool runs — reads AND writes (blocking updates but allowing reads leaks data and confuses users). Runs before the pending-action confirmation for writes.

Check flow for job-targeted ops (`get_crm_job`, `add_crm_note`, future updates):
1. Resolve caller's role + `acculynx_user_id` (in JWT/TenantContext after org-layer auth changes).
2. `admin`/`office` → allow.
3. `sales` → `GET /jobs/{id}/representatives`, allow iff any item's `user.id` matches. One extra API call per operation.

List ops (`get_crm_jobs`, contact search) for `sales`: post-filter results to owned jobs (fetch reps per returned job — pageSize caps at 25 so bounded; acceptable at current volume, revisit if slow).

`create_crm_lead`: allowed for all roles with CRM access. **Auto-assign** the new job to the creator: after `POST /jobs`, call `POST /jobs/{jobId}/representatives/company {id: <creator's acculynx_user_id>}` (verified live 2026-07-19, returns 200; rep visible immediately). This makes the lead appear in the creating user's own AccuLynx view and makes the job pass their own policy check. If the creator has no mapping (office/admin without one), skip assignment — lead stays unassigned as today.

### 4. Caching

- Roster cache (`/users` id→name/email): in-memory, ~15 min TTL. Used for admin dropdown and log messages.
- Do NOT cache per-job rep lookups beyond a request — assignments change and staleness here is an authz hole.

## Non-goals

- Per-org configurable policies (revisit if a customer asks).
- Mirroring AccuLynx's own permission templates.
- Per-user AccuLynx keys (product doesn't support it).

## Build order (after org layer per TENANCY-DESIGN §5)

1. Migration: `users.acculynx_user_id` (additive).
2. Admin API: `GET /admin/acculynx/users` (roster proxy) + `PATCH /admin/users/:id {acculynxUserId}` guarded by RolesGuard(admin).
3. Dashboard: dropdown on Users tab.
4. `CrmAccessPolicyService` + wire into tool-execution before CRM tools; orchestrator prompt note so Atom explains denials naturally.
5. Tests: sales-owned allow, sales-other deny, unmapped-sales deny, office/admin allow, list filtering.

## Gotchas

- **Unassigned jobs: `GET /jobs/{id}/representatives` returns 404** (verified live 2026-07-19 on an API-created lead), not an empty collection. Policy code must treat 404 as "no rep assigned" → deny for `sales`, allow for `office`/`admin` — not as an upstream error.
- Multiple reps per job possible — match ANY item, not just first.
- If AccuLynx returns rep types beyond `CompanyRepresentative` (e.g. subcontractor), match on `user.id` regardless of type initially.
- Keep the UPPA guardrail intact through any orchestrator prompt edits.
- Per-org AccuLynx credentials (tenancy plan) are orthogonal: org key = which account, this policy = who within the org.
