# FreshTrace Lean v1 — Software Requirements Specification (SRS)

**Document type:** Software Requirements Specification (developer-ready)
**Source PRD:** `PRD.md` v0.2 (2026-10-26)
**Stack:** Next.js 16 (App Router, JavaScript) + Tailwind CSS v4 + HeroUI + Prisma ORM over SQLite
**Status:** v2.0 — ready for development kickoff
**Audience:** Engineering team, technical co-founder, first engineering hires, code reviewers
**Last updated:** 2026-10-26

> **Read first.** This SRS is derived from `PRD.md`. Every functional requirement here traces to a section in the PRD. Where the PRD defers a decision, this SRS either makes a defensible default explicit or flags it as `TBD` for the team to confirm in Phase 0. This is a *Lean v1* spec — the explicit non-goals in PRD Section 5.2 are also non-goals here.

> **Revision note (v1.1 → v2.0).** This revision realigns the specification with the current implementation stack. Three architectural changes were made: (1) the separate Express backend and MongoDB Atlas were removed in favour of a **single Next.js application** with **Prisma over SQLite**; (2) **Better Auth was removed** in favour of a **custom lightweight session auth** built on database-backed sessions and an httpOnly cookie; (3) **SSLCOMMERZ was replaced by a local mock Stripe checkout** for v1. TypeScript-specific requirements (Zod, TypeScript types, `packages/shared`) were replaced with their JavaScript equivalents. Functional scope — the product flows, roles, freshness decay logic, and domain rules — is unchanged.

> **Cost-input honesty.** Several operational parameters (Stripe account, Pathao API credentials, SMTP provider, Cloudinary account, Sentry DSN) are environment-specific and must be provisioned in Phase 0. The SRS specifies the *contract* for each; the actual credentials live in env vars and are not in this document. The v1 build itself is **not blocked** on payment provisioning — the mock gateway covers it.

---

## Table of Contents

1. [Scope and Non-Goals](#1-scope-and-non-goals)
2. [System Architecture](#2-system-architecture)
3. [Authentication, Authorization, and Session](#3-authentication-authorization-and-session)
4. [Data Model (Prisma / SQLite)](#4-data-model-prisma--sqlite)
5. [Freshness Decay Logic](#5-freshness-decay-logic)
6. [REST API Specification](#6-rest-api-specification)
7. [External Integrations](#7-external-integrations)
8. [Background Jobs and Scheduling](#8-background-jobs-and-scheduling)
9. [Frontend Architecture (Next.js App Router)](#9-frontend-architecture-nextjs-app-router)
10. [Security](#10-security)
11. [Observability and Operations](#11-observability-and-operations)
12. [Deployment Topology](#12-deployment-topology)
13. [Performance and Scaling Constraints](#13-performance-and-scaling-constraints)
14. [Testing Requirements](#14-testing-requirements)
15. [Open Items and Phase 0 Blockers](#15-open-items-and-phase-0-blockers)
16. [Appendix — Environment Variables](#16-appendix--environment-variables)

> **What changed in this revision.** Stack table (§2), auth model (§3 — custom session auth, no JWT, no Better Auth), data model (§4 — Prisma/SQLite, relational tables, `sessions` table added), API routes (§6 — Next.js Route Handlers at `/api/*`, mock Stripe checkout endpoints), integrations (§7 — local mock Stripe checkout replaces SSLCOMMERZ), background jobs (§8 — Vercel Cron instead of `node-cron` + BullMQ), frontend (§9 — JavaScript/JSX, Tailwind v4 CSS-first config, HeroUI), security (§10), deployment (§12 — single Vercel app + hosted SQLite), and env vars (§16).

---

## 1. Scope and Non-Goals

### 1.1 In scope (v1)

- Customer-facing mobile-responsive web marketplace (browse, subscribe, order, manage account, request refunds).
- Partner/aggregator dashboard (list batches, manage inventory, view batch lifecycle).
- Admin/QC operations panel (QC inspection logging, refund management, reporting).
- Public QR product page at `/p/[batchCode]` (server-rendered, SEO-friendly, shareable).
- Subscription engine (fixed-plan weekly recurring baskets) and one-off ordering.
- Rule-based dynamic decay pricing engine.
- **Local mock Stripe checkout** — a Stripe-compatible checkout module that runs fully offline (no account, no keys, no network calls).
- Last-mile delivery integration via Pathao API.
- Transactional email (order confirmations, password resets, refund updates) via SMTP.
- Admin-provisioned user management for `aggregator` and `qc_staff` roles.
- **Custom lightweight session auth** — database-backed sessions, httpOnly cookie, no third-party auth framework.

### 1.2 Out of scope (v1) — explicit non-goals

- Native iOS or Android consumer app.
- Native partner/aggregator mobile app.
- B2B data API or external B2B dashboard.
- ML-based dynamic pricing (rule-based only).
- Second QC hub.
- Geographic expansion beyond Gulshan, Banani, Uttara, Dhanmondi, Mirpur, Lalmatia.
- Formal organic certification programs.
- Loyalty, referral, or gamification features.
- Phone OTP sign-in (deferred to v1.1 — see PRD §9.1).
- **Live payment processing.** v1 ships the local mock Stripe checkout. Live Stripe / SSLCOMMERZ wiring is a Phase 0 procurement + v1.1 swap behind the same provider boundary (§7.1).
- **Real-time payment webhooks.** The mock gateway has no webhooks; payment confirmation is a synchronous local operation (§7.1).
- **Multi-instance / horizontally scaled deployment.** SQLite + in-process cron assume a single writable instance (§13.2).
- In-app customer messaging inbox (WhatsApp only in v1; inbox in v1.1 — see PRD §9.1).
- Second last-mile courier (Pathao only in v1; Steadfast in v1.1 behind `CourierProvider` — see PRD §9.1).
- PII export and deletion endpoints (deferred to v1.1 — see PRD §9.1).
- Customizable subscriptions (fixed plans only in v1).
- **TypeScript.** The codebase is JavaScript (`.js` / `.jsx`). Runtime validation uses plain JavaScript validators, not Zod.
- **OpenAPI / Swagger UI.** With a single in-process application there is no external API surface to document; the Prisma schema is the contract. An OpenAPI UI may be added in v1.1 if an external consumer emerges.

---

## 2. System Architecture

### 2.1 High-level diagram

```
                ┌──────────────────────────────┐
                │  Browser (mobile / desktop)  │
                └──────────────┬───────────────┘
                               │ HTTPS
                               ▼
        ┌──────────────────────────────────────────────────────┐
        │  Vercel — Single Next.js 16 application (App Router) │
        │  ─────────────────────────────────────────────────── │
        │  Route groups:                                       │
        │    (marketing)  /                                   │
        │    (customer)   /app/...                            │
        │    (partner)    /partner/...                        │
        │    (admin)      /admin/...                          │
        │    (auth)       /login, /register                   │
        │    (api)        /api/... (Route Handlers — same app)│
        │  Public SSR: /p/[batchCode]                          │
        │  ─────────────────────────────────────────────────── │
        │  Server-side services (lib/):                        │
        │    auth (session) · orders · batches · decay ·        │
        │    payments (mock Stripe) · delivery · reports        │
        └──────────────┬───────────────────────┬───────────────┘
                       │ Prisma Client        │ Vercel Cron
                       ▼                       ▼
        ┌──────────────────────────┐   ┌──────────────────────────┐
        │  SQLite (single file)    │   │  Scheduled jobs          │
        │  via Prisma ORM          │   │  (cron → route handlers)  │
        │  prisma/dev.db           │   └──────────────────────────┘
        └──────────────────────────┘

        External:
          Pathao (delivery)   → webhook → /api/webhooks/pathao
          SMTP provider       ← outbound (transactional email)
          Sentry              ← errors (server + browser SDKs)
          Cloudinary          ← product images, QC photos
```

### 2.2 Component responsibilities

| Component | Responsibility | Owner |
|---|---|---|
| Next.js (Vercel, single app) | UI rendering (SSR + CSR), Route Handlers (the API), domain services, session auth, public QR pages | Tech co-founder |
| Prisma ORM | Data access layer, schema definition, migrations, seed script | Tech co-founder |
| SQLite | Persistent state (users, sessions, addresses, products, batches, orders, subscriptions, payments, deliveries, refunds, audit logs) | Tech co-founder |
| Mock Stripe checkout | Payment session creation, confirmation, refunds — local, offline, Stripe-shaped | Tech co-founder |
| Pathao | Last-mile delivery (order create, status webhooks, zone/area lookup) | Business co-founder |
| SMTP | Transactional email | Tech co-founder |
| Sentry | Error monitoring | Tech co-founder |
| Cloudinary | Image hosting and on-the-fly transforms | Tech co-founder |
| Vercel Cron | Triggers scheduled jobs (calls the app's own route handlers) | Tech co-founder |

### 2.3 Repo layout

```
freshtrace-app/
├── prisma/
│   ├── schema.prisma             # Data model (source of truth)
│   ├── migrations/               # Prisma migration history
│   ├── seed.js                   # Seed script (JS)
│   └── dev.db                    # Local SQLite database (gitignored)
├── src/
│   ├── app/
│   │   ├── (marketing)/
│   │   ├── (customer)/app/
│   │   ├── (partner)/partner/
│   │   ├── (admin)/admin/
│   │   ├── (auth)/
│   │   ├── p/[batchCode]/
│   │   ├── api/
│   │   │   ├── auth/
│   │   │   ├── products/
│   │   │   ├── batches/
│   │   │   ├── orders/
│   │   │   ├── subscriptions/
│   │   │   ├── deliveries/
│   │   │   ├── payments/         # Mock Stripe checkout routes
│   │   │   ├── reports/
│   │   │   ├── users/
│   │   │   ├── hub-closures/
│   │   │   ├── webhooks/pathao/
│   │   │   ├── cron/             # Scheduled job endpoints
│   │   │   └── health/
│   │   ├── layout.js
│   │   ├── globals.css            # Tailwind CSS v4 entry
│   │   └── providers.js
│   ├── components/                # Shared UI components (HeroUI + Tailwind)
│   ├── lib/
│   │   ├── prisma.js              # Prisma client singleton
│   │   ├── auth/
│   │   │   ├── session.js         # Session create/verify/destroy
│   │   │   ├── password.js        # Hashing + verification
│   │   │   └── guard.js           # Role/permission checks
│   │   ├── services/              # Domain services (orders, batches, decay...)
│   │   ├── payments/
│   │   │   ├── mock-stripe.js     # Local mock Stripe provider
│   │   │   └── provider.js        # Provider interface + selection
│   │   ├── validation/            # Plain-JS validators
│   │   └── decay/                 # Freshness decay logic + constants
│   └── public/
├── docs/
│   ├── PRD.md
│   └── SRS.md
├── .github/workflows/
└── README.md
```

> **Note on code sharing.** With a single Next.js application there is no `packages/shared` monorepo package. Shared logic lives in `src/lib/` and is imported by both Server Components and Route Handlers. The Prisma schema is the single source of truth for the data contract.

### 2.4 JavaScript conventions

- **Files:** `.js` for server/library code, `.jsx` for components containing JSX. `page.jsx`, `layout.jsx`, `route.js`.
- **No TypeScript.** Type information is conveyed via JSDoc annotations on exported functions where it aids clarity (e.g. `/** @param {import('@prisma/client').Prisma.OrderGetPayload} order */`).
- **Module system:** ESM (`import` / `export`), consistent with the Next.js default.
- **Path alias:** `@/*` → `./src/*` (configured in `jsconfig.json`).
- **Runtime validation:** hand-written validators in `src/lib/validation/` returning `{ success, data, errors }` in the shape of a Zod-like result, so call sites read uniformly.

---

## 3. Authentication, Authorization, and Session

> **Better Auth has been removed from the stack.** The project ships a **custom lightweight session auth**: a `sessions` table, a random opaque session token, and an httpOnly cookie. Rationale: the app has exactly four roles and one credential type (email + password). A plugin/adapter-based auth framework adds a dependency, a migration surface, and configuration complexity without solving a problem this product has. If the requirement set grows (OAuth social login, org/team membership, MFA, passkeys), Better Auth becomes worth revisiting — that is a v1.1 decision, not a v1 one.

### 3.1 Auth model

- **Credential:** email + password. Passwords hashed with **bcrypt** (cost factor 12) via `bcryptjs` (pure JS, no native build step — required for Vercel's serverless filesystem).
- **Session model:** **server-side, database-backed.** No JWTs.
- **Session token:** a 32-byte cryptographically random value, generated with `crypto.randomBytes(32).toString('base64url')`. Stored on the `Session` row **hashed** with SHA-256 — the raw token exists only in the user's cookie. A database leak therefore does not expose usable session tokens.
- **Cookie:** `ft_session`, `httpOnly`, `secure` (in production), `sameSite=lax`, `path=/`, `maxAge=30 days`. The cookie name is a constant, not configurable per environment.
- **Session lifetime:** 30 days from creation, with a rolling refresh — each authenticated request extends `expiresAt` by 30 days if more than 15 days have elapsed since the last touch. This is implemented in the session helper, not in a separate refresh-token flow.
- **Logout:** deletes the `Session` row server-side and clears the cookie. Because sessions are server-side, logout is immediate and global — there is no token to wait out.
- **Session revocation:** deleting the row invalidates that session instantly. Suspending a user deletes all of their sessions in the same transaction, which forces immediate re-authentication.
- **No `tokenVersion` field.** It existed to invalidate stateless JWTs globally; with server-side sessions, deleting the rows is strictly simpler and more reliable.

### 3.2 Roles and RBAC

Four explicit roles, each with a separate permission set:

| Role | Created by | Can |
|---|---|---|
| `customer` | Self-registration | Browse, subscribe, order, view own data, request refunds |
| `aggregator` | Admin-provisioned | List batches, view own batch lifecycle, view own orders |
| `qc_staff` | Admin-provisioned | View inbound batches, log QC inspections, mark pass/fail |
| `admin` | Seeded (env var-driven initial admin) | Full access; user provisioning; reporting; refund resolution |

### 3.3 Route permission matrix

| Route prefix | customer | aggregator | qc_staff | admin |
|---|---|---|---|---|
| `/api/auth/*` | ✓ | ✓ | ✓ | ✓ |
| `/api/products` (GET) | ✓ | ✓ | ✓ | ✓ |
| `/api/products` (POST/PATCH/DELETE) | — | — | — | ✓ |
| `/api/aggregators/*` (own) | — | ✓ | — | ✓ |
| `/api/aggregators/*` (all) | — | — | — | ✓ |
| `/api/batches` (POST — list new batch) | — | ✓ | — | ✓ |
| `/api/batches` (GET — own batches) | — | ✓ | ✓ | ✓ |
| `/api/batches/:id/qc-logs` (POST) | — | — | ✓ | ✓ |
| `/api/orders` (POST — customer places) | ✓ | — | — | ✓ |
| `/api/orders` (GET — own) | ✓ | — | — | ✓ |
| `/api/orders` (GET — all, filter) | — | — | — | ✓ |
| `/api/orders/:id/refund` (POST) | ✓ | — | — | ✓ |
| `/api/subscriptions` (own) | ✓ | — | — | ✓ |
| `/api/deliveries/*` | — | — | ✓ (limited view) | ✓ |
| `/api/reports/*` | — | — | — | ✓ |
| `/api/users` (admin) | — | — | — | ✓ |

### 3.4 Frontend auth

- **Server Components** call `getSession()` (via `next/headers` cookies) directly. If there is no valid session, the request is redirected to `/login`.
- **Route Handlers** call `requireSession()` / `requireRole()` helpers, which read the cookie and load the session row.
- **No client-side token store.** There is no access token in memory, no localStorage copy, and no refresh interceptor — the httpOnly cookie is sent automatically by the browser on every request.
- **Route groups** are protected by a layout-level guard: each role's shell layout (`(customer)`, `(partner)`, `(admin)`) checks the session and role server-side and redirects to `/login` (or `/unauthorized`) before rendering.
- **Client Components** receive the current user through a server-passed prop or `useSession()`; they never read the cookie directly (it is httpOnly and inaccessible to JS).

### 3.5 Password reset (v1, email-based)

- POST `/api/auth/password-reset/request` with email → server creates a single-use, 1-hour token, stores its SHA-256 hash in the `password_resets` table, and sends an email with a reset link.
- POST `/api/auth/password-reset/confirm` with token + new password → server validates, updates the password hash, deletes **all** of the user's sessions, and marks the reset token used.
- `password_resets` rows are purged 24 hours after expiry by a scheduled job.

---

## 4. Data Model (Prisma / SQLite)

The data model is defined in `prisma/schema.prisma` and is the single source of truth. SQLite is relational, so integrity is enforced by foreign keys, unique constraints, and `NOT NULL` at the database level rather than in application code.

> **Conventions.**
> - Primary keys are `cuid()` strings (Prisma default), consistent with the existing schema.
> - Foreign keys are declared with `onDelete` behaviour chosen per relation (defaults to `RESTRICT` where deletion should be blocked, `CASCADE` for dependent child rows such as order items).
> - Dates are stored as SQLite `DATETIME` (ISO-8601 text). `harvestDate` is **date-only** (midnight Dhaka time) and is treated as a calendar date, not a moment.
> - Money is stored as **integer BDT** (`Int`), never floating point, to avoid rounding errors.
> - Enum-like fields are stored as `String` with an allowlist validated in application code. SQLite has no native enum type, and Prisma's enum support is not portable to SQLite.
> - Timestamps (`createdAt`, `updatedAt`) are present on all tables.

### 4.1 `User`

```prisma
model User {
  id            String    @id @default(cuid())
  email         String    @unique
  emailVerified DateTime?
  name          String?
  phone         String?
  image         String?
  passwordHash  String
  role          String    @default("customer")   // customer | aggregator | qc_staff | admin
  status        String    @default("active")     // active | suspended
  lastLoginAt   DateTime?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  addresses       Address[]
  sessions        Session[]
  orders          Order[]
  subscriptions   Subscription[]
  batches         Batch[]        @relation("AggregatorBatches")
  qcLogs          BatchQcLog[]
  refunds         Refund[]
  auditLogs       AuditLog[]
  aggregatorProfile AggregatorProfile?
}
```

Indexes: `{ email }` unique; `{ role, status }` compound.

### 4.2 `Session`

```prisma
model Session {
  id           String   @id @default(cuid())
  userId       String
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  tokenHash    String   @unique      // sha256 of the raw session token
  expiresAt    DateTime
  lastUsedAt   DateTime @default(now())
  userAgent    String?
  ipAddress    String?
  createdAt    DateTime @default(now())

  @@index([userId])
  @@index([expiresAt])
}
```

Indexes: `{ tokenHash }` unique; `{ userId }`; `{ expiresAt }` (purge job scan).

**Lifecycle.** Created on successful login/registration; extended on eligible authenticated requests (§3.1); deleted on logout, on password reset, on user suspension, and by the session-purge job when `expiresAt` has passed.

### 4.3 `PasswordReset`

```prisma
model PasswordReset {
  id        String    @id @default(cuid())
  userId    String
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  tokenHash String    @unique      // sha256 of the raw reset token
  expiresAt DateTime
  usedAt    DateTime?
  createdAt DateTime  @default(now())

  @@index([userId])
  @@index([expiresAt])
}
```

### 4.4 `Address`

```prisma
model Address {
  id            String  @id @default(cuid())
  userId        String
  user          User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  label         String            // e.g. 'Home', 'Office'
  line1         String
  line2         String?
  area          String            // e.g. 'Gulshan-2'
  city          String            @default("Dhaka")
  geoLat        Float?
  geoLng        Float?
  deliveryNotes String?
  isDefault     Boolean @default(false)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  @@index([userId, isDefault])
}
```

### 4.5 `AggregatorProfile`

```prisma
model AggregatorProfile {
  id             String @id @default(cuid())
  userId         String @unique
  user           User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  companyName    String?
  contactPerson  String?
  districts      String   @default("[]")  // JSON array of allowed origin districts
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
}
```

### 4.6 `Product`

```prisma
model Product {
  id                String   @id @default(cuid())
  sku               String   @unique
  name              String
  category          String            // fruit | vegetable | other
  defaultUnit       String            // kg | piece | bunch
  baseUnitPrice     Int                // BDT
  imageUrl          String?
  description       String?
  originDistrict    String?
  harvestToShelfDays Int               // days from harvest to delist (used by decay engine)
  isActive          Boolean  @default(true)
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  batches Batch[]
}
```

Indexes: `{ sku }` unique; `{ category, isActive }` compound.

### 4.7 `Batch`

```prisma
model Batch {
  id                  String    @id @default(cuid())
  productId           String
  product             Product   @relation(fields: [productId], references: [id])
  aggregatorId        String
  aggregator          User      @relation("AggregatorBatches", fields: [aggregatorId], references: [id])
  batchCode           String    @unique      // human-readable, e.g. 'FT-MNG-2026-10-09-A1'
  harvestDate         DateTime               // date only (midnight, Asia/Dhaka)
  originDistrict      String
  inboundQty          Float                 // kg at receiving
  availableQty        Float                 // kg remaining (decremented on order)
  qcStatus            String    @default("pending")  // pending | passed | failed
  currentTier         String?                         // fresh | good | fair | near_expiry | expired
  currentPriceMultiplier Float   @default(1.0)       // 1.0 / 0.8 / 0.6 / 0.3 / 0.0
  status              String    @default("in_transit") // in_transit | listed | delisted | sold_out
  inboundAt           DateTime?
  listedAt            DateTime?
  expiresAt           DateTime?                      // harvestDate + harvestToShelfDays
  qrSlug              String    @unique             // short slug for the public QR URL
  qrImageUrl          String?
  createdAt           DateTime  @default(now())
  updatedAt           DateTime  @updatedAt

  qcLogs  BatchQcLog[]
  items   OrderItem[]
}
```

Indexes: `{ batchCode }` unique; `{ qrSlug }` unique; `{ status, expiresAt }` compound; `{ aggregatorId, status }` compound; `{ productId, status, currentTier }` compound.

**`qrSlug` generation.** On batch creation, the server generates `qrSlug` from a random 10-character nanoid-style string and stores it. The public route `/p/[batchCode]` resolves via `batchCode` for human readability, while the QR code image encodes the short URL `https://freshtrace.bd/p/{qrSlug}`. A redirect from `/p/{qrSlug}` to `/p/{batchCode}` keeps URLs tidy.

**Batch state machine (explicit).** Valid transitions: `in_transit → listed` (after QC pass + admin confirmation); `listed → delisted` (after `tier_recompute` finds `expired`, or admin force); `listed → sold_out` (when `availableQty` reaches 0); `delisted → listed` is **not** allowed. Failed QC keeps the batch in `in_transit` with `qcStatus=failed`; admin may either discard (`status=delisted`) or re-inspect (which creates a new `batch_qc_log`).

**Validation rules on `POST /api/batches`.** `harvestDate` must be ≤ today (Dhaka time); future dates are rejected. `originDistrict` must be in the allowlist configured on the aggregator profile. `inboundQty` must be > 0. `batchCode` (if supplied) must be unique across the platform; auto-generated if absent.

**Decrement semantics (SQLite).** `availableQty` is decremented at order placement inside a **Prisma interactive transaction** using a conditional update (`updateMany` with a `where` clause requiring `availableQty >= requestedQty` and `status = 'listed'`). If the update affects zero rows, the order is rejected with `409 conflict` and error code `out_of_stock`; the customer is shown the actual remaining qty. Because the conditional update is a single atomic SQL statement, this avoids oversell without a distributed lock. On order cancel/refund (full), the decrement is reverted with an equivalent atomic increment, in the same transaction as the status change.

> **Why an interactive transaction.** SQLite serialises writes at the file level, but a decrement plus an order insert is two statements. Wrapping both in `prisma.$transaction(async (tx) => { ... })` guarantees that a failure between them rolls back cleanly rather than leaking reserved stock.

### 4.8 `BatchQcLog`

```prisma
model BatchQcLog {
  id           String   @id @default(cuid())
  batchId      String
  batch        Batch    @relation(fields: [batchId], references: [id], onDelete: Cascade)
  inspectorId  String
  inspector    User     @relation(fields: [inspectorId], references: [id])
  inspectedAt  DateTime @default(now())
  grade        String            // A | B | C
  weightKg     Float
  temperatureC Float?
  passed       Boolean
  notes        String?
  photos       String   @default("[]")  // JSON array of Cloudinary URLs
  createdAt    DateTime @default(now())

  @@index([batchId, inspectedAt])
}
```

### 4.9 `SubscriptionPlan`

```prisma
model SubscriptionPlan {
  id          String   @id @default(cuid())
  name        String            // 'Couple Weekly', 'Family Weekly', 'Family Premium'
  basketSize  String            // small | medium | large
  weeklyPrice Int                // BDT (fresh-tier price)
  description String?
  composition String   @default("[]")  // JSON array of { productId, defaultQty }
  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
```

**Default plans (seeded at first admin login):**

| Plan | `basketSize` | Indicative `weeklyPrice` (BDT) | Indicative weight / SKUs |
|---|---|---|---|
| `Couple Weekly` | `small` | 1,200 | ~3 kg, 5–6 SKUs |
| `Family Weekly` | `medium` | 1,500 | ~4–5 kg, 6–8 SKUs |
| `Family Premium` | `large` | 1,800 | ~5–6 kg, 7–9 SKUs |

`weeklyPrice` is the **fresh**-tier price. Subscription orders are computed at the actual freshness tier on the delivery day, so the customer is charged the per-item tiered total, which may be lower than `weeklyPrice`. The plan `weeklyPrice` is therefore a maximum, not a fixed charge.

### 4.10 `Subscription`

```prisma
model Subscription {
  id             String    @id @default(cuid())
  customerId     String
  customer       User      @relation(fields: [customerId], references: [id], onDelete: Cascade)
  planId         String
  plan           SubscriptionPlan @relation(fields: [planId], references: [id])
  addressId      String
  address        Address   @relation(fields: [addressId], references: [id])
  dayOfWeek      Int                 // 0 = Sunday, 6 = Saturday
  status         String    @default("active")  // active | paused | ended
  nextDeliveryAt DateTime
  pauseUntil     DateTime?
  startedAt      DateTime  @default(now())
  endedAt        DateTime?
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt

  @@index([customerId, status])
  @@index([status, nextDeliveryAt])
}
```

**Address protection.** A subscription's `addressId` may not be deleted while the subscription is `active` or `paused`. If a customer attempts to delete a referenced address, the API returns `409 conflict` with a list of referencing subscriptions. Address edits (e.g. `line1`, `area`) propagate to the `addressSnapshot` of any **future, unplaced** subscription renewal orders but do not retroactively change already-placed orders.

### 4.11 `Order`

```prisma
model Order {
  id             String    @id @default(cuid())
  orderCode      String    @unique      // human-readable, e.g. 'FT-ORD-2026-10-09-0001'
  customerId     String
  customer       User      @relation(fields: [customerId], references: [id])
  subscriptionId String?
  subscription   Subscription? @relation(fields: [subscriptionId], references: [id])
  addressSnapshot String   @default("{}")  // JSON snapshot of the address at order time
  items          OrderItem[]
  subtotal       Int
  deliveryFee    Int       @default(0)
  discount       Int       @default(0)
  grandTotal     Int
  paymentStatus  String    @default("pending") // pending | paid | failed | refunded | partially_refunded
  paymentMethod  String?                     // card | bkash | nagad (mock)
  paymentRef     String?                     // mock Stripe session/payment ID
  status         String    @default("pending_payment") // pending_payment | paid | in_fulfillment | in_transit | delivered | cancelled | refunded
  placedAt       DateTime  @default(now())
  paidAt         DateTime?
  deliveredAt    DateTime?
  refundRequestedAt DateTime?
  refundReason   String?
  refundedAmount Int       @default(0)
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt

  @@index([customerId, placedAt])
  @@index([status, placedAt])
  @@index([paymentStatus])
}
```

### 4.12 `OrderItem`

```prisma
model OrderItem {
  id                  String @id @default(cuid())
  orderId             String
  order               Order  @relation(fields: [orderId], references: [id], onDelete: Cascade)
  batchId             String
  batch               Batch  @relation(fields: [batchId], references: [id])
  productId           String
  product             Product @relation(fields: [productId], references: [id])
  name                String          // denormalized at order time
  qty                 Float
  unitPrice           Int             // applied price (after tier discount), BDT
  lineTotal           Int             // BDT
  freshnessTierAtOrder String         // fresh | good | fair | near_expiry

  @@index([orderId])
}
```

> **Why order items are a separate table.** The v1 schema previously embedded order lines as a JSON array. In a relational database, a proper child table gives us a foreign key to `Batch`, which lets the database enforce that an order line cannot reference a deleted batch, and it makes per-line refund accounting (§6.4.5) a straightforward relational query rather than JSON-array arithmetic.

### 4.13 `Delivery`

```prisma
model Delivery {
  id               String    @id @default(cuid())
  orderId          String    @unique
  order            Order     @relation(fields: [orderId], references: [id], onDelete: Cascade)
  courier          String    @default("pathao")
  courierOrderId   String?   @unique
  courierTrackingId String?
  courierStatus    String    @default("created") // created | picked_up | in_transit | delivered | cancelled | failed
  assignedAt       DateTime  @default(now())
  pickedUpAt       DateTime?
  deliveredAt      DateTime?
  riderInfo        String?   // JSON { name, phone }
  lastWebhookAt    DateTime?
  failureReason    String?
  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt
}
```

### 4.14 `Refund`

```prisma
model Refund {
  id             String    @id @default(cuid())
  orderId        String
  order          Order     @relation(fields: [orderId], references: [id], onDelete: Cascade)
  requestedBy    String
  requester      User      @relation(fields: [requestedBy], references: [id])
  requestedByRole String   // customer | qc_staff | admin
  reason         String
  items          String    @default("[]")  // JSON array of { orderItemId, qty, amount }
  amount         Int
  status         String    @default("requested") // requested | approved | rejected | processed
  resolvedBy     String?
  resolver       User?     @relation("RefundResolver", fields: [resolvedBy], references: [id])
  resolvedAt     DateTime?
  gatewayRefundRef String?
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt
}
```

### 4.15 `Payment`

Denormalized history of gateway transactions. Mirrored from `Order.paymentStatus` for audit and reconciliation.

```prisma
model Payment {
  id           String   @id @default(cuid())
  orderId      String
  order        Order    @relation(fields: [orderId], references: [id], onDelete: Cascade)
  provider     String   @default("mock_stripe")
  gatewayTxnId String   @unique
  method       String?
  amount       Int
  status       String   // initiated | success | failed | cancelled | refunded
  rawPayload   String   @default("{}")  // JSON of the provider response
  receivedAt   DateTime @default(now())

  @@index([orderId])
}
```

### 4.16 `WebhookEvent`

Idempotent record of every inbound webhook.

```prisma
model WebhookEvent {
  id          String    @id @default(cuid())
  source      String              // pathao
  eventType   String
  payload     String              // JSON
  receivedAt  DateTime  @default(now())
  processedAt DateTime?
  status      String    @default("pending") // pending | processed | failed
  retryCount  Int       @default(0)
  lastError   String?

  @@index([source, eventType, receivedAt])
  @@index([status, receivedAt])
}
```

> **Note on retention.** SQLite has no TTL index. Expiry is enforced by a scheduled purge job that deletes rows past their retention window (§8.2). This replaces the MongoDB TTL indexes used previously.

### 4.17 `AuditLog`

```prisma
model AuditLog {
  id        String   @id @default(cuid())
  actorId   String?
  actor     User?    @relation(fields: [actorId], references: [id])
  actorRole String   // customer | aggregator | qc_staff | admin | system
  action    String   // e.g. 'order.refund.approve'
  entity    String   // e.g. 'Order'
  entityId  String
  before    String?  // JSON
  after     String?  // JSON
  ip        String?
  userAgent String?
  createdAt DateTime @default(now())

  @@index([entity, entityId, createdAt])
  @@index([actorId, createdAt])
  @@index([createdAt])
}
```

### 4.18 `HubClosure`

```prisma
model HubClosure {
  id        String   @id @default(cuid())
  date      DateTime @unique   // date only (Dhaka time)
  reason    String              // public_holiday | weather | maintenance | ...
  createdBy String
  creator   User     @relation(fields: [createdBy], references: [id])
  createdAt DateTime @default(now())
}
```

Used by `subscription_renewal` and `delivery_assignment` to auto-skip the affected week.

### 4.19 `JobRun`

```prisma
model JobRun {
  id          String   @id @default(cuid())
  jobName     String
  startedAt   DateTime @default(now())
  finishedAt  DateTime?
  status      String   @default("running") // running | success | failed
  itemsProcessed Int    @default(0)
  error       String?

  @@index([jobName, startedAt])
}
```

Records the outcome of each scheduled job run, replacing the former `job_events` collection and acting as the single-instance lock (§8.1).

### 4.20 `IdempotencyKey`

```prisma
model IdempotencyKey {
  id          String   @id @default(cuid())
  key         String
  userId      String
  route       String
  requestHash String
  responseBody String?  // JSON
  statusCode  Int?
  createdAt   DateTime @default(now())
  expiresAt   DateTime

  @@unique([key, userId, route])
  @@index([expiresAt])
}
```

---

## 5. Freshness Decay Logic

The decay engine is a pure function plus a thin persistence layer. It is the **core product logic** of FreshTrace and lives in `src/lib/decay/` so that Route Handlers, Server Components, and any future pricing service share one implementation.

### 5.1 Tier table

| Days from harvest | Tier | Price multiplier | Action |
|---|---|---|---|
| 0–1 | `fresh` | 1.00 | list |
| 2–3 | `good` | 0.80 | list |
| 4–5 | `fair` | 0.60 | list |
| 6 to `harvestToShelfDays` | `near_expiry` | 0.30 | list_with_warning |
| > `harvestToShelfDays` | `expired` | 0.00 | delist |

### 5.2 Function signature

```js
// src/lib/decay/index.js

/**
 * @typedef {'fresh' | 'good' | 'fair' | 'near_expiry' | 'expired'} Tier
 * @typedef {'list' | 'list_with_warning' | 'delist'} DecayAction
 */

/**
 * @param {Date} harvestDate
 * @param {Date} now
 * @param {number} harvestToShelfDays
 * @returns {{ tier: Tier, multiplier: number, action: DecayAction,
 *             daysSinceHarvest: number, remainingShelfDays: number }}
 */
export function computeDecay(harvestDate, now, harvestToShelfDays) { /* ... */ }
```

**Day-boundary rule.** `daysSinceHarvest` is computed as `Math.floor((nowUtc - harvestMidnightDhaka) / 86_400_000)`, where `harvestMidnightDhaka` is `harvestDate` interpreted as 00:00 in `Asia/Dhaka`. This makes Day 0 cover `[00:00, 24:00)` Dhaka on the harvest day, Day 1 the next full Dhaka day, etc. Tier assignment uses `daysSinceHarvest` against the table above, so a batch with `harvestDate = 2026-10-09` is `fresh` for the entirety of 2026-10-09 and 2026-10-10, transitions to `good` at 00:00 Dhaka time on 2026-10-11, and so on. `Math.floor` is the boundary rule; half-day rules are explicitly not supported in v1.

### 5.3 Pricing application

`displayedUnitPrice = Math.round(product.baseUnitPrice * decayResult.multiplier)`

The customer sees the discounted price; the `currentPriceMultiplier` on the batch record is the source of truth for analytics and refunds.

### 5.4 Recompute triggers

1. **On read** — every handler that returns a batch or a list of batches runs `computeDecay` against `now` and uses the result. The persisted `currentTier` is a cache.
2. **Scheduled job (every 15 min)** — updates `currentTier` and `currentPriceMultiplier` for all `status=listed` batches; emits a `batch.delisted` event for any that crossed into `expired`.
3. **On QC pass** — immediately recomputes and persists.
4. **On order placement** — uses the on-read result; does not mutate batch state on read.

### 5.5 Time zone handling

All `harvestDate` values are stored as midnight Dhaka time (UTC+06:00). The decay function takes a `now` parameter so it is timezone-agnostic; callers pass `new Date()` in UTC. The frontend renders all dates in `Asia/Dhaka` via `Intl.DateTimeFormat`.

---

## 6. REST API Specification

Base path: `/api`. All routes are **Next.js Route Handlers** (`app/api/**/route.js`) running in the same process as the UI — there is no separate backend service and no network hop between the frontend and the API.

All requests and responses are JSON. All errors use the standard error envelope.

### 6.1 Standard error envelope

```json
{
  "error": {
    "code": "string_constant",
    "message": "human-readable message",
    "details": { }
  }
}
```

Standard error codes: `unauthenticated`, `forbidden`, `not_found`, `conflict`, `validation_failed`, `rate_limited`, `payment_failed`, `delivery_unavailable`, `internal_error`.

### 6.2 Pagination

Cursor-based. Lists return:

```json
{
  "data": [],
  "pageInfo": {
    "nextCursor": "string | null",
    "hasMore": true
  }
}
```

Query params: `?cursor=<opaque>&limit=<int 1-100, default 20>`.

### 6.3 Idempotency

POSTs that create orders, refunds, or payments require an `Idempotency-Key` header. The handler hashes the key + userId + route, and stores the response in the `idempotency_keys` table; subsequent requests with the same key return the stored response. The mock payment confirmation route is idempotent by this mechanism.

### 6.4 Endpoints

#### 6.4.1 Auth

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/register` | none | Create customer account. Body: `{ email, password, name, phone? }` |
| POST | `/api/auth/login` | none | Create session, set `ft_session` cookie. Body: `{ email, password }` |
| POST | `/api/auth/logout` | any | Delete session row, clear cookie |
| POST | `/api/auth/password-reset/request` | none | Email reset link |
| POST | `/api/auth/password-reset/confirm` | none | Set new password, invalidate all sessions |
| GET | `/api/auth/me` | any | Current user profile |
| GET | `/api/auth/sessions` | any | List own active sessions (for a "sign out everywhere" control) |

#### 6.4.2 Products

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/products` | any | List active products |
| GET | `/api/products/:id` | any | Product detail |
| GET | `/api/products/:id/available-batches` | any | List batches that are `listed` for this product, with current freshness tier and price (used by the consumer browse page) |
| POST | `/api/products` | admin | Create |
| PATCH | `/api/products/:id` | admin | Update |
| DELETE | `/api/products/:id` | admin | Soft-delete (`isActive=false`) |

#### 6.4.3 Aggregators (admin) / aggregator profile (self)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/aggregators` | admin | List aggregators |
| POST | `/api/aggregators` | admin | Provision aggregator account + profile |
| GET | `/api/aggregators/:id` | admin or self | Aggregator detail |
| PATCH | `/api/aggregators/:id` | admin | Update profile |
| POST | `/api/aggregators/:id/suspend` | admin | Suspend account (deletes their sessions) |
| GET | `/api/aggregators/me/profile` | aggregator | Own profile |
| PATCH | `/api/aggregators/me/profile` | aggregator | Update own profile |

#### 6.4.4 Batches

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/batches` | aggregator or admin | List a new batch. Body: `{ productId, harvestDate, originDistrict, inboundQty, batchCode? }` |
| GET | `/api/batches` | aggregator (own) / qc_staff / admin (all) | List batches with filters `?status=&aggregatorId=&tier=&from=&to=` |
| GET | `/api/batches/:id` | aggregator (own) / qc_staff / admin | Batch detail |
| POST | `/api/batches/:id/qc-logs` | qc_staff or admin | Log QC inspection. Body: `{ grade, weightKg, temperatureC?, passed, notes, photos[] }` |
| POST | `/api/batches/:id/list` | admin | Force status `in_transit → listed` (after QC) |
| POST | `/api/batches/:id/delist` | admin | Force delist |

Public (no auth):
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/batches/by-slug/:qrSlug` | none | Public read for the QR product page |

#### 6.4.5 Orders

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/orders` | customer | Place an order (one-off). Requires `Idempotency-Key`. Body: `{ items: [{ batchId, qty }], addressId, paymentMethod }` |
| GET | `/api/orders` | customer (own) / admin (all) | List orders with filters `?status=&from=&to=` |
| GET | `/api/orders/:id` | customer (own) / admin | Order detail |
| POST | `/api/orders/:id/cancel` | customer (own, before `paid`) / admin | Cancel pending order, restore reserved stock |
| POST | `/api/orders/:id/refund` | customer (own, after `delivered`) / admin | Request refund. Body: `{ reason, items: [{ orderItemId, qty }] }` |
| POST | `/api/orders/:id/refund/approve` | admin | Approve a refund request |
| POST | `/api/orders/:id/refund/reject` | admin | Reject with reason |

**Refund formula.** Refund amount is the **price actually paid**: `unitPrice * qty` where `unitPrice` is the discounted (tier-applied) price captured in the order line. Refunds never revert to the un-discounted `baseUnitPrice`. The same rule applies to `near_expiry` items (the customer gets back what they paid for a `near_expiry` item, not the `fresh` SKU price).

#### 6.4.6 Subscriptions

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/subscriptions/plans` | any | List active plans |
| POST | `/api/subscriptions` | customer | Subscribe. Body: `{ planId, addressId, dayOfWeek }` |
| GET | `/api/subscriptions/me` | customer | List own subscriptions |
| GET | `/api/subscriptions/:id` | customer (own) / admin | Subscription detail |
| POST | `/api/subscriptions/:id/pause` | customer (own) | Pause; body: `{ until }` |
| POST | `/api/subscriptions/:id/resume` | customer (own) | Resume |
| POST | `/api/subscriptions/:id/cancel` | customer (own) | End subscription |

#### 6.4.7 Deliveries

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/deliveries` | admin / qc_staff | List deliveries with filters `?status=&date=` |
| GET | `/api/deliveries/by-order/:orderId` | admin / qc_staff / customer (own) | Delivery for an order |
| POST | `/api/deliveries/:id/refresh-status` | admin | Force-refetch from courier |

#### 6.4.8 Payments (local mock Stripe checkout)

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/payments/checkout` | customer | Create a mock Stripe checkout session for an order. Body: `{ orderId }`. Returns `{ sessionId, url }` — `url` is a **local** route (`/checkout/mock/[sessionId]`) |
| GET | `/api/payments/checkout/:sessionId` | customer | Read mock checkout session state |
| POST | `/api/payments/checkout/:sessionId/confirm` | customer | Simulate successful payment. Body: `{ paymentMethod }`. Transitions order `pending_payment → paid` |
| POST | `/api/payments/checkout/:sessionId/cancel` | customer | Simulate customer-initiated cancellation. Order → `cancelled`, stock restored |
| POST | `/api/payments/checkout/:sessionId/fail` | customer | Simulate a declined payment (test hook). Order stays `pending_payment` |
| POST | `/api/payments/refund` | admin | Process a refund against the mock provider. Body: `{ orderId, amount, reason }` |

All mock payment routes are idempotent via the `Idempotency-Key` mechanism (§6.3). See §7.1 for the provider contract.

#### 6.4.9 Webhooks (no auth — signature-verified)

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/webhooks/pathao` | HMAC signature | Pathao order status |

> **No payment webhook.** The mock gateway confirms synchronously (§7.1). A live Stripe integration will add `POST /api/webhooks/stripe` — the `WebhookEvent` table and idempotent processing already accommodate it.

#### 6.4.10 Reports (admin)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/reports/orders/summary` | admin | Counts + revenue for a date range |
| GET | `/api/reports/batches/qc-pass-rate` | admin | QC pass rate over time |
| GET | `/api/reports/refunds/summary` | admin | Refund rate and reasons |
| GET | `/api/reports/subscriptions/summary` | admin | Active subs, churn, MRR |
| GET | `/api/reports/dashboard` | admin | Top-level KPIs for the admin home |

#### 6.4.11 Users (admin)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/users` | admin | List users with role filter |
| POST | `/api/users` | admin | Provision aggregator or qc_staff |
| PATCH | `/api/users/:id` | admin | Update user (status, role) |
| POST | `/api/users/:id/suspend` | admin | Suspend (also deletes their sessions) |
| POST | `/api/users/:id/reset-password` | admin | Force-reset and email temporary password |

#### 6.4.12 Hub closures (admin)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/hub-closures` | admin | List closures |
| POST | `/api/hub-closures` | admin | Create a closure. Body: `{ date, reason }` |
| DELETE | `/api/hub-closures/:id` | admin | Remove a closure |

#### 6.4.13 Health

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/health` | none | `{ status, db, uptime, version }`; 200 unless DB unreachable (503) |

### 6.5 Validation and contracts

- Request bodies, query parameters, and route params are validated by the plain-JS validators in `src/lib/validation/` before the handler logic runs. Each validator returns `{ success: true, data }` or `{ success: false, errors: [{ path, message }] }`.
- The **Prisma schema** is the single source of truth for the data contract. Schema changes require a migration (`prisma migrate dev`) and a regenerated client (`prisma generate`).
- Because handlers and UI share one process and one Prisma client, there is no separate OpenAPI artifact to keep in sync. The previous `packages/shared` + `zod-to-openapi` + Swagger UI arrangement has been removed.

---

## 7. External Integrations

### 7.1 Local mock Stripe checkout (payments)

> **Why a mock.** The pilot's critical path is *checkout that works*, not *payment rails that settle*. The mock removes merchant onboarding (company paperwork, settlement accounts, live keys) from the engineering critical path while preserving the order-state machine, refunds, and reconciliation logic. It is a **local, offline module** — no Stripe account, no API keys, no outbound network calls, and no Stripe SDK dependency. The module mirrors the Stripe Checkout request/response shape so that swapping in live Stripe is a provider change, not a rewrite.

**Provider interface** (`src/lib/payments/provider.js`):

```js
/**
 * @typedef {object} CheckoutSession
 * @property {string} id
 * @property {string} orderId
 * @property {number} amount          // BDT
 * @property {'open' | 'complete' | 'expired' | 'cancelled'} status
 * @property {string} url              // local checkout URL
 */

/**
 * @typedef {object} PaymentProvider
 * @property {(order: object) => Promise<CheckoutSession>} createCheckoutSession
 * @property {(sessionId: string) => Promise<CheckoutSession>} getCheckoutSession
 * @property {(sessionId: string, method: string) => Promise<{ paymentId: string, status: string }>} confirmPayment
 * @property {(paymentId: string, amount: number) => Promise<{ refundId: string, status: string }>} refundPayment
 */
```

**Mock implementation** (`src/lib/payments/mock-stripe.js`):

- **Session creation:** generates `cs_test_<random>`, stores the session on the `Payment` row (`provider = 'mock_stripe'`, `status = 'initiated'`), and returns a URL pointing at the local checkout page `/checkout/mock/[sessionId]`.
- **Checkout page:** a real Next.js page (`src/app/checkout/mock/[sessionId]/page.jsx`) that renders the order summary, a payment-method selector (card / bKash / Nagad — all simulated), and a **"Pay"** button that calls the confirm endpoint.
- **Confirmation:** `POST /api/payments/checkout/:sessionId/confirm` marks the session complete, writes a `Payment` row with `status = 'success'`, and transitions the order from `pending_payment` to `paid` with `paidAt` set. This happens **synchronously** — there is no webhook, no redirect to an external page, and no polling.
- **Failure/cancel paths:** the `fail` and `cancel` endpoints exercise the order's failure states (`payment_failed`, `cancelled`) and restore reserved stock. These exist so the full order state machine is testable without a live gateway.
- **Refunds:** `POST /api/payments/refund` writes a `Payment` row with `status = 'refunded'` and returns a `re_mock_<random>` refund reference. No money moves; the row records the intent and is the audit artifact.
- **Test affordances:** the mock exposes deterministic failure modes (e.g. a `simulateFailure` flag) so automated tests can drive the declined-payment path without a live sandbox.

**Swapping to live Stripe (v1.1).** Implement the same `PaymentProvider` interface against the Stripe SDK, select it via an env flag (`PAYMENT_PROVIDER=mock_stripe | stripe`), and add `POST /api/webhooks/stripe`. No handler logic outside `src/lib/payments/` changes.

**Required env:** `PAYMENT_PROVIDER` (`mock_stripe` in v1), `NEXT_PUBLIC_APP_URL` (used to build the local checkout URL).

### 7.2 Pathao (last-mile delivery)

- **Auth:** OAuth2 client_credentials; server-side helper caches the access token until expiry.
- **Order create:** `POST /aladdin/api/v1/orders` with `store_id`, `merchant_order_id`, `recipient_name`, `recipient_phone`, `recipient_address`, `recipient_city`, `recipient_zone`, `recipient_area`, `delivery_type`, `item_type`, `special_instruction`, `item_quantity`, `item_weight`, `amount_to_collect`, `delivery_fee`.
- **City/zone/area lookup:** `GET /aladdin/api/v1/cities`, `GET /aladdin/api/v1/cities/{city_id}/zones`, `GET /aladdin/api/v1/zones/{zone_id}/areas`. The `delivery_assignment` job looks up zone/area from the customer's address.
- **Webhook:** `POST /api/webhooks/pathao` with body containing `order_id`, `status` (`Picked Up`, `In Transit`, `Delivered`, `Cancelled`, `Failed`), `rider` info. The handler verifies the HMAC signature before applying the update.
- **Required env:** `PATHAO_CLIENT_ID`, `PATHAO_CLIENT_SECRET`, `PATHAO_BASE_URL`, `PATHAO_STORE_ID`, `PATHAO_WEBHOOK_SECRET`.

### 7.3 SMTP (transactional email)

- **Provider:** TBD in Phase 0 (Nodemailer-compatible: SES, SendGrid, Mailgun, or a BD specialist). The contract below is provider-agnostic.
- **Templates:** order confirmation, order shipped, order delivered, refund approved, refund rejected, password reset, account provisioned, weekly subscription summary.
- **Required env:** `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`.

### 7.4 Sentry

- Server-side: initialized in the Next.js instrumentation hook with DSN from `SENTRY_DSN`.
- Browser: initialized in `src/app/providers.js` with DSN from `NEXT_PUBLIC_SENTRY_DSN`.
- Source maps uploaded on Vercel deploys.

### 7.5 Cloudinary

- Used for product images (admin-uploaded) and QC photos (qc_staff-uploaded via admin panel).
- Upload preset: signed, restricted to server credentials.
- Transformations on delivery: `f_auto,q_auto,w_800` for product cards, `w_1200` for QC full-res.

### 7.6 QR code generation

- **Library:** `qrcode` (Node), server-side, no third-party QR service required.
- **Output:** a PNG (300×300 px) uploaded to Cloudinary via the signed preset, returned as a stable URL on `Batch.qrImageUrl`.
- **Print pipeline:** out of scope (stickers are produced by the QC lead from the Cloudinary URL during the hub workflow).

---

## 8. Background Jobs and Scheduling

### 8.1 Job runner

- **v1:** **Vercel Cron** invoking dedicated Route Handlers under `src/app/api/cron/*`. Vercel Cron sends a `GET` request to the configured path; each handler verifies a `CRON_SECRET` bearer token before running.
- **Single-instance constraint:** SQLite has a single writer, so the app is deployed as a single writable instance for v1. Each job creates a `JobRun` row at start and updates it at finish; a job that finds a `JobRun` for the same `jobName` still `running` within its normal window skips execution (duplicate-run guard, replacing the former Redis-style lock).
- **v1.1 (deferred):** migrate to a proper queue (BullMQ/Redis or a hosted equivalent) for retries, backoff, and multi-instance execution.
- **Note:** Vercel's Hobby plan allows limited cron invocations; the pilot's five daily jobs fit comfortably. If invocation volume becomes a constraint, the move to a queue is the same change already planned for v1.1.

### 8.2 Scheduled jobs

| Job | Path | Schedule (Dhaka time) | Description |
|---|---|---|---|
| `tier_recompute` | `/api/cron/tier-recompute` | every 15 min | Re-evaluates all `status=listed` batches; updates `currentTier` and `currentPriceMultiplier`; emits `batch.delisted` events for newly expired batches. |
| `subscription_renewal` | `/api/cron/subscription-renewal` | daily 02:00 | Creates next-week `orders` for active subscriptions whose `nextDeliveryAt` is in the next 24h. |
| `delivery_assignment` | `/api/cron/delivery-assignment` | daily 06:00 | Groups next-day paid orders by zone; calls Pathao `order/create` per order. |
| `webhook_retry` | `/api/cron/webhook-retry` | every 5 min | Retries `WebhookEvent` rows with `status=failed` and `retryCount < 5`, exponential backoff (1m, 5m, 15m, 1h, 6h). |
| `expiry_sweep` | `/api/cron/expiry-sweep` | daily 03:00 | Purges expired sessions, password-reset tokens, webhook events (>30 days), audit logs (>365 days), and idempotency keys (>24 hours). |

### 8.3 Event emission

Jobs emit events to the `JobRun` table (job name, duration, items processed, error) for debugging and for the duplicate-run guard. Production observability is via Sentry and structured logs.

### 8.4 Subscription delivery semantics

- **Fixed weekly `dayOfWeek`.** A subscription has exactly one delivery day per week (e.g. Friday). `nextDeliveryAt` is advanced by 7 days on each successful renewal.
- **Holiday / hub-closure auto-skip.** The admin maintains a `hub_closures` table (date, reason). The `subscription_renewal` job skips any subscription whose `nextDeliveryAt` falls on a closure; the order is **not** placed; `nextDeliveryAt` is advanced by 7 days; the customer is notified by email ("This week's delivery skipped due to {reason}; your next delivery is on {date}").
- **Freshness disclosure at checkout.** For subscription orders, the renewal job pre-computes the freshness tier each item will have on the planned delivery day. The customer's order confirmation page lists each item with its expected tier and price. If any item is `expired` at the time the renewal job would create the order, that item is dropped from the basket and the customer is notified; the order is still placed for the remaining items.
- **Pause/resume interaction with `nextDeliveryAt`.** Pausing sets `pauseUntil` and stops the renewal job from acting on it. Resuming clears `pauseUntil` and recomputes `nextDeliveryAt` to the next occurrence of the chosen `dayOfWeek` that is ≥ today and not in a closure.

### 8.5 Payment reconciliation (v1)

Because the mock gateway confirms synchronously (§7.1), there is no external webhook to lose and therefore **no reconciliation cron in v1**. What remains is a local sweep: orders left in `pending_payment` for more than 30 minutes are marked `cancelled` and any reserved batch stock is restored. This runs as part of the daily `expiry_sweep` job. When live Stripe is introduced in v1.1, this sweep is replaced by the standard Stripe reconciliation job (query by `tran_id`, mark `paid` on a `VALID` response).

---

## 9. Frontend Architecture (Next.js App Router)

### 9.1 Routing

All files are `.jsx` (components with JSX) or `.js` (Route Handlers, libraries).

```
src/app/
├── (marketing)/
│   ├── page.jsx                   # Landing
│   ├── about/page.jsx
│   └── how-it-works/page.jsx
├── (customer)/
│   ├── layout.jsx                 # Customer shell (header, footer, auth guard)
│   └── app/
│       ├── page.jsx               # Home (browse, featured)
│       ├── products/page.jsx      # Catalog
│       ├── products/[sku]/page.jsx# Product detail
│       ├── subscriptions/page.jsx # Plans
│       ├── cart/page.jsx
│       ├── checkout/page.jsx
│       ├── orders/page.jsx        # Order history
│       ├── orders/[id]/page.jsx   # Order detail
│       ├── subscriptions/me/page.jsx
│       ├── account/page.jsx
│       ├── account/addresses/page.jsx
│       └── account/password/page.jsx
├── (partner)/
│   ├── layout.jsx                 # Aggregator shell
│   └── partner/
│       ├── page.jsx               # Dashboard
│       ├── batches/page.jsx
│       ├── batches/new/page.jsx
│       ├── batches/[id]/page.jsx
│       ├── orders/page.jsx
│       └── profile/page.jsx
├── (admin)/
│   ├── layout.jsx                 # Admin / QC shell
│   └── admin/
│       ├── page.jsx               # KPIs
│       ├── users/page.jsx
│       ├── products/page.jsx
│       ├── batches/page.jsx
│       ├── batches/[id]/qc/page.jsx
│       ├── orders/page.jsx
│       ├── orders/[id]/page.jsx
│       ├── refunds/page.jsx
│       ├── subscriptions/page.jsx
│       └── reports/page.jsx
├── (auth)/
│   ├── login/page.jsx
│   ├── register/page.jsx
│   ├── forgot-password/page.jsx
│   └── reset-password/[token]/page.jsx
├── checkout/
│   └── mock/[sessionId]/page.jsx  # Local mock Stripe checkout page
├── p/[batchCode]/
│   └── page.jsx                   # Public QR product page (SSR)
├── api/
│   ├── auth/
│   ├── products/
│   ├── batches/
│   ├── orders/
│   ├── subscriptions/
│   ├── deliveries/
│   ├── payments/                  # Mock Stripe checkout routes
│   ├── reports/
│   ├── users/
│   ├── hub-closures/
│   ├── webhooks/pathao/
│   ├── cron/                      # Vercel Cron targets
│   └── health/route.js
├── layout.jsx
├── globals.css                    # Tailwind CSS v4 entry
└── not-found.jsx
```

### 9.2 Server vs client components

| Route | Render mode | Why |
|---|---|---|
| `/` (marketing home) | Server Component | SEO, performance |
| `/products` | Server Component (list) + Client Component (filters) | Initial paint is SSR; filters are interactive |
| `/products/[sku]` | Server Component | SEO |
| `/p/[batchCode]` | Server Component | SEO + shareability; freshness tier rendered server-side |
| `/app/*` (customer) | Mixed — Server Component shell + Client Component islands | Authenticated; data read directly via Prisma on the server, interactivity client-side |
| `/partner/*` | Mixed | Same pattern as customer |
| `/admin/*` | Mixed | Same pattern as customer |
| `/login`, `/register` | Client Component | Forms |
| `/checkout/mock/[sessionId]` | Server Component shell + Client Component form | Reads session on the server, payment action is a client mutation |

> **Convention.** Files that contain JSX and are not Route Handlers use the `.jsx` extension. Route Handlers are `route.js` (they never contain JSX). This is a convention, not a hard Next.js requirement — `.js` files may still contain JSX — but keeping it consistent makes the language boundary obvious at a glance.

### 9.3 Data fetching

- **Server Components:** read directly through the Prisma client singleton (`src/lib/prisma.js`). There is no internal HTTP call — a Server Component queries the database in the same process.
- **Public pages (SSR):** Next.js `fetch` with `revalidate` for cached catalog reads; product detail revalidated on demand via `revalidatePath` from the admin panel. Note: because most reads go through Prisma directly rather than `fetch`, the App Router's data cache does not apply to them; caching is applied explicitly where it is needed (e.g. `unstable_cache` around the catalog query).
- **Client Components:** call Route Handlers via `fetch` for mutations and for any interactive listing (filters, pagination). A small SWR-style hook (`useApi`) wraps fetch with error handling and auth redirects.
- **Auth state:** the session is resolved server-side. Client Components receive the user via props from a Server Component parent, or call `/api/auth/me` when freshness is needed.

### 9.4 Forms

- **Server Actions** for simple, non-interactive forms (login, register, address edit, pause/resume subscription). Server Actions run in the same process and can use the session and Prisma directly.
- **Route Handlers** for anything that needs a JSON response, an idempotency key, or a third-party side effect (order placement, payment confirmation, admin actions).
- **Client-side validation:** plain JavaScript validators from `src/lib/validation/`, shared with the server handlers. No Zod.

### 9.5 UI library and styling

- **Tailwind CSS v4.** Configured CSS-first — there is **no `tailwind.config.js`**. The theme is declared with `@theme` inside `src/app/globals.css`, and Tailwind's automatic source detection handles class discovery (no manual `content` array). The `@tailwindcss/turbopack` loader is wired in `next.config.mjs`.

  ```css
  @import "tailwindcss";
  @source "../node_modules/@heroui/theme/dist/**/*.{js,ts,jsx,tsx}";

  @theme inline {
    --color-background: var(--background);
    --color-foreground: var(--foreground);
    --font-sans: var(--font-geist-sans);
    --font-mono: var(--font-geist-mono);
  }
  ```

- **HeroUI** for accessible components: dialog, dropdown, toast, tabs, table, select, form controls. HeroUI is styled with Tailwind and slots into the same theme.
- **Icons:** `lucide-react`.
- **Animation:** `framer-motion` for page transitions and list animations.
- **Date utilities:** `date-fns` (timezone-aware via `date-fns-tz`).
- **i18n:** `next-intl` from day one. Default locale `bn-BD`, with `en` as a secondary. All user-facing strings live in `messages/{locale}.json`. Number and currency formatting use `Intl.NumberFormat('bn-BD' | 'en-BD', { style: 'currency', currency: 'BDT' })`.

### 9.6 Public QR product page (`/p/[batchCode]`)

- Server Component; resolves `batchCode` to a batch with a direct Prisma read (no API hop).
- Renders: product name, harvest date, origin district, freshness tier badge, current price, supply-chain journey (a vertical timeline: harvest → received at hub → QC passed → listed → in transit → delivered).
- Includes a small "Verify this batch" callout showing the `batchCode` and a "Powered by FreshTrace" footer.
- No auth required.

### 9.7 Mock checkout page (`/checkout/mock/[sessionId]`)

- Server Component reads the checkout session and order summary; the payment form is a Client Component.
- Renders the order summary (items, tiers, totals), a payment-method selector (card / bKash / Nagad — all simulated), and a **"Pay now"** button.
- On success, redirects to `/app/orders/[id]`; on simulated failure, shows an inline error and leaves the order in `pending_payment`.
- The page is clearly labelled as a **test/simulated payment** so it is never mistaken for a live gateway during a pilot demo.

---

## 10. Security

### 10.1 Transport

- HTTPS only. TLS terminated at the Vercel edge.
- HSTS header (1 year, includeSubDomains, preload).
- HTTP→HTTPS redirect at the Vercel edge.

### 10.2 Cookies and headers

- `ft_session` cookie: `httpOnly`, `secure` (production), `sameSite=lax`, path `/`, maxAge 30 days.
- Security headers set in `next.config.mjs` (or a middleware): `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Strict-Transport-Security`, and a `Permissions-Policy` header.
- CSP: a strict policy in production; relaxed in development. Must allow the Cloudinary and Sentry origins.
- **The session token is never readable by client-side JavaScript.** It lives only in an httpOnly cookie and, hashed, in the `sessions` table.

### 10.3 CORS

- Not applicable to same-origin traffic — the UI and the API are the same Next.js application on the same origin. The cookie is first-party, so no CORS allowlist and no `Access-Control-Allow-Credentials` handling is required. A restrictive CORS policy is still set for defence in depth (deny by default).

### 10.4 Input validation

- Every request body, query parameter, and route parameter is validated by a plain-JS validator in `src/lib/validation/` before the handler logic runs.
- Prisma parameterizes all queries, so string interpolation into SQL is not possible. Raw SQL (`$queryRaw`) is not used in v1.

### 10.5 Secrets management

- `.env.example` checked in; real `.env` files gitignored.
- Local dev: a single `.env` at the repo root (Next.js loads it for both server and client).
- Production: Vercel environment variables (project → Settings → Environment Variables).
- Rotation policy: `SESSION_SECRET` (if a signing secret is used), `CRON_SECRET`, `PATHAO_CLIENT_SECRET`, `SMTP_PASS` rotated every 90 days.
- `DATABASE_URL` contains the SQLite file path and is the only required database variable.

### 10.6 Dependency hygiene

- GitHub Dependabot enabled.
- `npm audit --audit-level=high` in CI; failing CI on `high` or `critical`.
- Renovate (optional, recommended) for automated PRs.

### 10.7 Rate limiting

- Global: 100 req/min per IP for unauthenticated routes; 600 req/min per user for authenticated.
- Strict: 10 req/min on `/api/auth/login`, `/api/auth/register`, `/api/auth/password-reset/request`.
- Strict: 30 req/min on `POST /api/orders` and `POST /api/orders/:id/refund`.
- Storage: in-memory in v1 (per-instance, single-instance safe). A shared store is deferred to v1.1.

### 10.8 PII

- Customer name, email, phone, and addresses are PII. Stored in the SQLite database file, which must live in a location with restricted access (see §12.4).
- No PII in logs.
- No PII in Sentry breadcrumbs.
- Data export and deletion: out of scope for v1 (planned for v1.1).

### 10.9 Audit

- All write actions (order, refund, batch state change, user provisioning) emit an `AuditLog`.
- Refund approval and user suspension are double-audited (actor + resolver both logged).

### 10.10 Clock skew & timestamp policy

- All `Date` values are stored in UTC. `harvestDate` is **date-only** (midnight in `Asia/Dhaka`) and is treated as a calendar date, not a moment.
- Server time is synced via NTP; tolerance is ± 60 s. The decay cron uses server-local UTC but reports its "Dhaka time" via `Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka' })`.
- Inbound webhooks carry their own timestamps from the source (Pathao). The server trusts the source timestamp for the entity but records `receivedAt` (server UTC) on `WebhookEvent` for ordering.
- Webhooks are **not** guaranteed in order. State transitions are written defensively (only `pending → paid`, `created → in_transit`, etc., never backwards). Stale webhooks (> 30 min older than the current entity state) are logged but not applied.

### 10.11 Failure handling

- Because the API runs in the same process as the UI, there is no network hop to fail between the frontend and the backend. The failure modes that applied to the previous BFF→API architecture (connect timeouts, retry storms, 503 screens on order placement) no longer apply.
- A failed database write inside an interactive transaction rolls back cleanly; the customer sees a generic error and the stock reservation is released.
- Client mutations are **not** auto-retried by the client on 5xx (to avoid double-submit with the server's idempotency layer). The user is offered an explicit retry.

### 10.12 Data retention (v1)

| Data | Retention | Mechanism |
|---|---|---|
| Orders, refunds, payments | Indefinite (business record) | None |
| Audit logs | 365 days | `expiry_sweep` job |
| Webhook events | 30 days | `expiry_sweep` job |
| Password reset tokens | 24 h after expiry | `expiry_sweep` job |
| Sessions | 30 days (rolling) | `expiry_sweep` job + delete-on-logout |
| Idempotency keys | 24 hours | `expiry_sweep` job |
| Customer PII (name, email, phone, address) | Account lifetime + 30 days after deletion request | Manual purge on support request until v1.1 export/deletion endpoints |
| Cloudinary assets (product images, QC photos) | Indefinite | Manual cleanup; QC photos attached to a `batch_qc_log` are kept as long as the log |
| Sentry events | 90 days (Sentry default) | Sentry-side retention |

A documented `scripts/purge-account.js` script is provided for manual PII purge on support request, ahead of the v1.1 self-service endpoints.

---

## 11. Observability and Operations

### 11.1 Health endpoint

- `GET /api/health` returns `{ status: 'ok', db: 'ok' | 'error', uptime, version }`. Always 200 unless the database is unreachable, in which case 503.
- A database probe runs `SELECT 1` via the Prisma client.

### 11.2 Logging

- Structured JSON logs via `pino` (or Next.js's built-in instrumentation logging).
- Log levels: `info` (default), `warn`, `error`, `debug` (env-driven).
- Sensitive fields stripped: `password`, `token`, `authorization`, `cookie`, `secret`.

### 11.3 Error tracking

- Sentry (server + browser SDKs).
- Source maps uploaded on deploy.
- Release tagging tied to git SHA.

### 11.4 Metrics and dashboards (v1: minimum viable)

- Sentry for errors and performance.
- Vercel built-in analytics.
- Custom KPIs surfaced in `/admin` (orders/day, gross margin/basket, refund rate, QC pass rate) — implemented as admin dashboard queries, not a separate metrics system.

### 11.5 Uptime monitoring

- UptimeRobot or Better Stack pings `/api/health` every 1 minute.
- Alerting: email/SMS on two consecutive failures.

---

## 12. Deployment Topology

### 12.1 Environments

| Env | Application | Database | Purpose |
|---|---|---|---|
| Local | `localhost:3000` | `prisma/dev.db` (SQLite file) | Dev |
| Preview (PR) | Vercel preview URL | Preview DB (or an isolated copy of the dev DB) | Per-PR review |
| Staging | `staging.freshtrace.bd` | Staging SQLite file | Pre-prod verification |
| Production | `freshtrace.bd` (and subdomains) | Production SQLite file | Live |

> **Single-application topology.** There is no separate frontend/backend pair to deploy. One Vercel project serves the UI, the Route Handlers, and the cron targets.

### 12.2 CI/CD

- **GitHub Actions** workflows:
  - `ci.yml` on every PR: lint, unit tests, `prisma validate`, `prisma migrate diff` drift check, `npm audit`.
  - `deploy.yml` on merge to `main`: deploy to Vercel production (Vercel's own Git integration, with a post-deploy smoke test).

### 12.3 Domain and DNS

- Primary: `freshtrace.bd`.
- Subdomains: `app.freshtrace.bd` (customer), `partner.freshtrace.bd` (aggregator), `admin.freshtrace.bd` (admin/QC).
- DNS via the registrar used in Phase 0; specific provider TBD.

### 12.4 Database (SQLite)

- **Engine:** SQLite via the Prisma `sqlite` provider. `DATABASE_URL="file:./dev.db"` locally; a different file path per environment.
- **Migrations:** `prisma migrate dev` for local development; `prisma migrate deploy` in CI/CD against the target environment.
- **Schema source of truth:** `prisma/schema.prisma`.
- **Hosting:** the SQLite file must live on a persistent, backed-up volume. In production this means either a managed volume on the deployment target, or a scheduled dump of the file to object storage. **This is a deployment decision that must be closed before the production launch** — the file cannot live in a serverless function's ephemeral filesystem.
- **Concurrency:** SQLite permits a single writer. The app is deployed as a **single writable instance** for v1 (§13.2). `PRAGMA journal_mode=WAL` and a busy timeout are enabled to reduce write contention.
- **Backups:** a scheduled `sqlite3 .backup` (or file copy) to versioned storage, with a documented restore runbook. RPO target 24 h, RTO 4 h (§13.4).
- **Migration path:** if the pilot outgrows a single file, the Prisma schema is portable to Postgres with a `prisma migrate` step and a changed datasource provider. No application code changes are required, because all data access goes through the Prisma client.

### 12.5 File storage

- **Cloudinary** for product images and QC photos. Credentials in `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `CLOUDINARY_UPLOAD_PRESET`.

---

## 13. Performance and Scaling Constraints

### 13.1 v1 performance targets

| Surface | Target |
|---|---|
| Landing / marketing pages TTFB | < 300 ms (p95) |
| Product list | < 250 ms (p95) |
| Product detail | < 200 ms (p95) |
| Order placement end-to-end | < 1.5 s (p95) |
| QR product page TTFB | < 400 ms (p95) |
| Admin dashboard initial load | < 1.5 s (p95) |

> **Note.** These targets are now measured without a network hop between the UI and the data layer — the previous targets included a same-region API call that no longer happens.

### 13.2 v1 scaling constraints (hard)

- **Single writable instance.** SQLite permits one writer at a time; the app must run as one instance for v1.
- **No horizontal autoscaling** that would create concurrent writers.
- **Read replicas** are out of scope for v1.
- **The move to Postgres** is the escape hatch for both the write-concurrency and the storage-durability constraints. It is a Prisma datasource change plus a migration, not a rewrite.

### 13.3 Known v1 limits (documented)

- One QC hub, manual receiving, max ~200–300 kg inbound per day with the planned 2–4 staff.
- Subscription renewal job runs once daily; weekly cadence only.
- No real-time courier tracking beyond Pathao webhook polling (no background polling job in v1; webhooks only).
- No multi-currency; BDT only.
- **Mock payments only** — no real money moves in v1 (§7.1).

### 13.4 Operational SLOs (v1)

| Surface | Target |
|---|---|
| Monthly availability | 99.0% (best-effort, no formal SLA) |
| Recovery Point Objective (RPO) | 24h (daily SQLite file backup) |
| Recovery Time Objective (RTO) | 4h (documented runbook only; no DR drill in v1) |
| Customer support response (WhatsApp) | 4 business hours, Mon–Sat 09:00–19:00 Dhaka |
| Email deliverability | SPF, DKIM, DMARC configured for `freshtrace.bd` before pilot |
| Languages | `en`, `bn-BD` (default Bangla); `next-intl` from day one |
| Accessibility (customer-facing) | WCAG 2.1 AA |
| Accessibility (partner / admin) | Best-effort |
| Browser support | Last 2 versions of Chrome, Edge, Safari, Firefox; iOS Safari 15+; Android Chrome 100+ |

### 13.5 Capacity planning (v1)

- **Concurrent users:** 200 (orders during a Friday 17:00–21:00 burst).
- **Subscription renewal job:** must complete in < 60 s for 500 active subscriptions (v1 target).
- **QC throughput:** 200–300 kg/day inbound, ≤ 2 hours from receiving to listed.
- **Webhook burst:** 200 webhook events/min sustained. No background polling in v1.

---

## 14. Testing Requirements

### 14.1 Test pyramid

| Layer | Tooling | Coverage target |
|---|---|---|
| Unit | Vitest for `src/lib/services` and `src/lib/decay` | 80% line coverage on services |
| Integration | Vitest against a test SQLite database (a dedicated `dev.test.db` file, migrations applied in `beforeAll`) | 70% route coverage |
| Component (web) | Vitest + React Testing Library | 60% on shared UI components |
| E2E (web) | Playwright | Critical paths: register, place order, view QR page, admin QC log |
| Load (deferred) | k6 or Artillery | Out of scope for v1, planned for v1.1 |

> **Note on the test database.** SQLite makes integration testing cheap: a test file is created per run, migrations are applied once, and the file is deleted afterwards. No containerised database is needed in CI. The Prisma client must be pointed at the test file via `DATABASE_URL` in the test setup — the same code path is exercised in CI and locally.

### 14.2 Critical E2E paths (must pass before any release)

1. Customer: register → login → subscribe → receive renewal order → view QR page.
2. Customer: place one-off order → mock Stripe checkout success → order paid → delivery assigned → delivered.
3. Customer: place order → request refund → admin approves → refund processed.
4. Aggregator: login → list batch → batch visible to admin.
5. QC staff: login → see inbound batches → log QC pass → batch listed.
6. Admin: login → view KPIs → suspend user → user cannot log in.
7. **Auth regression:** log out → the session row is deleted → the previous cookie no longer authenticates. Suspend a user → their existing session stops working immediately.

### 14.3 Test data

- A `prisma/seed.js` script seeds dev/staging with: 1 admin, 2 aggregators, 2 qc_staff, 5 customers, 10 products, 3 active plans, 20 batches at various tier states.
- No real PII in test data.

---

## 15. Open Items and Phase 0 Blockers

The following are `TBD` and must be resolved before development starts or, where noted, before specific phases.

| # | Item | Why | Deadline |
|---|---|---|---|
| 1 | **Live payment provider decided** — Stripe account opened, or SSLCOMMERZ/bKash/Nagad merchant account opened | The v1 build ships against the local mock and is **not blocked** on this, but real money collection is | Phase 0, week 3 |
| 2 | Pathao merchant account + API credentials obtained | Cannot integrate delivery without it | Phase 0, week 2 |
| 3 | SMTP provider selected and account opened | Cannot send transactional email without it | Phase 0, week 2 |
| 4 | Sentry project created (server + browser), DSNs generated | Cannot monitor errors without it | Phase 0, week 1 |
| 5 | Cloudinary account opened, upload preset configured | Cannot host images without it | Phase 0, week 1 |
| 6 | **Production SQLite storage decided** — persistent volume + backup schedule + restore runbook | The database file cannot live in an ephemeral filesystem | Phase 0, week 2 |
| 7 | Vercel project created, domain `freshtrace.bd` DNS configured | Cannot deploy without it | Phase 0, week 1 |
| 8 | Initial admin user email and password decided | Seeded via env var; must be set before first deploy | Phase 0, week 1 |
| 9 | Pathao city/zone/area IDs for Dhaka collected (one-time bootstrap) | Used by delivery assignment; can be populated on first request, but preloading speeds first delivery | Phase 0, week 3 |
| 10 | Specific aggregator contact for the pilot not yet named | Source-of-truth for the first batches | Phase 0, week 1 (parallel with #1) |
| 11 | Pilot unit-cost model not yet built | Validates whether the pilot unit economics close | Phase 0, week 2 (parallel with #1) |
| 12 | 1-week pre-pilot dry run not yet run | Validates spoilage assumption | Phase 0, week 4 |
| 13 | QC hub site not yet scouted in Uttara or Mohammadpur | Operational dependency for v1 | Phase 0, week 3 |
| 14 | Funding source committed but not yet closed | Runway gates the v1 build | Before Phase 1 starts |

> **Removed from this list.** The MongoDB Atlas cluster, the Render web service, and the separate Vercel web service are no longer blockers — that infrastructure is no longer part of the architecture (§2, §12).

---

## 16. Appendix — Environment Variables

The following env vars are required. The `TBD` entries must be filled in Phase 0. All live in a single `.env` at the repo root (Next.js loads it for both server and client).

### 16.1 Core

| Var | Purpose | Example |
|---|---|---|
| `NODE_ENV` | Environment | `production` |
| `DATABASE_URL` | SQLite connection | `file:./dev.db` |
| `NEXT_PUBLIC_APP_URL` | Public base URL (used to build the mock checkout URL and email links) | `http://localhost:3000` |
| `SESSION_SECRET` | Secret used to derive the session token hash (optional; a plain SHA-256 is used if unset) | `TBD` |
| `SESSION_MAX_AGE_DAYS` | Session lifetime | `30` |
| `CRON_SECRET` | Bearer token guarding `/api/cron/*` | `TBD` |
| `SEED_ADMIN_EMAIL` | Initial admin email | `admin@freshtrace.bd` |
| `SEED_ADMIN_PASSWORD` | Initial admin password (rotate after first login) | `TBD` |
| `LOG_LEVEL` | Log level | `info` |
| `TIMEZONE` | App timezone | `Asia/Dhaka` |

### 16.2 Payments (mock)

| Var | Purpose | Example |
|---|---|---|
| `PAYMENT_PROVIDER` | Active provider — `mock_stripe` in v1 | `mock_stripe` |

> **Note.** The mock gateway requires **no** API keys, secrets, or account. `STRIPE_SECRET_KEY` and friends are intentionally absent from this list; they are added in v1.1 when the live provider is introduced (§7.1).

### 16.3 Delivery

| Var | Purpose | Example |
|---|---|---|
| `PATHAO_CLIENT_ID` | Pathao OAuth client ID | `TBD` |
| `PATHAO_CLIENT_SECRET` | Pathao OAuth client secret | `TBD` |
| `PATHAO_BASE_URL` | Pathao API base | `https://api-hermes.pathao.com` |
| `PATHAO_STORE_ID` | Pathao store ID | `TBD` |
| `PATHAO_WEBHOOK_SECRET` | Webhook HMAC secret | `TBD` |

### 16.4 Email, monitoring, and media

| Var | Purpose | Example |
|---|---|---|
| `SMTP_HOST` | SMTP host | `TBD` |
| `SMTP_PORT` | SMTP port | `587` |
| `SMTP_USER` | SMTP user | `TBD` |
| `SMTP_PASS` | SMTP password | `TBD` |
| `SMTP_FROM` | From address | `FreshTrace <hello@freshtrace.bd>` |
| `SENTRY_DSN` | Sentry DSN for the server | `TBD` |
| `NEXT_PUBLIC_SENTRY_DSN` | Sentry DSN for the browser | `TBD` |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary cloud | `TBD` |
| `CLOUDINARY_API_KEY` | Cloudinary key | `TBD` |
| `CLOUDINARY_API_SECRET` | Cloudinary secret | `TBD` |
| `CLOUDINARY_UPLOAD_PRESET` | Signed upload preset | `freshtrace_signed` |

### 16.5 Client-exposed

| Var | Purpose | Example |
|---|---|---|
| `NEXT_PUBLIC_APP_NAME` | Brand name | `FreshTrace` |
| `NEXT_PUBLIC_DEFAULT_TIMEZONE` | Display timezone | `Asia/Dhaka` |

### 16.6 Decay multipliers

| Var | Purpose | Example |
|---|---|---|
| `DECAY_DAY1_MULTIPLIER` | Override Day 1 multiplier | `1.00` |
| `DECAY_DAY3_MULTIPLIER` | Override Day 3 multiplier | `0.80` |
| `DECAY_DAY5_MULTIPLIER` | Override Day 5 multiplier | `0.60` |
| `DECAY_NEAR_EXPIRY_MULTIPLIER` | Override near-expiry multiplier | `0.30` |

> **Why the decay multipliers are env vars.** They let the operations team tune the decay curve without a code deploy. Defaults match Section 5.1; the values are documented in `src/lib/decay/constants.js`.

---

*End of SRS v2.0.*
