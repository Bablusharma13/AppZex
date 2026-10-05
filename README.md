# AppZex AgencyOS

A production-minded, **multi-tenant SaaS for digital agencies**: manage clients, projects,
milestones, tasks, meetings, files and client feedback — with a separate Super Admin portal, a
dedicated client portal, and an AI meeting-summary workflow.

Built as the AppZex Solutions Full Stack Developer technical assignment.

---

## Technology Decisions

### Database: MongoDB, not MySQL

> **The assignment specified MySQL. This implementation uses MongoDB + Mongoose as a deliberate
> technology choice.**

This is stated plainly so nothing in this repository implies otherwise. MySQL was not used at any
point in the codebase.

**Why MongoDB was selected**

| Reason | Detail |
| --- | --- |
| Tenant scoping is a document property | Every tenant-owned document carries `agencyId`. A single indexed field makes tenant filtering a natural, always-present predicate rather than a join across a tenant-keyed schema. |
| Isolation is structurally harder to forget | With SQL, a missing `WHERE agency_id = ?` returns another tenant's rows. In MongoDB the same mistake means querying without the scoping predicate — which the repository base class in this repo makes impossible to do by hand. |
| Naturally hierarchical data | Projects → milestones → tasks, and projects → meetings → AI summaries embed or reference cleanly without recursive joins. |
| Flexible feedback documents | Change requests and AI summaries are irregularly shaped; schema evolution does not need a migration for every new field. |
| Deployment | MongoDB Atlas is the lowest-friction managed deployment path for this stack. |

**How tenant isolation is enforced**

Isolation is enforced **server-side, in one place, for every query** — never by a parameter the
browser controls:

- `backend/src/repositories/TenantScopedRepository.ts` is the base class for every tenant-owned
  collection. The `agencyId` is supplied **once** by the caller that already resolved the
  authenticated tenant, and is merged into every read, update and delete. Application code never
  hand-writes the filter, so a forgotten `agencyId` is not expressible.
- `resolveTenant` (`backend/src/middleware/tenant.ts`) derives the tenant from the verified JWT, or —
  for a Super Admin — from a database-verified support session. A value supplied in the query string
  or request body is **never consulted**.
- Client accounts add a second predicate on their own `clientId`, so a client is scoped to its own
  company even inside its own agency.
- Cross-tenant reads return **404, not 403**, so the API cannot be used to probe for the existence of
  another tenant's records.

**Trade-offs accepted**

- **No relational constraints.** Cross-document integrity (for example, "a task's project must
  exist") is enforced in the service layer rather than by the database. The trade is deliberate: the
  invariants are tested, and the isolation guarantee becomes simpler rather than merely asserted.
- **Joins are done in the application.** Reports aggregate in MongoDB (`aggregate`,
## 1. Project Overview

Three isolated portals over one API:

- **Super Admin** (`/admin/*`) — platform operator. Manages agencies, views metrics, activates or
  suspends tenants, and can enter an agency through an audited, time-boxed support session.
- **Agency workspace** (`/workspace/*`) — agency staff. Clients, projects, milestones, tasks,
  meetings, files, feedback and activity for their own tenant only.
- **Client portal** (`/client/*`) — a client company. Sees only its own projects, shared meetings
  and files, and can raise feedback.

## 2. Features

**Multi-tenancy & security**

- Every agency-owned document carries `agencyId`, enforced through a scoped repository base class.
- Super Admin is a separate, platform-level role — never an agency member.
- Audited, time-boxed, read-only or read/write **support mode**.
- Tenant isolation, client IDOR protection and RBAC are covered by automated tests.

**Agency workspace**

- Team management: invite, edit, change role, activate/deactivate.
- Client companies and client logins.
- Projects with status and priority, plus **progress derived from completed tasks** (never typed in).
- Milestones; tasks with comments, due dates and overdue indicators.
- Meetings with an **AI summary workflow** (summary, decisions, action items, deadlines).
- Client feedback / change requests with a reply thread.
- Attachments with authorised, non-public downloads.
- Auditable activity log.

**Client portal**

- Own-company dashboard, projects with derived progress, milestones, meetings and shared files.
- Submit feedback and reply to the agency.

**Platform**

- Super Admin dashboard with agency, user, client and project metrics plus charts.
- Agency search, filtering and pagination.
- Agency activation and suspension, effective immediately for that agency's users.

## 3. Tech Stack

| Layer | Technology |
| --- | --- |
| Frontend | Next.js 15 (App Router), React 18, TypeScript, Tailwind CSS, shadcn-style Radix primitives, Recharts |
| Backend | Node.js, Express 4, TypeScript, REST |
| Database | MongoDB 8 + Mongoose 8 |
| Auth | JWT (access + refresh), bcrypt, RBAC |
| Validation | Zod |
| Security | Helmet, CORS allow-list, rate limiting, centralised error handling |
| Testing | Jest + Supertest |
| AI | Any OpenAI-compatible chat-completions API |

## 4. Architecture

```
appzex/
├── backend/                 # Express + TypeScript REST API
│   └── src/
│       ├── config/          # env (validated), database, logger
│       ├── routes/          # thin HTTP layer: path + middleware chain only
│       ├── controllers/     # parse request, call service, send response
│       ├── services/        # business logic and tenant-scoped queries
│       ├── repositories/    # TenantScopedRepository (isolation lives here)
│       ├── models/          # Mongoose schemas
│       ├── middleware/      # authenticate, resolveTenant, validate, error, rateLimit
│       ├── validators/      # Zod schemas
│       ├── ai/              # provider client
│       ├── types/           # shared enums + Express augmentation
│       ├── utils/           # AppError, response, pagination, crypto, actorContext
│       ├── app.ts           # app factory (used by tests)
│       └── server.ts        # process bootstrap
├── frontend/                # Next.js App Router
│   └── src/
│       ├── app/             # routes: /admin, /workspace, /client
│       ├── components/      # shared UI + ui primitives
│       ├── hooks/           # useAsyncData, useAction, useSession, useToast
│       ├── services/        # typed API clients (no agencyId parameter anywhere)
│       ├── lib/             # api-client (fetch wrapper, ApiError)
│       ├── types/           # DTOs and enums mirroring the API contract
│       └── utils/           # formatting helpers
└── README.md
```

**Layering rule:** routes never contain business logic; services never touch `req`/`res`. This is
what makes the isolation guarantees testable at the HTTP layer and reusable from a future GraphQL
or queue consumer.

## 5. Database Design

Models: `User`, `Agency`, `AgencyMember`, `Client`, `Project`, `Milestone`, `Task`, `Meeting`,
`Feedback`, `FileAsset`, `ActivityLog`, `SupportSession`, `Notification`.

Every tenant-owned document carries `agencyId` with an index, for example:

```ts
// Client
{ agencyId, companyName, contactPerson, email, phone, notes }

// Project
{ agencyId, clientId, name, description, status, priority,
  startDate, expectedCompletionDate, projectManagerId }
## 6. Authentication

- Passwords hashed with **bcrypt** (cost configurable, default 10).
- Password policy: minimum 8 characters with an upper case letter, a lower case letter and a digit.
- `POST /api/auth/register` creates a new tenant plus its first `AGENCY_ADMIN`.
- Login issues a short-lived **access token** and a rotating **refresh token**.
- The user is re-read from the database on every request, so deactivating a user or changing their
  role takes effect immediately rather than at token expiry.
- `passwordHash` is `select: false` on the model and is never serialised into any response.

## 7. RBAC

| Role | Scope |
| --- | --- |
| `SUPER_ADMIN` | Platform operations only. Not an agency member. Cannot read tenant data without a support session. |
| `AGENCY_ADMIN` | Full control of their own agency, including team and client administration. |
| `AGENCY_TEAM` | Day-to-day delivery work within their own agency. |
| `CLIENT` | Their own company only. Blocked from all internal agency APIs. |

Reusable middleware: `authenticate`, `authorize(...roles)`, `requireSuperAdmin`,
`requireAgencyAdmin`, `requireAgencyStaff`, `requireClient`, `requireActiveAgency`,
`enforceSupportScope`.

A suspended or inactive agency is blocked at the middleware layer, with a message naming the
agency.

## 8. Multi-Tenancy Approach

```
Browser request
   |  Authorization: Bearer <JWT>
   v
authenticate ---------> re-read user, verify active + role match
   v
requireActiveAgency --> block SUSPENDED / INACTIVE tenants
   v
resolveTenant -------> agencyId from the verified user
                        (or from a DB-verified support session for SUPER_ADMIN)
   v
controller ----------> service --> TenantScopedRepository (merges agencyId/clientId)
```

The frontend has **no** `agencyId` parameter in any service method. There is nothing to tamper with.

**Support mode** is server-side: a super admin creates a `SupportSession` with a reason, scope and
duration, and the API re-validates that session against the database on every request. Ending the
session revokes access immediately. `?agencyId=<other-tenant>` changes nothing.

## 9. Security Measures

- Tenant isolation, client IDOR protection and RBAC enforced server-side.
- Password hashing; `passwordHash` never returned; `select: false` at the model level.
- Helmet security headers, explicit CORS allow-list, `x-powered-by` disabled, `trust proxy` set.
- Rate limiting on auth and AI endpoints.
- Zod validation on body, query and params for every meaningful route.
- Centralised error handler: production responses never leak stack traces or driver errors.
- Structured logging that never records passwords, tokens or API keys.
- Files stored outside the web root with generated names; downloads authorised per request; a
  resolved-path check blocks traversal.
- Support-mode actions and all privileged changes are written to the activity log.

## 10. File Security

- Uploads are buffered in memory with a size cap and a MIME allow-list.
## 11. AI Feature — AI Meeting Summary

Flow: an agency user opens a meeting, writes notes, and clicks **Generate AI Summary**.

- The backend loads the meeting **inside the caller's tenant** first, so cross-tenant notes can
  never reach the model.
- The prompt returns a structured summary, decisions, action items and deadlines.
- The user can review and edit the output before saving it.
- Selected action items can be converted into real tasks on that project.
- Provider: any OpenAI-compatible `/chat/completions` endpoint, configured with `AI_API_KEY`,
  `AI_BASE_URL` and `AI_MODEL` (default `gpt-4o-mini`). **No key is ever hard-coded.**
- **Graceful degradation:** with no key configured, or if the provider is unreachable or returns
  malformed output, the endpoint returns `503` with a readable message and has a dedicated rate
  limiter. The rest of the application is unaffected.

---

// Task
{ agencyId, projectId, milestoneId, title, description,
  assigneeId, status, priority, dueDate }
```

Client-scoped documents additionally carry `clientId`, which is how a client account is confined to
its own company.

**Progress is derived, never stored.** `GET /api/workspace/projects/:id` computes
`progressPercentage = completedTasks / totalTasks` from the task collection. There is no editable
`progress` field, so the number always reflects real work.

---
  `countDocuments`) rather than SQL, which is fine at this scale but would need denormalisation or a
  warehouse at very large data volumes.
- **Schema flexibility cuts both ways.** Without migrations, a malformed document can exist. The
  mitigation in place is Mongoose schema validation plus Zod validation on every write path.

---
## 12. Environment Variables

Copy `.env.example` to `.env` at the repository root (used by the backend), and
`frontend/.env.example` to `frontend/.env.local`.

| Variable | Purpose |
| --- | --- |
| `NODE_ENV`, `PORT`, `LOG_LEVEL` | Runtime |
| `MONGODB_URI` | Application database |
| `MONGODB_URI_TEST` | Dedicated database for the test suite |
| `JWT_SECRET` | Token signing secret — **must** be replaced in production |
| `JWT_ACCESS_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN` | Token lifetimes |
| `BCRYPT_ROUNDS` | Password hashing cost |
| `CLIENT_URL` | Comma-separated CORS allow-list |
| `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD` | Seed-only bootstrap for the first Super Admin |
| `AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL`, `AI_TIMEOUT_MS` | AI provider (blank disables AI) |
| `STORAGE_DIR`, `MAX_UPLOAD_SIZE_MB` | File storage |
| `NEXT_PUBLIC_API_URL` | Frontend → backend API base URL |
| `NEXT_PUBLIC_APP_URL` | Public frontend origin |

`.env` is git-ignored; only `.env.example` is committed.

## 13. Setup

```bash
# 1. Install (npm workspaces)
npm install

# 2. Configure
copy .env.example .env              # then edit JWT_SECRET and MONGODB_URI

# 3. Ensure MongoDB is running on 27017 (or point MONGODB_URI at Atlas)

# 4. Seed demo data
npm run seed

# 5. Run both apps
npm run dev                         # backend :5000, frontend :3000
```

| Command | Description |
| --- | --- |
| `npm run dev` | Backend + frontend together |
| `npm run dev:backend` / `npm run dev:frontend` | One side only |
| `npm run build` | Production build (both) |
| `npm run start` | Start the built backend |
| `npm run lint` | ESLint, both workspaces |
| `npm run typecheck` | `tsc --noEmit`, both workspaces |
| `npm test` | Jest + Supertest suite |
| `npm run seed` | Reset and reseed demo data |

**MongoDB Atlas:** create a free cluster, add your IP to the access list, copy the connection string
into `MONGODB_URI`, then run `npm run seed`.

## 14. Demo Credentials

Password for every seeded account: **`AgencyDemo123!`**

| Role | Email | Portal |
| --- | --- | --- |
| Super Admin | `admin@appzex-demo.com` | `/admin/login` |
| Agency A admin | `agency-a-admin@appzex-demo.com` | `/login` |
| Agency A team | `agency-a-team@appzex-demo.com` | `/login` |
| Agency A client | `agency-a-client@appzex-demo.com` | `/client/login` |
| Agency B admin | `agency-b-admin@appzex-demo.com` | `/login` |
| Agency B client | `agency-b-client@appzex-demo.com` | `/client/login` |

The seed creates **two separate tenants** (Northstar Digital and Bluepeak Creative) with their own
clients, projects, milestones, tasks, meetings, feedback and activity — deliberately similar, so
tenant isolation can be demonstrated directly: sign in as Agency A, open a project id belonging to
Agency B, and you get a 404.

## 15. API Overview

All responses use `{ "success": true, "data": ... }`; errors use
`{ "success": false, "message": "...", "code": "..." }`.

| Area | Endpoints |
| --- | --- |
| Auth | `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `GET/PATCH /auth/me`, `POST /auth/change-password` |
| Platform | `GET /admin/metrics`, `GET /admin/agencies`, `GET /admin/agencies/:id`, `GET /admin/agencies/:id/detail`, `PATCH /admin/agencies/:id`, `PATCH /admin/agencies/:id/status`, `GET /admin/agencies/:id/support-sessions`, `GET /admin/activity` |
| Support mode | `POST/GET/DELETE /admin/support-session`, `GET /admin/workspace/*` |
| Team | `GET/POST /workspace/team`, `GET/PATCH /workspace/team/:id` |
| Clients | `GET/POST /workspace/clients`, `GET/PATCH/DELETE /workspace/clients/:id`, `POST /workspace/clients/:id/users` |
| Projects | `GET/POST /workspace/projects`, `GET/PATCH/DELETE /workspace/projects/:id` |
| Milestones | `GET/POST /workspace/milestones`, `GET/PATCH/DELETE /workspace/milestones/:id` |
| Tasks | `GET/POST /collab/tasks`, `GET/PATCH/DELETE /collab/tasks/:id`, `POST /collab/tasks/:id/comments` |
| Meetings + AI | `GET/POST /collab/meetings`, `GET/PATCH/DELETE /collab/meetings/:id`, `POST/PATCH /collab/meetings/:id/summary`, `POST /collab/meetings/:id/summary/tasks` |
| Feedback | `GET/POST /collab/feedback`, `PATCH /collab/feedback/:id/status`, `POST /collab/feedback/:id/replies`, `DELETE /collab/feedback/:id` |
| Files | `GET/POST /files`, `GET /files/:id/download`, `DELETE /files/:id` |
| Client portal | `GET /collab/client/projects`, `GET /collab/client/projects/:id`, `GET /collab/client/milestones`, `GET /collab/client/meetings`, `GET/POST /collab/client/feedback`, `POST /collab/client/feedback/:id/replies` |
| Activity & dashboards | `GET /activity`, `GET /activity/dashboard`, `GET /activity/client/dashboard`, `GET /activity/me/client` |

List endpoints support server-side `page`, `limit`, `search`, `sortBy`, `sortOrder` plus
resource-specific filters, and return a `pagination` block.

---
- Stored under a generated key in a directory **outside** the web root — nothing is served
  statically, so a guessed filename is useless.
- The upload response contains **no** path and no URL.
- Downloads go through `GET /api/files/:id/download`, which re-checks identity, tenant, client
  ownership and visibility before streaming a byte. The frontend attaches the bearer token, so this
  cannot be a plain link.
- Clients can only download `CLIENT_VISIBLE` files on their own projects.
- A resolved-path containment check blocks path traversal.

## 16. Testing

```bash
npm test                    # 67 tests across 3 suites
npm run test -w backend -- --coverage
```

Tests run against a **real MongoDB database** (`MONGODB_URI_TEST`) and exercise the true HTTP
surface through Supertest, so the middleware chain, tenant resolver and service filters are all
covered together.

Covered security scenarios:

1. Agency A cannot read an Agency B project (and its listing excludes it).
2. Agency A cannot read an Agency B client.
3. Agency A cannot modify or delete an Agency B task.
4. Client 1 cannot read Client 2's project by guessing the id.
5. Client is blocked from internal agency endpoints.
6. Agency users and clients cannot access the Super Admin API.
7. Users of a suspended agency are blocked.
8. Password hashes never appear in any response.
9. Unauthorised file download is blocked (cross-tenant, cross-client, internal-only, anonymous).
10. Super Admin can access agencies, and cannot read tenant data without a support session.

Also covered: support-mode scope and revocation, session spoofing, tampered tokens, cross-agency
assignment of project managers, password change, validation failures, derived progress, and the
public path of every list endpoint (which is how the `/api/files/files` double-prefix regression
was caught).

## 17. Deployment

> **Full step-by-step walkthrough: see [`DEPLOYMENT.md`](./DEPLOYMENT.md)** — MongoDB Atlas,
> Render (API), Vercel (frontend), seeding and verification.

**Backend** — build and run anywhere Node 20+ is available:

```bash
npm run build
NODE_ENV=production node backend/dist/server.js
```

Set `MONGODB_URI`, a strong `JWT_SECRET`, `CLIENT_URL` (your frontend origin) and the AI variables
in the platform's secret manager. Run behind TLS; the app expects to be served over HTTPS.

**Frontend** — deploy to Vercel or any Node host:

```bash
npm run build -w frontend
npm run start -w frontend
```

Set `NEXT_PUBLIC_API_URL` to the public backend URL (including `/api`) at build time. No localhost
dependency remains in the production bundle.

**Verification before going live**

- [x] `npm install`, lint, typecheck, tests and production build all pass
- [x] Tenant, client and support-mode isolation verified against a running server
- [x] No secrets committed (`.env` is ignored; only `.env.example` is tracked)
- [x] `JWT_SECRET` documented as mandatory in `.env.example`

## 18. Known Limitations

- **Refresh tokens are issued and stored, but reuse detection is not fully implemented.** Access
  tokens remain short-lived as the primary control.
- **File storage is local disk.** `STORAGE_DIR` is the seam for S3, but only local storage is
  implemented, so multiple backend replicas need a shared volume.
- **The client portal is read-mostly plus feedback.** Clients cannot comment on tasks or edit
  milestones, which keeps the internal delivery model closed by design.
- **No email delivery.** Password reset, invitations and notifications are not wired to a mail
  provider; `Notification` exists as the model to build on.
- **Notifications are not pushed.** The activity log is structured to power them, but there is no
  realtime channel (websocket/SSE).
- **`next.config.js` disables build workers** (`cpus: 1`, `workerThreads: false`) because spawning
  child processes fails with `spawn UNKNOWN` on some Windows hosts. Builds are slower but
  deterministic; remove once the deployment host is known to support workers.
- **Search is regex-based**, not full-text indexed. Adequate at demo scale; Atlas Search or a
  dedicated index would be needed for large datasets.

## 19. Future Improvements

- Object-storage adapter (S3/GCS) with short-lived signed URLs for downloads.
- Full refresh-token rotation with reuse detection and a token denylist.
- Email notifications, invitations and password reset.
- Realtime activity feed and in-app notifications built on `ActivityLog`.
- Per-field audit history and exportable audit reports.
- Full-text search and faceted filtering.
- Role and permission customisation per agency.
- CI pipeline running lint, typecheck, tests and build on every push.

## 20. Product Decisions

- **Progress is computed, not entered.** An agency that reports 40% has 40% of tasks done. This
  removes an entire class of trust problem, which is why the assignment calls for it.
- **Super Admin is not an agency member.** Platform operators have no standing access to tenant
  data; every access is a time-boxed, reasoned, revocable and audited session.
- **Denials return 404 where existence would leak.** Cross-tenant and unauthorised file access
  return 404 rather than 403, so the API cannot be used as an existence oracle.
- **The client portal is a separate surface, not a filtered workspace.** Clients get exactly the
  capabilities they need — visibility, feedback, files — and never a read-only version of the
  agency's internal tools.
- **Tenant identity is never a request parameter.** No frontend service method accepts an
  `agencyId`; the tenant comes from the authenticated session or a verified support session.
