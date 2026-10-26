# FreshTrace Lean v1 — Software Requirements Specification (SRS)

**Document type:** Software Requirements Specification (developer-ready)
**Source PRD:** `PRD.md` v0.2 (2026-10-12)
**Stack:** Next.js (App Router) + Node.js/Express + MongoDB (Mongoose) + Tailwind CSS
**Status:** v1.1 — ready for development kickoff
**Audience:** Engineering team, technical co-founder, first engineering hires, code reviewers
**Last updated:** 2026-10-12

> **Read first.** This SRS is derived from `PRD.md`. Every functional requirement here traces to a section in the PRD. Where the PRD defers a decision, this SRS either makes a defensible default explicit or flags it as `TBD` for the team to confirm in Phase 0. This is a *Lean v1* spec — the explicit non-goals in PRD Section 5.2 are also non-goals here.

> **Cost-input honesty.** Several operational parameters (SSLCOMMERZ merchant account, Pathao API credentials, MongoDB Atlas tier, SMTP provider, Cloudinary account, Sentry DSN) are environment-specific and must be provisioned in Phase 0. The SRS specifies the *contract* for each; the actual credentials live in env vars and are not in this document.

---

## Table of Contents

1. [Scope and Non-Goals](#1-scope-and-non-goals)
2. [System Architecture](#2-system-architecture)
3. [Authentication, Authorization, and Session](#3-authentication-authorization-and-session)
4. [Data Model (MongoDB)](#4-data-model-mongodb)
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

> **New in this revision (vs. v1.0).** New collections (`hub_closures`); `refunds.requestedByRole` and `batches.qrImageUrl`; explicit batch state machine, day-boundary rule, atomic `availableQty` decrement, subscription delivery semantics, payment reconciliation cron, and a `CourierProvider` interface to be introduced in v1.1. New non-functional section "Operational SLOs" (§13.4) and "Data retention" (§10.12). New i18n target (Bangla + English, `next-intl`).

---

## 1. Scope and Non-Goals

### 1.1 In scope (v1)

- Customer-facing mobile-responsive web marketplace (browse, subscribe, order, manage account, request refunds).
- Partner/aggregator dashboard (list batches, manage inventory, view batch lifecycle).
- Admin/QC operations panel (QC inspection logging, refund management, reporting).
- Public QR product page at `/p/[batchCode]` (server-rendered, SEO-friendly, shareable).
- Subscription engine (fixed-plan weekly recurring baskets) and one-off ordering.
- Rule-based dynamic decay pricing engine.
- Payment integration via SSLCOMMERZ (bKash, Nagad, cards via hosted checkout).
- Last-mile delivery integration via Pathao API.
- Transactional email (order confirmations, password resets, refund updates) via SMTP.
- Admin-provisioned user management for `aggregator` and `qc_staff` roles.
- Public OpenAPI 3.1 docs at `/api/docs`.

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
- Multi-instance backend deployment (single-instance constraint; BullMQ/Redis in v1.1 — see PRD §9.1).
- In-app customer messaging inbox (WhatsApp only in v1; inbox in v1.1 — see PRD §9.1).
- Second last-mile courier (Pathao only in v1; Steadfast in v1.1 behind `CourierProvider` — see PRD §9.1).
- PII export and deletion endpoints (deferred to v1.1 — see PRD §9.1).
- Customizable subscriptions (fixed plans only in v1).

---

## 2. System Architecture

### 2.1 High-level diagram

```
                ┌──────────────────────────────┐
                │  Browser (mobile / desktop)  │
                └──────────────┬───────────────┘
                               │ HTTPS
                               ▼
        ┌──────────────────────────────────────────────┐
        │  Vercel — Next.js (App Router)               │
        │  ─────────────────────────────────────────   │
        │  Route groups:                                │
        │    (marketing)  /                            │
        │    (customer)   /app/...                      │
        │    (partner)    /partner/...                  │
        │    (admin)      /admin/...                    │
        │    (api)        /api/... (BFF route handlers) │
        │  Public SSR: /p/[batchCode]                   │
        └──────────────┬───────────────────────────────┘
                       │ HTTPS / JSON
                       ▼
        ┌──────────────────────────────────────────────┐
        │  Render — Node.js + Express (Backend API)    │
        │  ─────────────────────────────────────────   │
        │  RESTful API: /api/v1/*                       │
        │  Auth middleware (JWT)                        │
        │  RBAC middleware                              │
        │  Zod validation                               │
        │  Domain services (orders, batches, decay...)  │
        │  Webhook receivers (SSLCOMMERZ, Pathao)       │
        │  In-process scheduler (node-cron)             │
        └──────────────┬───────────────────────────────┘
                       │ Mongoose
                       ▼
        ┌──────────────────────────────────────────────┐
        │  MongoDB Atlas (M10)                          │
        └──────────────────────────────────────────────┘

        External:
          SSLCOMMERZ (payments)  → webhook → backend
          Pathao (delivery)      → webhook → backend
          SMTP provider          ← outbound (transactional email)
          Sentry                 ← errors (server + browser SDKs)
          Cloudinary             ← product images, QC photos
```

### 2.2 Component responsibilities

| Component | Responsibility | Owner |
|---|---|---|
| Next.js (Vercel) | UI rendering (SSR + CSR), client state, BFF route handlers for thin proxying where useful, public QR pages, OpenAPI docs UI | Tech co-founder |
| Express backend (Render) | Domain logic, RBAC enforcement, Zod validation, payment + delivery orchestration, webhook receivers, scheduled jobs | Tech co-founder |
| MongoDB Atlas | Persistent state (users, addresses, batches, orders, subscriptions, payments, deliveries, refunds, audit logs, webhook events) | Tech co-founder |
| SSLCOMMERZ | Payment processing (hosted checkout, webhooks) | Tech co-founder |
| Pathao | Last-mile delivery (order create, status webhooks, zone/area lookup) | Business co-founder |
| SMTP | Transactional email | Tech co-founder |
| Sentry | Error monitoring | Tech co-founder |
| Cloudinary | Image hosting and on-the-fly transforms | Tech co-founder |

### 2.3 Repo layout (recommended)

```
freshtrace/
├── apps/
│   ├── web/                  # Next.js (App Router)
│   │   ├── app/
│   │   │   ├── (marketing)/
│   │   │   ├── (customer)/app/
│   │   │   ├── (partner)/partner/
│   │   │   ├── (admin)/admin/
│   │   │   ├── p/[batchCode]/
│   │   │   └── api/
│   │   ├── components/
│   │   ├── lib/
│   │   └── public/
│   └── api/                  # Express backend
│       ├── src/
│       │   ├── routes/
│       │   ├── middleware/
│       │   ├── services/
│       │   ├── models/        # Mongoose schemas
│       │   ├── jobs/          # node-cron scheduled jobs
│       │   ├── webhooks/
│       │   ├── lib/
│       │   └── server.ts
│       └── tests/
├── packages/
│   └── shared/               # Zod schemas, types, decay logic (shared between web and api)
├── docs/
│   ├── PRD.md
│   └── SRS.md
├── .github/workflows/
└── README.md
```

> **Note.** The shared `packages/shared` package is the single source of truth for Zod schemas, TypeScript types, and the decay logic. Both `apps/web` and `apps/api` import from it. This is the mechanism that makes the OpenAPI spec auto-generated and the contract enforceable in CI.

---

## 3. Authentication, Authorization, and Session

### 3.1 Auth model

- **Algorithm:** JWT, HS256, server-side secret from `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET`.
- **Access token:** 15-minute lifetime, signed, returned in JSON response body on login.
- **Refresh token:** 7-day lifetime, signed, returned as httpOnly + secure + sameSite=lax cookie named `ft_refresh`.
- **Refresh rotation:** every successful refresh issues a new refresh token; the previous refresh token is invalidated server-side (tracked in a Redis-style in-memory map for v1, with a `tokenVersion` field on `users` for global invalidation).
- **Password hashing:** bcrypt, cost factor 12.
- **Session storage (server-side):** none — stateless JWT. `tokenVersion` on `users` allows global logout.
- **Logout:** clears the refresh cookie, increments `tokenVersion` (global invalidation), client drops access token from memory.

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
| `/api/v1/auth/*` | ✓ | ✓ | ✓ | ✓ |
| `/api/v1/products` (GET) | ✓ | ✓ | ✓ | ✓ |
| `/api/v1/products` (POST/PATCH/DELETE) | — | — | — | ✓ |
| `/api/v1/aggregators/*` (own) | — | ✓ | — | ✓ |
| `/api/v1/aggregators/*` (all) | — | — | — | ✓ |
| `/api/v1/batches` (POST — list new batch) | — | ✓ | — | ✓ |
| `/api/v1/batches` (GET — own batches) | — | ✓ | ✓ | ✓ |
| `/api/v1/batches/:id/qc-logs` (POST) | — | — | ✓ | ✓ |
| `/api/v1/orders` (POST — customer places) | ✓ | — | — | ✓ |
| `/api/v1/orders` (GET — own) | ✓ | — | — | ✓ |
| `/api/v1/orders` (GET — all, filter) | — | — | — | ✓ |
| `/api/v1/orders/:id/refund` (POST) | ✓ | — | — | ✓ |
| `/api/v1/subscriptions` (own) | ✓ | — | — | ✓ |
| `/api/v1/deliveries/*` | — | — | ✓ (limited view) | ✓ |
| `/api/v1/reports/*` | — | — | — | ✓ |
| `/api/v1/users` (admin) | — | — | — | ✓ |

### 3.4 Frontend auth

- Access token held in memory only (React context, not localStorage).
- Refresh token auto-used by an Axios/fetch interceptor on 401, calling `/api/v1/auth/refresh`.
- Silent refresh: if access token expires within 60s, refresh proactively.
- Server-side rendering: protected pages use a server-side session check via the refresh cookie; missing/expired refresh → redirect to `/login`.

### 3.5 Password reset (v1, email-based)

- POST `/api/v1/auth/password-reset/request` with email → server creates a single-use, 1-hour token, stores hash in `password_resets` collection, sends email with reset link.
- POST `/api/v1/auth/password-reset/confirm` with token + new password → server validates, updates password hash, invalidates all refresh tokens by incrementing `tokenVersion`.
- `password_resets` collection TTL: 24 hours after expiry.

---

## 4. Data Model (MongoDB)

All collections use Mongoose schemas. Timestamps (`createdAt`, `updatedAt`) are enabled by default on all schemas.

### 4.1 `users`

```ts
{
  _id: ObjectId,
  email: string,                 // unique, lowercase, indexed
  passwordHash: string,
  name: string,
  phone: string,                 // optional in v1
  role: 'customer' | 'aggregator' | 'qc_staff' | 'admin',
  status: 'active' | 'suspended',
  tokenVersion: number,          // global refresh-token invalidation
  lastLoginAt: Date,
  // Aggregator-specific (null for other roles)
  aggregatorProfile: {
    companyName?: string,
    contactPerson?: string,
    districts?: string[],        // e.g. ['Jashore', 'Bogura']
  } | null,
}
```

Indexes: `{ email: 1 }` unique; `{ role: 1, status: 1 }` compound.

### 4.2 `addresses`

```ts
{
  _id: ObjectId,
  userId: ObjectId,              // ref users
  label: string,                 // e.g. 'Home', 'Office'
  line1: string,
  line2: string,
  area: string,                  // e.g. 'Gulshan-2'
  city: string,                  // default 'Dhaka'
  geo: { lat: number, lng: number } | null,
  deliveryNotes: string,
  isDefault: boolean,
}
```

Indexes: `{ userId: 1, isDefault: 1 }` compound.

### 4.3 `products`

```ts
{
  _id: ObjectId,
  sku: string,                   // unique
  name: string,
  category: 'fruit' | 'vegetable' | 'other',
  defaultUnit: 'kg' | 'piece' | 'bunch',
  baseUnitPrice: number,         // BDT, integer
  imageUrl: string,
  description: string,
  originDistrict: string,        // typical origin
  harvestToShelfDays: number,    // days from harvest to delist (used by decay engine)
  isActive: boolean,
}
```

Indexes: `{ sku: 1 }` unique; `{ category: 1, isActive: 1 }` compound.

### 4.4 `batches`

```ts
{
  _id: ObjectId,
  productId: ObjectId,
  aggregatorId: ObjectId,
  batchCode: string,             // human-readable, unique, e.g. 'FT-MNG-2026-10-09-A1'
  harvestDate: ISODate,          // date only (start of day, Dhaka time)
  originDistrict: string,
  inboundQty: number,            // kg at receiving
  availableQty: number,          // kg remaining (decremented on order)
  qcStatus: 'pending' | 'passed' | 'failed',
  currentTier: 'fresh' | 'good' | 'fair' | 'near_expiry' | 'expired' | null,
  currentPriceMultiplier: number, // 1.0 / 0.8 / 0.6 / 0.3 / 0.0
  status: 'in_transit' | 'listed' | 'delisted' | 'sold_out',
  inboundAt: Date | null,
  listedAt: Date | null,
  expiresAt: Date | null,        // harvestDate + harvestToShelfDays
  qrSlug: string,                // short slug for the public QR URL
}
```

**`qrSlug` generation.** On batch creation, the server generates `qrSlug = nanoid(10)` and stores it; the public route `/p/[batchCode]` resolves via the `batchCode` for human readability, while the QR code image encodes the short URL `https://freshtrace.bd/p/{qrSlug}`. The `qrSlug` is opaque, indexed unique, and is what the printed/sticker QR encodes. (A redirect from `/p/{qrSlug}` to `/p/{batchCode}` keeps URLs tidy.)

**Batch state machine (explicit).** Valid transitions: `in_transit → listed` (after QC pass + admin confirmation); `listed → delisted` (after `tier_recompute` finds `expired`, or admin force); `listed → sold_out` (when `availableQty` reaches 0); `delisted → listed` is **not** allowed. Failed QC keeps the batch in `in_transit` with `qcStatus=failed`; admin may either discard (`status=delisted`) or re-inspect (which creates a new `batch_qc_log`).

**Validation rules on `POST /batches`.** `harvestDate` must be ≤ today (Dhaka time); future dates are rejected. `originDistrict` must be in the allowlist configured on the aggregator profile. `inboundQty` must be > 0. `batchCode` (if supplied) must be unique across the platform; auto-generated if absent.

Indexes: `{ batchCode: 1 }` unique; `{ status: 1, expiresAt: 1 }` compound; `{ aggregatorId: 1, status: 1 }` compound; `{ productId: 1, status: 1, currentTier: 1 }` compound.

**Decrement semantics.** `availableQty` is decremented at order placement using Mongoose `findOneAndUpdate` with a conditional `$gt: 0` (and `$gte: requestedQty`) check on the query filter. If the conditional update returns `null`, the order is rejected with `409 conflict` and error code `out_of_stock`; the customer is shown the actual remaining qty. This avoids oversell without a distributed lock. On order cancel/refund (full), the decrement is reverted with an equivalent atomic `$inc`.

### 4.5 `batch_qc_logs`

```ts
{
  _id: ObjectId,
  batchId: ObjectId,
  inspectorId: ObjectId,         // ref users (qc_staff or admin)
  inspectedAt: Date,
  grade: 'A' | 'B' | 'C',
  weightKg: number,
  temperatureC: number | null,
  passed: boolean,
  notes: string,
  photos: string[],              // Cloudinary URLs
}
```

Indexes: `{ batchId: 1, inspectedAt: -1 }` compound.

### 4.6 `subscription_plans`

```ts
{
  _id: ObjectId,
  name: string,                  // 'Couple Weekly', 'Family Weekly', 'Family Premium'
  basketSize: 'small' | 'medium' | 'large',
  weeklyPrice: number,           // BDT
  description: string,
  // Composition is a template: list of { productId, defaultQty }
  composition: Array<{ productId: ObjectId, defaultQty: number }>,
  isActive: boolean,
}
```

**Default plans (seeded at first admin login):**

| Plan | `basketSize` | Indicative `weeklyPrice` (BDT) | Indicative weight / SKUs |
|---|---|---|---|
| `Couple Weekly` | `small` | 1,200 | ~3 kg, 5–6 SKUs |
| `Family Weekly` | `medium` | 1,500 | ~4–5 kg, 6–8 SKUs |
| `Family Premium` | `large` | 1,800 | ~5–6 kg, 7–9 SKUs |

`weeklyPrice` is the **fresh**-tier price. Subscription orders are computed at the actual freshness tier on the delivery day, so the customer is charged the per-item tiered total, which may be lower than `weeklyPrice`. The plan `weeklyPrice` is therefore a maximum, not a fixed charge.

### 4.7 `subscriptions`

```ts
{
  _id: ObjectId,
  customerId: ObjectId,
  planId: ObjectId,
  addressId: ObjectId,
  dayOfWeek: 0 | 1 | 2 | 3 | 4 | 5 | 6,  // 0 = Sunday, 6 = Saturday
  status: 'active' | 'paused' | 'ended',
  nextDeliveryAt: Date,
  pauseUntil: Date | null,
  startedAt: Date,
  endedAt: Date | null,
}
```

Indexes: `{ customerId: 1, status: 1 }` compound; `{ status: 1, nextDeliveryAt: 1 }` compound (job query).

**Address protection.** A subscription's `addressId` may not be deleted while the subscription is `active` or `paused`. If a customer attempts to delete an address that is referenced, the API returns `409 conflict` with a list of referencing subscriptions. Address edits (e.g., line1, area) propagate to the `addressSnapshot` of any **future, unplaced** subscription renewal orders but do not retroactively change already-placed orders.

### 4.8 `orders`

```ts
{
  _id: ObjectId,
  orderCode: string,             // human-readable, unique, e.g. 'FT-ORD-2026-10-09-0001'
  customerId: ObjectId,
  subscriptionId: ObjectId | null,
  addressSnapshot: { ... },      // denormalized at order time
  items: Array<{
    batchId: ObjectId,
    productId: ObjectId,
    name: string,                // denormalized
    qty: number,
    unitPrice: number,           // applied price (after tier discount)
    lineTotal: number,
    freshnessTierAtOrder: 'fresh' | 'good' | 'fair' | 'near_expiry',
  }>,
  totals: {
    subtotal: number,
    deliveryFee: number,
    discount: number,            // subscription / promo discount
    grandTotal: number,
  },
  paymentInfo: {
    gateway: 'sslcommerz',
    gatewayTxnId: string | null,
    method: 'bKash' | 'Nagad' | 'card' | null,
    status: 'pending' | 'paid' | 'failed' | 'refunded' | 'partially_refunded',
    paidAt: Date | null,
  },
  status: 'pending_payment' | 'paid' | 'in_fulfillment' | 'in_transit' | 'delivered' | 'cancelled' | 'refunded',
  placedAt: Date,
  deliveredAt: Date | null,
  refundInfo: {
    requestedAt: Date | null,
    reason: string | null,
    resolvedAt: Date | null,
    amount: number,
  } | null,
}
```

Indexes: `{ orderCode: 1 }` unique; `{ customerId: 1, placedAt: -1 }` compound; `{ status: 1, placedAt: -1 }` compound; `{ 'paymentInfo.status': 1 }`.

### 4.9 `deliveries`

```ts
{
  _id: ObjectId,
  orderId: ObjectId,
  courier: 'pathao',
  courierOrderId: string | null,
  courierTrackingId: string | null,
  courierStatus: 'created' | 'picked_up' | 'in_transit' | 'delivered' | 'cancelled' | 'failed',
  assignedAt: Date,
  pickedUpAt: Date | null,
  deliveredAt: Date | null,
  riderInfo: { name: string, phone: string } | null,
  lastWebhookAt: Date | null,
  failureReason: string | null,
}
```

Indexes: `{ orderId: 1 }` unique; `{ courierOrderId: 1 }` unique (sparse); `{ courierStatus: 1 }`.

### 4.10 `refunds`

```ts
{
  _id: ObjectId,
  orderId: ObjectId,
  requestedBy: ObjectId,
  requestedByRole: 'customer' | 'qc_staff' | 'admin',
  reason: string,
  items: Array<{ orderItemIndex: number, qty: number, amount: number }>,
  amount: number,
  status: 'requested' | 'approved' | 'rejected' | 'processed',
  resolvedBy: ObjectId | null,
  resolvedAt: Date | null,
  gatewayRefundRef: string | null,
}
```

Indexes: `{ orderId: 1 }`; `{ status: 1, requestedAt: -1 }` compound.

### 4.11 `payments`

Denormalized history of gateway transactions. Mirrored from `orders.paymentInfo` for audit and reconciliation.

```ts
{
  _id: ObjectId,
  orderId: ObjectId,
  gateway: 'sslcommerz',
  gatewayTxnId: string,
  method: string,
  amount: number,
  status: 'initiated' | 'success' | 'failed' | 'cancelled' | 'refunded',
  rawPayload: object,            // full SSLCOMMERZ response
  receivedAt: Date,
}
```

Indexes: `{ orderId: 1 }`; `{ gatewayTxnId: 1 }` unique.

### 4.12 `webhook_events`

Idempotent record of every inbound webhook.

```ts
{
  _id: ObjectId,
  source: 'sslcommerz' | 'pathao',
  eventType: string,
  payload: object,
  receivedAt: Date,
  processedAt: Date | null,
  status: 'pending' | 'processed' | 'failed',
  retryCount: number,
  lastError: string | null,
}
```

Indexes: `{ source: 1, eventType: 1, receivedAt: -1 }` compound; TTL `{ receivedAt: 1 }` expireAfterSeconds: 2592000 (30 days).

### 4.13 `audit_logs`

```ts
{
  _id: ObjectId,
  actorId: ObjectId | null,
  actorRole: 'customer' | 'aggregator' | 'qc_staff' | 'admin' | 'system',
  action: string,                // e.g. 'order.refund.approve'
  entity: string,                // e.g. 'Order'
  entityId: ObjectId,
  before: object | null,
  after: object | null,
  ip: string,
  userAgent: string,
  createdAt: Date,
}
```

Indexes: `{ entity: 1, entityId: 1, createdAt: -1 }` compound; `{ actorId: 1, createdAt: -1 }` compound; TTL `{ createdAt: 1 }` expireAfterSeconds: 31536000 (365 days).

### 4.14 `password_resets`

```ts
{
  _id: ObjectId,
  userId: ObjectId,
  tokenHash: string,             // sha256 of the reset token
  expiresAt: Date,
  usedAt: Date | null,
  createdAt: Date,
}
```

Indexes: `{ tokenHash: 1 }` unique; TTL `{ expiresAt: 1 }` expireAfterSeconds: 86400 (24h after expiry).

### 4.15 `hub_closures`

```ts
{
  _id: ObjectId,
  date: ISODate,                 // date only (Dhaka time)
  reason: string,                // 'public_holiday', 'weather', 'maintenance', etc.
  createdBy: ObjectId,           // ref users (admin)
  createdAt: Date,
}
```

Indexes: `{ date: 1 }` unique. Used by `subscription_renewal` and `delivery_assignment` to auto-skip the affected week.

---

## 5. Freshness Decay Logic

The decay engine is a pure function plus a thin persistence layer. It is the **core product logic** of FreshTrace and lives in `packages/shared/decay/` so both the API and any future pricing service share one implementation.

### 5.1 Tier table

| Days from harvest | Tier | Price multiplier | Action |
|---|---|---|---|
| 0–1 | `fresh` | 1.00 | list |
| 2–3 | `good` | 0.80 | list |
| 4–5 | `fair` | 0.60 | list |
| 6 to `harvestToShelfDays` | `near_expiry` | 0.30 | list_with_warning |
| > `harvestToShelfDays` | `expired` | 0.00 | delist |

### 5.2 Function signature

```ts
type Tier = 'fresh' | 'good' | 'fair' | 'near_expiry' | 'expired';

interface DecayResult {
  tier: Tier;
  multiplier: number;        // 1.00, 0.80, 0.60, 0.30, 0.00
  action: 'list' | 'list_with_warning' | 'delist';
  daysSinceHarvest: number;
  remainingShelfDays: number;
}

function computeDecay(
  harvestDate: Date,
  now: Date,
  harvestToShelfDays: number
): DecayResult;
```

**Day-boundary rule.** `daysSinceHarvest` is computed as `Math.floor((nowUtc - harvestMidnightDhaka) / 86_400_000)`, where `harvestMidnightDhaka` is `harvestDate` interpreted as 00:00 in `Asia/Dhaka`. This makes Day 0 cover `[00:00, 24:00)` Dhaka on the harvest day, Day 1 the next full Dhaka day, etc. Tier assignment uses `daysSinceHarvest` against the table above, so a batch with `harvestDate = 2026-10-09` is `fresh` for the entirety of 2026-10-09 and 2026-10-10, transitions to `good` at 00:00 Dhaka time on 2026-10-11, and so on. `Math.floor` is the boundary rule; half-day rules are explicitly not supported in v1.

### 5.3 Pricing application

`displayedUnitPrice = product.baseUnitPrice * decayResult.multiplier`

The customer sees the discounted price; the `currentPriceMultiplier` on the batch record is the source of truth for analytics and refunds.

### 5.4 Recompute triggers

1. **On read** — every API request that returns a batch or a list of batches runs `computeDecay` against `now` and uses the result. The persisted `currentTier` is a cache.
2. **Scheduled job (every 15 min)** — updates `currentTier` and `currentPriceMultiplier` for all `status=listed` batches; emits a `batch.delisted` event for any that crossed into `expired`.
3. **On QC pass** — immediately recomputes and persists.
4. **On order placement** — uses the on-read result; does not mutate batch state on read.

### 5.5 Time zone handling

All `harvestDate` values are stored as midnight Dhaka time (UTC+06:00). The decay function takes a `now` parameter so it is timezone-agnostic; callers pass `new Date()` in UTC. The frontend renders all dates in `Asia/Dhaka` via `Intl.DateTimeFormat`.

---

## 6. REST API Specification

Base path: `/api/v1`. All requests and responses are JSON. All errors use the standard error envelope.

### 6.1 Standard error envelope

```json
{
  "error": {
    "code": "string_constant",
    "message": "human-readable message",
    "details": { } // optional, for 422 validation errors
  }
}
```

Standard error codes: `unauthenticated`, `forbidden`, `not_found`, `conflict`, `validation_failed`, `rate_limited`, `payment_failed`, `delivery_unavailable`, `internal_error`.

### 6.2 Pagination

Cursor-based. Lists return:

```json
{
  "data": [ ],
  "pageInfo": {
    "nextCursor": "string | null",
    "hasMore": true | false
  }
}
```

Query params: `?cursor=<opaque>&limit=<int 1-100, default 20>`.

### 6.3 Idempotency

POSTs that create orders, refunds, or payments require an `Idempotency-Key` header. The backend hashes the key + userId + route and stores the response; subsequent requests with the same key return the stored response.

### 6.4 Endpoints

#### 6.4.1 Auth

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/auth/register` | none | Create customer account. Body: `{ email, password, name, phone? }` |
| POST | `/auth/login` | none | Issue access token + refresh cookie. Body: `{ email, password }` |
| POST | `/auth/refresh` | refresh cookie | Rotate tokens |
| POST | `/auth/logout` | any | Clear refresh cookie, increment `tokenVersion` |
| POST | `/auth/password-reset/request` | none | Email reset link |
| POST | `/auth/password-reset/confirm` | none | Set new password |
| GET | `/auth/me` | any | Current user profile |

#### 6.4.2 Products

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/products` | any | List active products |
| GET | `/products/:id` | any | Product detail |
| GET | `/products/:id/available-batches` | any | List batches that are `listed` for this product, with current freshness tier and price (used by the consumer browse page) |
| POST | `/products` | admin | Create |
| PATCH | `/products/:id` | admin | Update |
| DELETE | `/products/:id` | admin | Soft-delete (`isActive=false`) |

#### 6.4.3 Aggregators (admin) / aggregator profile (self)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/aggregators` | admin | List aggregators |
| POST | `/aggregators` | admin | Provision aggregator account + profile |
| GET | `/aggregators/:id` | admin or self | Aggregator detail |
| PATCH | `/aggregators/:id` | admin | Update profile |
| POST | `/aggregators/:id/suspend` | admin | Suspend account |
| GET | `/aggregators/me/profile` | aggregator | Own profile |
| PATCH | `/aggregators/me/profile` | aggregator | Update own profile |

#### 6.4.4 Batches

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/batches` | aggregator or admin | List a new batch. Body: `{ productId, harvestDate, originDistrict, inboundQty, batchCode? }` |
| GET | `/batches` | aggregator (own) / qc_staff (assigned) / admin (all) | List batches with filters `?status=&aggregatorId=&tier=&from=&to=` |
| GET | `/batches/:id` | aggregator (own) / qc_staff / admin | Batch detail |
| POST | `/batches/:id/qc-logs` | qc_staff or admin | Log QC inspection. Body: `{ grade, weightKg, temperatureC?, passed, notes, photos[] }` |
| POST | `/batches/:id/list` | admin | Force status `in_transit → listed` (after QC) |
| POST | `/batches/:id/delist` | admin | Force delist |

Public (no auth):
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/batches/by-slug/:qrSlug` | none | Public read for the QR product page |

#### 6.4.5 Orders

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/orders` | customer | Place an order (one-off). Requires `Idempotency-Key`. Body: `{ items: [{ batchId, qty }], addressId, paymentMethod }` |
| GET | `/orders` | customer (own) / admin (all) | List orders with filters `?status=&from=&to=` |
| GET | `/orders/:id` | customer (own) / admin | Order detail |
| POST | `/orders/:id/cancel` | customer (own, before `paid`) / admin | Cancel pending order |
| POST | `/orders/:id/refund` | customer (own, after `delivered`) / admin | Request refund. Body: `{ reason, items: [{ index, qty }] }` |
| POST | `/orders/:id/refund/approve` | admin | Approve a refund request |
| POST | `/orders/:id/refund/reject` | admin | Reject with reason |

**Refund formula.** Refund amount is the **price actually paid**: `unitPrice * qty` where `unitPrice` is the discounted (tier-applied) price captured in the order line. Refunds never revert to the un-discounted `baseUnitPrice`. The same rule applies to `near_expiry` items (the customer gets back what they paid for a `near_expiry` item, not the `fresh` SKU price).

#### 6.4.6 Subscriptions

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/subscriptions/plans` | any | List active plans |
| POST | `/subscriptions` | customer | Subscribe. Body: `{ planId, addressId, dayOfWeek }` |
| GET | `/subscriptions/me` | customer | List own subscriptions |
| GET | `/subscriptions/:id` | customer (own) / admin | Subscription detail |
| POST | `/subscriptions/:id/pause` | customer (own) | Pause; body: `{ until }` |
| POST | `/subscriptions/:id/resume` | customer (own) | Resume |
| POST | `/subscriptions/:id/cancel` | customer (own) | End subscription |

#### 6.4.7 Deliveries

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/deliveries` | admin / qc_staff | List deliveries with filters `?status=&date=` |
| GET | `/deliveries/by-order/:orderId` | admin / qc_staff / customer (own) | Delivery for an order |
| POST | `/deliveries/:id/refresh-status` | admin | Force-refetch from courier |

#### 6.4.8 Webhooks (no auth — signature-verified)

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/webhooks/sslcommerz` | HMAC signature | SSLCOMMERZ IPN |
| POST | `/webhooks/pathao` | HMAC signature | Pathao order status |

#### 6.4.9 Reports (admin)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/reports/orders/summary` | admin | Counts + revenue for a date range |
| GET | `/reports/batches/qc-pass-rate` | admin | QC pass rate over time |
| GET | `/reports/refunds/summary` | admin | Refund rate and reasons |
| GET | `/reports/subscriptions/summary` | admin | Active subs, churn, MRR |
| GET | `/reports/dashboard` | admin | Top-level KPIs for the admin home |

#### 6.4.10 Users (admin)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/users` | admin | List users with role filter |
| POST | `/users` | admin | Provision aggregator or qc_staff |
| PATCH | `/users/:id` | admin | Update user (status, role) |
| POST | `/users/:id/suspend` | admin | Suspend |
| POST | `/users/:id/reset-password` | admin | Force-reset and email temporary password |

#### 6.4.11 Hub closures (admin)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/hub-closures` | admin | List closures |
| POST | `/hub-closures` | admin | Create a closure. Body: `{ date, reason }` |
| DELETE | `/hub-closures/:id` | admin | Remove a closure |

### 6.5 OpenAPI generation

- Source: Zod schemas in `packages/shared/schemas/`.
- Tool: `zod-to-openapi` + `swagger-ui-express` mounted at `/api/docs`.
- Generated at server startup; the same schemas are reused for runtime validation.
- CI check: the generated `openapi.json` is checked in to detect schema drift.

---

## 7. External Integrations

### 7.1 SSLCOMMERZ (payments)

- **Mode:** Hosted checkout (no PCI scope).
- **Initiation:** backend creates a session via `https://sandbox.sslcommerz.com/gwprocess/v4/api.php` (sandbox) or live equivalent, passing `total_amount`, `tran_id`, `success_url`, `fail_url`, `cancel_url`, `store_id`, `store_passwd`, `cus_name`, `cus_email`, `cus_phone`, `cus_add1`, `product_name`, `product_category`, `product_profile`.
- **Order link:** `session.redirectGatewayURL` is returned to the customer; the backend returns it in the order-create response and the frontend redirects.
- **IPN (webhook):** `https://api.freshtrace.bd/api/v1/webhooks/sslcommerz` with `POST` body containing `tran_id`, `val_id`, `amount`, `card_type`, `status`, etc. Backend verifies the HMAC signature using the store passwd, then updates the `Order.paymentInfo` and `Payment` records.
- **Refund:** `https://sandbox.sslcommerz.com/validator/api/merchantTransIDvalidationAPI.php` for status; `https://sandbox.sslcommerz.com/validator/api/merchantTransIDvalidationAPI.php` for refund initiation (the SSLCOMMERZ refund API is initiated server-to-server; refer to current SSLCOMMERZ docs for the exact endpoint — contract in code, vendor specifics in env).
- **Required env:** `SSLCOMMERZ_STORE_ID`, `SSLCOMMERZ_STORE_PASSWD`, `SSLCOMMERZ_SANDBOX=true|false`, `SSLCOMMERZ_SUCCESS_URL`, `SSLCOMMERZ_FAIL_URL`, `SSLCOMMERZ_CANCEL_URL`, `SSLCOMMERZ_IPN_URL`.

### 7.2 Pathao (last-mile delivery)

- **Auth:** OAuth2 client_credentials; backend caches the access token until expiry.
- **Order create:** `POST /aladdin/api/v1/orders` with `store_id`, `merchant_order_id`, `recipient_name`, `recipient_phone`, `recipient_address`, `recipient_city`, `recipient_zone`, `recipient_area`, `delivery_type`, `item_type`, `special_instruction`, `item_quantity`, `item_weight`, `amount_to_collect`, `delivery_fee`.
- **City/zone/area lookup:** `GET /aladdin/api/v1/cities`, `GET /aladdin/api/v1/cities/{city_id}/zones`, `GET /aladdin/api/v1/zones/{zone_id}/areas`. The `delivery_assignment_job` looks up zone/area from the customer's address.
- **Webhook:** `https://api.freshtrace.bd/api/v1/webhooks/pathao` with `POST` body containing `order_id`, `status` (`Picked Up`, `In Transit`, `Delivered`, `Cancelled`, `Failed`), `rider` info. Backend verifies HMAC signature.
- **Required env:** `PATHAO_CLIENT_ID`, `PATHAO_CLIENT_SECRET`, `PATHAO_BASE_URL`, `PATHAO_STORE_ID`, `PATHAO_WEBHOOK_SECRET`.

### 7.3 SMTP (transactional email)

- **Provider:** TBD in Phase 0 (Nodemailer-compatible: SES, SendGrid, Mailgun, or BD-specialist). The contract below is provider-agnostic.
- **Templates:** order confirmation, order shipped, order delivered, refund approved, refund rejected, password reset, account provisioned, weekly subscription summary.
- **Required env:** `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`.

### 7.4 Sentry

- Server-side: `apps/api` initialized with DSN from `SENTRY_DSN_API`.
- Browser: `apps/web` initialized with DSN from `SENTRY_DSN_WEB`.
- Source maps uploaded on Vercel + Render deploys.

### 7.5 Cloudinary

- Used for product images (admin-uploaded) and QC photos (qc_staff-uploaded via admin panel).
- Upload preset: signed, restricted to backend credentials.
- Transformations on delivery: `f_auto,q_auto,w_800` for product cards, `w_1200` for QC full-res.

### 7.6 QR code generation

- **Library:** `qrcode` (Node), server-side, no third-party QR service required.
- **Output:** a PNG (300×300 px) uploaded to Cloudinary via the signed preset, returned as a stable URL on the `batches.qrImageUrl` (added to §4.4 in v1).
- **Print pipeline:** out of scope (stickers are produced by the QC lead from the Cloudinary URL during the hub workflow).

---

## 8. Background Jobs and Scheduling

### 8.1 Job runner

- **v1:** `node-cron` with a single-instance lock (a Mongo-backed `scheduler_locks` collection with TTL 5 min) to prevent duplicate execution. **This is a hard v1 constraint: the backend must run on a single instance until BullMQ is added in v1.1.**
- **v1.1 (deferred):** migrate to BullMQ on Redis for multi-instance, retries, and observability.

### 8.2 Scheduled jobs

| Job | Schedule (Dhaka time) | Description |
|---|---|---|
| `tier_recompute` | every 15 min | Re-evaluates all `status=listed` batches; updates `currentTier` and `currentPriceMultiplier`; emits `batch.delisted` events for newly expired batches. |
| `subscription_renewal` | daily 02:00 | Creates next-week `orders` for active subscriptions whose `nextDeliveryAt` is in the next 24h. |
| `delivery_assignment` | daily 06:00 | Groups next-day paid orders by zone; calls Pathao `order/create` per order. |
| `webhook_retry` | every 5 min | Retries `webhook_events` with `status=failed` and `retryCount < 5`, exponential backoff (1m, 5m, 15m, 1h, 6h). |
| `expiry_sweep` | daily 03:00 | Hard-deletes `webhook_events` older than 30 days and `audit_logs` older than 365 days (TTL index handles most, this is a safety net). |

### 8.3 Event emission

Jobs emit events to an internal event log (`job_events` collection, optional in v1) for debugging. Production observability is via Sentry and structured logs.

### 8.4 Subscription delivery semantics

- **Fixed weekly `dayOfWeek`.** A subscription has exactly one delivery day per week (e.g., Friday). `nextDeliveryAt` is advanced by 7 days on each successful renewal.
- **Holiday / hub-closure auto-skip.** The admin maintains a `hub_closures` collection (date, reason). The `subscription_renewal` job skips any subscription whose `nextDeliveryAt` falls on a closure; the order is **not** placed; `nextDeliveryAt` is advanced by 7 days; the customer is notified by email ("This week's delivery skipped due to {reason}; your next delivery is on {date}").
- **Freshness disclosure at checkout.** For subscription orders, the renewal job pre-computes the freshness tier each item will have on the planned delivery day. The customer's order confirmation page lists each item with its expected tier and price. If any item is `expired` at the time the renewal job would create the order, that item is dropped from the basket and the customer is notified; the order is still placed for the remaining items.
- **Pause/resume interaction with `nextDeliveryAt`.** Pausing sets `pauseUntil` and stops the renewal job from acting on it. Resuming clears `pauseUntil` and recomputes `nextDeliveryAt` to the next occurrence of the chosen `dayOfWeek` that is ≥ today and not in a closure.

### 8.5 Payment reconciliation (v1)

A `payment_reconciliation` cron runs daily at 04:00 Dhaka. For any order in `pending_payment` older than 30 minutes, it calls the SSLCOMMERZ transaction-validation API by `tran_id`. If SSLCOMMERZ reports `VALID`, the order is marked `paid` and treated as a successful payment (the missing webhook is considered lost). If `INVALID` or `CANCELLED`, the order is marked `failed` and any reserved batch `availableQty` is reverted. Maximum retry window: 7 days; after that the order is `cancelled` and the customer is emailed a payment-status update.

---

## 9. Frontend Architecture (Next.js App Router)

### 9.1 Routing

```
app/
├── (marketing)/
│   ├── page.tsx                    # Landing
│   ├── about/page.tsx
│   └── how-it-works/page.tsx
├── (customer)/
│   ├── layout.tsx                  # Customer shell (header, footer, auth guard)
│   └── app/
│       ├── page.tsx                # Home (browse, featured)
│       ├── products/page.tsx       # Catalog
│       ├── products/[sku]/page.tsx # Product detail
│       ├── subscriptions/page.tsx  # Plans
│       ├── cart/page.tsx
│       ├── checkout/page.tsx
│       ├── orders/page.tsx         # Order history
│       ├── orders/[id]/page.tsx    # Order detail
│       ├── subscriptions/me/page.tsx
│       ├── account/page.tsx
│       ├── account/addresses/page.tsx
│       └── account/password/page.tsx
├── (partner)/
│   ├── layout.tsx                  # Aggregator shell
│   └── partner/
│       ├── page.tsx                # Dashboard
│       ├── batches/page.tsx
│       ├── batches/new/page.tsx
│       ├── batches/[id]/page.tsx
│       ├── orders/page.tsx
│       └── profile/page.tsx
├── (admin)/
│   ├── layout.tsx                  # Admin / QC shell
│   └── admin/
│       ├── page.tsx                # KPIs
│       ├── users/page.tsx
│       ├── products/page.tsx
│       ├── batches/page.tsx
│       ├── batches/[id]/qc/page.tsx
│       ├── orders/page.tsx
│       ├── orders/[id]/page.tsx
│       ├── refunds/page.tsx
│       ├── subscriptions/page.tsx
│       └── reports/page.tsx
├── (auth)/
│   ├── login/page.tsx
│   ├── register/page.tsx
│   ├── forgot-password/page.tsx
│   └── reset-password/[token]/page.tsx
├── p/[batchCode]/
│   └── page.tsx                    # Public QR product page (SSR)
├── api/
│   ├── auth/[...nextauth]/route.ts # (optional; if NextAuth is adopted, otherwise BFF handlers)
│   ├── docs/route.ts               # BFF for the OpenAPI UI
│   └── health/route.ts             # (optional; primary /health is on the Express backend)
├── layout.tsx
├── globals.css
└── not-found.tsx
```

### 9.2 Server vs client components

| Route | Render mode | Why |
|---|---|---|
| `/` (marketing home) | Server Component | SEO, performance |
| `/products` | Server Component (list) + Client Component (filters) | Initial paint is SSR; filters are interactive |
| `/products/[sku]` | Server Component | SEO |
| `/p/[batchCode]` | Server Component | SEO + shareability; freshness tier rendered server-side |
| `/app/*` (customer) | Client Component | Authenticated, interactive |
| `/partner/*` | Client Component | Authenticated, interactive |
| `/admin/*` | Client Component | Authenticated, interactive |
| `/login`, `/register` | Client Component | Forms |

### 9.3 Data fetching

- **Public pages (SSR):** Next.js `fetch` with `revalidate` for catalog; product detail revalidated on demand via `revalidatePath` from the admin panel.
- **Authenticated dashboards:** TanStack Query. Cache keys scoped by user role.
- **Mutations:** TanStack Query `useMutation` with optimistic updates where safe (e.g., cart).
- **Auth state:** React context; the silent refresh lives in a top-level `AuthProvider` client component.

### 9.4 Forms

- React Hook Form + `@hookform/resolvers/zod`.
- Shared Zod schemas from `packages/shared/schemas/` reused on both client (form validation) and server (API validation).

### 9.5 UI library

- Tailwind CSS for styling.
- shadcn/ui (Radix primitives) for accessible components: dialog, dropdown, toast, tabs, table, select, etc.
- Icons: `lucide-react`.
- Date utilities: `date-fns` (timezone-aware via `date-fns-tz`).
- i18n: `next-intl` from day one. Default locale `bn-BD`, with `en` as a secondary. All user-facing strings live in `messages/{locale}.json`. Number and currency formatting use `Intl.NumberFormat('bn-BD' | 'en-BD', { style: 'currency', currency: 'BDT' })`.

### 9.6 Public QR product page (`/p/[batchCode]`)

- Server Component; resolves `batchCode` to a batch via the backend (or a direct Mongoose read in the same process if backend is colocated; in v1, separate process, so it calls the backend).
- Renders: product name, harvest date, origin district, freshness tier badge, current price, supply-chain journey (a vertical timeline: harvest → received at hub → QC passed → listed → in transit → delivered).
- Includes a small "Verify this batch" callout showing the `batchCode` and a "Powered by FreshTrace" footer.
- No auth required.

---

## 10. Security

### 10.1 Transport

- HTTPS only. TLS terminated at Vercel and Render.
- HSTS header (1 year, includeSubDomains, preload) via Helmet.
- HTTP→HTTPS redirect at both Vercel and Render edges.

### 10.2 Cookies and headers

- `ft_refresh` cookie: `httpOnly`, `secure`, `sameSite=lax`, path `/api/v1/auth`, maxAge 7 days.
- Helmet defaults: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Strict-Transport-Security`, etc.
- CSP: a strict policy in production; relaxed in development. (Specific policy in `helmet.config.ts` — left to the implementer, must allow Cloudinary and Sentry origins.)

### 10.3 CORS

- Allowlist: `https://freshtrace.bd`, `https://app.freshtrace.bd`, `https://admin.freshtrace.bd`, `https://partner.freshtrace.bd` (and `http://localhost:3000` in dev).
- Credentials: enabled (so the refresh cookie works).

### 10.4 Input validation

- Every API request body, query, and params validated by Zod middleware before the route handler runs.
- Zod schemas in `packages/shared/schemas/` are the single source of truth.

### 10.5 Secrets management

- `.env.example` checked in; real `.env` files gitignored.
- Local dev: `.env` per package.
- Production: platform-native secret store (Vercel env vars, Render env vars, MongoDB Atlas connection string in Render secrets).
- Rotation policy: `JWT_*_SECRET`, `PATHAO_CLIENT_SECRET`, `SSLCOMMERZ_STORE_PASSWD`, `SMTP_PASS` rotated every 90 days; rotation script in `scripts/rotate-secrets.sh` (TBD).

### 10.6 Dependency hygiene

- GitHub Dependabot enabled.
- `npm audit --audit-level=high` in CI; failing CI on `high` or `critical`.
- Renovate (optional, recommended) for automated PRs.

### 10.7 Rate limiting

- Global: 100 req/min per IP for unauthenticated routes; 600 req/min per user for authenticated.
- Strict: 10 req/min on `/api/v1/auth/login`, `/api/v1/auth/register`, `/api/v1/auth/password-reset/request`.
- Strict: 30 req/min on `/api/v1/orders` POST and `/api/v1/orders/:id/refund` POST.
- Storage: in-memory in v1 (per-instance, single-instance safe); Redis in v1.1.

### 10.8 PII

- Customer name, email, phone, addresses are PII. Stored in MongoDB Atlas with at-rest encryption enabled (Atlas default).
- No PII in logs.
- No PII in Sentry breadcrumbs.
- Data export and deletion: out of scope for v1 (planned for v1.1 — see PRD §9.1).

### 10.9 Audit

- All write actions (order, refund, batch state change, user provisioning) emit `audit_logs`.
- Refund approval and user suspension are double-audited (actor + resolver both logged).

### 10.10 Clock skew & timestamp policy

- All `Date` values are stored in UTC. `harvestDate` is **date-only** (midnight in `Asia/Dhaka` = 18:00 UTC the previous day) and is treated as a calendar date, not a moment.
- Server time is synced via NTP (`chrony`) on the Render host; tolerance is ± 60 s. The decay cron uses server-local UTC but reports its "Dhaka time" via `Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka' })`.
- Inbound webhooks carry their own timestamps from the source (SSLCOMMERZ, Pathao). The server trusts the source timestamp for the entity but records `receivedAt` (server UTC) on `webhook_events` for ordering.
- Webhooks are **not** guaranteed in order. State transitions are written defensively (only `pending → paid`, `created → in_transit`, etc., never backwards). Stale webhooks (> 30 min older than the current entity state) are logged but not applied.

### 10.11 Network failure handling (BFF → API)

- The Next.js BFF route handlers use a fetch with a 5 s connect timeout and 2 retries (exponential backoff 250 ms, 1 s) on connection refused or 5xx. 4xx responses are surfaced to the client as-is.
- 401 from the API triggers a single refresh attempt; on second 401, the user is redirected to `/login`.
- 503 from the API on critical paths (order placement, refund) is rendered to the customer as a friendly retry screen; the request is **not** auto-retried by the client (to avoid double-submit with the server's idempotency layer).

### 10.12 Data retention (v1)

| Data | Retention | Mechanism |
|---|---|---|
| Orders, refunds, payments | Indefinite (business record) | None |
| Audit logs | 365 days | TTL index on `createdAt` |
| Webhook events | 30 days | TTL index on `receivedAt` |
| Password reset tokens | 24 h after expiry | TTL index on `expiresAt` |
| Session refresh tokens | 7 days (matches JWT TTL) | Implicit expiry |
| Customer PII (name, email, phone, address) | Account lifetime + 30 days after deletion request | Manual purge on support request until v1.1 export/deletion endpoints |
| Cloudinary assets (product images, QC photos) | Indefinite | Manual cleanup; QC photos attached to a `batch_qc_log` are kept as long as the log |
| Sentry events | 90 days (Sentry default) | Sentry-side retention |

A documented `scripts/purge-account.ts` script is provided for manual PII purge on support request, ahead of the v1.1 self-service endpoints.

---

## 11. Observability and Operations

### 11.1 Health endpoints

- `GET /health` (Express): returns `{ status: 'ok', db: 'ok' | 'error', uptime, version }`. Always 200 unless DB is unreachable, in which case 503.
- `GET /ready` (Express): returns 200 only when DB and (v1.1+) Redis are reachable; 503 otherwise.

### 11.2 Logging

- `pino` for structured JSON logs.
- Log levels: `info` (default), `warn`, `error`, `debug` (env-driven).
- HTTP request logging middleware (pino-http) with request ID propagation.
- Sensitive fields stripped: `password`, `token`, `authorization`, `cookie`, `secret`.

### 11.3 Error tracking

- Sentry (server + browser SDKs).
- Source maps uploaded on deploy.
- Release tagging tied to git SHA.

### 11.4 Metrics and dashboards (v1: minimum viable)

- Sentry for errors and performance.
- Render built-in metrics for backend.
- Vercel built-in analytics for web.
- Custom KPIs surfaced in `/admin` (orders/day, gross margin/basket, refund rate, QC pass rate) — implemented as admin dashboard queries, not a separate metrics system.

### 11.5 Uptime monitoring

- UptimeRobot or Better Stack pings `/health` and `/ready` every 1 minute.
- Alerting: PagerDuty or simple email/SMS on two consecutive failures.

---

## 12. Deployment Topology

### 12.1 Environments

| Env | Frontend | Backend | Database | Purpose |
|---|---|---|---|---|
| Local | `localhost:3000` | `localhost:4000` | MongoDB local or Atlas dev cluster | Dev |
| Preview (PR) | Vercel preview URL | Render preview service (manual promote for now) | Atlas dev cluster | Per-PR review |
| Staging | `staging.freshtrace.bd` | Render staging service | Atlas staging cluster | Pre-prod verification |
| Production | `freshtrace.bd` (and subdomains) | Render production service | Atlas production cluster (M10) | Live |

### 12.2 CI/CD

- **GitHub Actions** workflows:
  - `ci.yml` on every PR: lint, typecheck, unit tests, OpenAPI drift check, `npm audit`.
  - `deploy-web.yml` on merge to `main`: deploy to Vercel production.
  - `deploy-api.yml` on merge to `main`: deploy to Render production (auto-deploy configured in Render, but the GitHub Action runs post-deploy smoke tests).

### 12.3 Domain and DNS

- Primary: `freshtrace.bd`.
- Subdomains: `app.freshtrace.bd` (customer), `partner.freshtrace.bd` (aggregator), `admin.freshtrace.bd` (admin/QC).
- DNS via the registrar used in Phase 0; specific provider TBD.

### 12.4 Database

- **MongoDB Atlas** M10 (or higher if the team sizes up; v1 is M10 by default).
- **Backups:** Atlas automated daily backups, 7-day point-in-time recovery.
- **Connection string** stored in `MONGODB_URI` env var on Render.
- **Database name:** `freshtrace` (production), `freshtrace_staging` (staging), `freshtrace_dev` (dev).

### 12.5 File storage

- **Cloudinary** for product images and QC photos. Credentials in `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `CLOUDINARY_UPLOAD_PRESET`.

---

## 13. Performance and Scaling Constraints

### 13.1 v1 performance targets

| Surface | Target |
|---|---|
| Landing / marketing pages TTFB | < 300 ms (p95) |
| Product list API | < 250 ms (p95) |
| Product detail API | < 200 ms (p95) |
| Order placement end-to-end | < 1.5 s (p95) |
| QR product page TTFB | < 400 ms (p95) |
| Admin dashboard initial load | < 1.5 s (p95) |

### 13.2 v1 scaling constraints (hard)

- **Backend must run on a single instance** (single-instance lock for `node-cron`). Multi-instance deploy requires BullMQ/Redis, deferred to v1.1.
- **No horizontal autoscaling on the backend** in v1.
- **Frontend can scale horizontally on Vercel** (default).
- **Database:** single Atlas cluster, single primary. Read replicas out of scope for v1.

### 13.3 Known v1 limits (documented)

- One QC hub, manual receiving, max ~200–300 kg inbound per day with the planned 2–4 staff.
- Subscription renewal job runs once daily; weekly cadence only.
- No real-time courier tracking beyond Pathao webhook polling (no background polling job in v1; webhooks only).
- No multi-currency; BDT only.

### 13.4 Operational SLOs (v1)

| Surface | Target |
|---|---|
| Monthly availability | 99.0% (best-effort, no formal SLA) |
| Recovery Point Objective (RPO) | 24h (Atlas daily backup) |
| Recovery Time Objective (RTO) | 4h (documented runbook only; no DR drill in v1) |
| Customer support response (WhatsApp) | 4 business hours, Mon–Sat 09:00–19:00 Dhaka |
| Email deliverability | SPF, DKIM, DMARC configured for `freshtrace.bd` before pilot |
| Languages | `en`, `bn-BD` (default Bangla); `next-intl` from day one |
| Accessibility (customer-facing) | WCAG 2.1 AA |
| Accessibility (partner / admin) | Best-effort |
| Browser support | Last 2 versions of Chrome, Edge, Safari, Firefox; iOS Safari 15+; Android Chrome 100+ |

### 13.5 Capacity planning (v1)

- **Concurrent API users:** 200 (orders during a Friday 17:00–21:00 burst). Backend is single-instance and sized for this peak.
- **Subscription renewal job:** must complete in < 60 s for 500 active subscriptions (v1 target).
- **QC throughput:** 200–300 kg/day inbound, ≤ 2 hours from receiving to listed.
- **Webhook burst:** 200 webhook events/min sustained. No background polling in v1.

---

## 14. Testing Requirements

### 14.1 Test pyramid

| Layer | Tooling | Coverage target |
|---|---|---|
| Unit | Vitest (or Jest) for `packages/shared` and `apps/api/src/services` | 80% line coverage on services |
| Integration | Vitest + Supertest for API routes; runs against an in-memory or test-cluster MongoDB | 70% route coverage |
| Component (web) | Vitest + React Testing Library | 60% on shared UI components |
| E2E (web) | Playwright | Critical paths: register, place order, view QR page, admin QC log |
| Contract | OpenAPI schema validation in CI | Generated spec must match runtime behavior |
| Load (deferred) | k6 or Artillery | Out of scope for v1, planned for v1.1 |

### 14.2 Critical E2E paths (must pass before any release)

1. Customer: register → login → subscribe → receive renewal order → view QR page.
2. Customer: place one-off order → SSLCOMMERZ success → order paid → delivery assigned → delivered.
3. Customer: place order → request refund → admin approves → refund processed.
4. Aggregator: login → list batch → batch visible to admin.
5. QC staff: login → see inbound batches → log QC pass → batch listed.
6. Admin: login → view KPIs → suspend user → user cannot log in.

### 14.3 Test data

- A `seed.ts` script seeds dev/staging with: 1 admin, 2 aggregators, 2 qc_staff, 5 customers, 10 products, 3 active plans, 20 batches at various tier states.
- No real PII in test data.

---

## 15. Open Items and Phase 0 Blockers

The following are `TBD` and must be resolved before development starts or, where noted, before specific phases.

| # | Item | Why | Deadline |
|---|---|---|---|
| 1 | SSLCOMMERZ merchant account opened and sandbox credentials obtained | Cannot integrate payments without it | Phase 0, week 2 |
| 2 | Pathao merchant account + API credentials obtained | Cannot integrate delivery without it | Phase 0, week 2 |
| 3 | SMTP provider selected and account opened | Cannot send transactional email without it | Phase 0, week 2 |
| 4 | Sentry project created (server + browser), DSNs generated | Cannot monitor errors without it | Phase 0, week 1 |
| 5 | Cloudinary account opened, upload preset configured | Cannot host images without it | Phase 0, week 1 |
| 6 | MongoDB Atlas M10 cluster provisioned, IP allowlist configured | Cannot run the backend without it | Phase 0, week 1 |
| 7 | Vercel project created, domain `freshtrace.bd` DNS configured | Cannot deploy web without it | Phase 0, week 1 |
| 8 | Render web service created, environment variables templated | Cannot deploy API without it | Phase 0, week 1 |
| 9 | Initial admin user email and password decided | Seeded via env var; must be set before first deploy | Phase 0, week 1 |
| 10 | Pathao city/zone/area IDs for Dhaka collected (one-time bootstrap) | Used by delivery assignment; can be populated on first request, but preloading speeds first delivery | Phase 0, week 3 |
| 11 | Specific aggregator contact for the pilot not yet named | Source-of-truth for the first batches | Phase 0, week 1 (parallel with #1) |
| 12 | Pilot unit-cost model not yet built | Validates whether the pilot unit economics close | Phase 0, week 2 (parallel with #1) |
| 13 | 1-week pre-pilot dry run not yet run | Validates spoilage assumption | Phase 0, week 4 |
| 14 | QC hub site not yet scouted in Uttara or Mohammadpur | Operational dependency for v1 | Phase 0, week 3 |
| 15 | Funding source committed but not yet closed | Runway gates the v1 build | Before Phase 1 starts |

---

## 16. Appendix — Environment Variables

The following env vars are required across services. The `TBD` entries must be filled in Phase 0.

### 16.1 Backend (`apps/api`)

| Var | Purpose | Example |
|---|---|---|
| `NODE_ENV` | Environment | `production` |
| `PORT` | Listen port | `4000` |
| `MONGODB_URI` | MongoDB connection | `mongodb+srv://...` |
| `MONGODB_DB_NAME` | DB name | `freshtrace` |
| `JWT_ACCESS_SECRET` | Access token signing | `TBD` |
| `JWT_REFRESH_SECRET` | Refresh token signing | `TBD` |
| `JWT_ACCESS_TTL_SECONDS` | Access TTL | `900` |
| `JWT_REFRESH_TTL_SECONDS` | Refresh TTL | `604800` |
| `CORS_ORIGINS` | Comma-separated allowlist | `https://app.freshtrace.bd,...` |
| `SEED_ADMIN_EMAIL` | Initial admin email | `admin@freshtrace.bd` |
| `SEED_ADMIN_PASSWORD` | Initial admin password (rotate after first login) | `TBD` |
| `SSLCOMMERZ_STORE_ID` | SSLCOMMERZ store | `TBD` |
| `SSLCOMMERZ_STORE_PASSWD` | SSLCOMMERZ store password | `TBD` |
| `SSLCOMMERZ_SANDBOX` | Sandbox mode | `true` |
| `SSLCOMMERZ_SUCCESS_URL` | Customer return URL | `https://app.freshtrace.bd/orders` |
| `SSLCOMMERZ_FAIL_URL` | Customer fail URL | `https://app.freshtrace.bd/cart` |
| `SSLCOMMERZ_CANCEL_URL` | Customer cancel URL | `https://app.freshtrace.bd/cart` |
| `SSLCOMMERZ_IPN_URL` | Webhook URL | `https://api.freshtrace.bd/api/v1/webhooks/sslcommerz` |
| `PATHAO_CLIENT_ID` | Pathao OAuth client ID | `TBD` |
| `PATHAO_CLIENT_SECRET` | Pathao OAuth client secret | `TBD` |
| `PATHAO_BASE_URL` | Pathao API base | `https://api-hermes.pathao.com` |
| `PATHAO_STORE_ID` | Pathao store ID | `TBD` |
| `PATHAO_WEBHOOK_SECRET` | Webhook HMAC secret | `TBD` |
| `SMTP_HOST` | SMTP host | `TBD` |
| `SMTP_PORT` | SMTP port | `587` |
| `SMTP_USER` | SMTP user | `TBD` |
| `SMTP_PASS` | SMTP password | `TBD` |
| `SMTP_FROM` | From address | `FreshTrace <hello@freshtrace.bd>` |
| `SENTRY_DSN_API` | Sentry DSN for backend | `TBD` |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary cloud | `TBD` |
| `CLOUDINARY_API_KEY` | Cloudinary key | `TBD` |
| `CLOUDINARY_API_SECRET` | Cloudinary secret | `TBD` |
| `CLOUDINARY_UPLOAD_PRESET` | Signed upload preset | `freshtrace_signed` |
| `LOG_LEVEL` | pino log level | `info` |
| `TIMEZONE` | App timezone | `Asia/Dhaka` |

### 16.2 Frontend (`apps/web`)

| Var | Purpose | Example |
|---|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | Backend base URL | `https://api.freshtrace.bd/api/v1` |
| `NEXT_PUBLIC_SENTRY_DSN` | Sentry DSN for browser | `TBD` |
| `NEXT_PUBLIC_APP_NAME` | Brand name | `FreshTrace` |
| `NEXT_PUBLIC_DEFAULT_TIMEZONE` | Display timezone | `Asia/Dhaka` |

### 16.3 Shared (`packages/shared`)

| Var | Purpose | Example |
|---|---|---|
| `DECAY_DAY1_MULTIPLIER` | Override Day 1 multiplier | `1.00` |
| `DECAY_DAY3_MULTIPLIER` | Override Day 3 multiplier | `0.80` |
| `DECAY_DAY5_MULTIPLIER` | Override Day 5 multiplier | `0.60` |
| `DECAY_NEAR_EXPIRY_MULTIPLIER` | Override near-expiry multiplier | `0.30` |

> **Why the decay multipliers are env vars.** They let the operations team tune the decay curve without a code deploy. Defaults match Section 5.1; the values are documented in `packages/shared/decay/constants.ts`.

---

*End of SRS v1.0.*
