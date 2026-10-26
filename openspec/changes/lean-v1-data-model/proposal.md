# Change: Lean v1 Data Model

## Why

The repository's `prisma/schema.prisma` is a three-model placeholder (`User`, `Product`, `Order`) that does not match the product described in PRD.md and SRS.md, and does not match the current stack. Application code cannot be written against it: there is no model for sessions, batches, QC logs, subscriptions, deliveries, payments, or refunds, so none of the v1 product flows (SRS §6.4) can be implemented.

The current stack has also been deliberately narrowed — a single Next.js application over SQLite with custom session auth and a local mock Stripe checkout (PRD §8.1). The schema must encode that architecture, not the previous Express/MongoDB/JWT design.

## What Changes

- **Replace the placeholder schema with a 15-model relational data model** in `prisma/schema.prisma`, derived from SRS §4 and verified against a live SQLite database.
- **Model the custom session auth** (SRS §3.1): a `Session` table storing a SHA-256 hash of an opaque token, alongside an httpOnly `ft_session` cookie. No JWTs, no token-version field. The raw token never touches the database.
- **Model the mock Stripe checkout** (SRS §7.1): a `Payment` table recording mock checkout sessions and transactions. No live provider, no API keys, no outbound payment calls.
- **Model freshness decay inputs** (SRS §5): `Batch.harvestDate`, `Batch.currentTier`, `Batch.currentPriceMultiplier`, and `Product.harvestToShelfDays` carry the rule-based pricing curve.
- **Model stock as a first-class concern**: `Batch.availableQty` is decremented atomically at order placement via a conditional update, with the decrement and the order insert wrapped in one Prisma interactive transaction.
- **Model per-line refunds** (SRS §6.4.5): `RefundItem` is a real child table, not a JSON blob, so per-line refund amounts derive from the tier-discounted `unitPrice` actually charged.
- **Store money as integer BDT** and quantities as `Float`, so fractional kilogram weights and currency arithmetic are both exact.
- **Keep the model lean** (SRS §1.2): 15 models rather than the 20 originally enumerated in SRS §4, by removing tables and fields no endpoint reads.

### Removed from the SRS §4 model

| Removed | Reason |
|---|---|
| `AuditLog` | Write-only. No endpoint reads it; refund approval is already visible via `Refund.resolvedBy` / `resolvedAt`. |
| `JobRun` | Vercel Cron gives per-invocation isolation. No endpoint reads run history. |
| `IdempotencyKey` | The mock gateway is synchronous and single-node; the atomic stock decrement is the real guard against oversell. |
| `WebhookEvent` | One webhook source only. `Delivery.courierOrderId` is already unique, so Pathao events are idempotent on arrival. |
| `AggregatorProfile` | `companyName` and `districts` folded onto `User` — one table, one fewer join. |
| `PasswordReset` | Folded onto `User` as `resetTokenHash` / `resetTokenExpiresAt`. |
| `Order.discount` | No promo or discount-code feature exists in v1. |
| `OrderItem.productId` | Derivable via `batchId → productId`. |
| `Payment.rawPayload` | No endpoint reads it; the mock provider returns structured data. |
| `User.emailVerified`, `User.image` | No verification or avatar flow in v1. |
| `Refund.items` (JSON) | Replaced with the real `RefundItem` child table. |

### Data model changes

- **BREAKING** — `User`, `Product`, and `Order` are redefined. `User` gains `passwordHash`, `role`, `status`; `Product` gains `sku`, `category`, `baseUnitPrice`, `harvestToShelfDays`; `Order` gains `orderCode`, `paymentStatus`, `status`, and a relation to `OrderItem`. Any code written against the placeholder schema must be rewritten. There is no meaningful data to migrate — the placeholder database holds no production data.

## Capabilities

### New Capabilities

- `user-session-auth` — Registration, login, logout, session persistence and revocation, and password reset, backed by database-stored sessions and an httpOnly cookie.
- `product-batch-lifecycle` — Product catalogue, batch creation by aggregators, the QC inspection log, and the batch state machine from `in_transit` through `listed`, `sold_out`, and `delisted`.
- `freshness-decay-pricing` — Rule-based freshness tier computation from harvest date, and the tier-discounted price applied to every purchase.
- `order-and-checkout` — One-off and subscription order placement, atomic stock reservation, the mock Stripe checkout flow, and order status transitions.
- `subscription-management` — Weekly recurring basket plans, subscription lifecycle including pause and resume, and hub-closure auto-skip.
- `refund-resolution` — Customer refund requests, per-line refund amounts computed from the price actually paid, and admin approval or rejection.

### Modified Capabilities

None. No existing specs exist — `openspec list --specs` returns an empty inventory.

## Impact

**Files changed**

- `prisma/schema.prisma` — the 15-model schema. This is the entire substance of the change.
- `prisma/dev.db` — regenerated from the baseline migration. The previous file held the placeholder three-table schema.
- `prisma/migrations/20261026112510_init/migration.sql` — the baseline migration, so the schema and the database are reproducible from a clean checkout.
- `SRS.md` — §4 rewritten to the 15-model schema, with a record of the removed tables and fields; §3.5, §6.3, §8, §10.9, §10.12, and §14.3 updated to match.

**Files that must follow**

- `prisma/seed.js` does not exist yet. SRS §14.3 requires a seed covering 1 admin, 2 aggregators, 2 qc_staff, 5 customers, 10 products, 3 plans, and 20 batches. It must be written against the 15-model schema, not the earlier 20-model draft. This is a separate change.

**API surface**

No endpoint contract changes. The paths in SRS §6.4 are unchanged; the schema makes them implementable.

**Dependencies**

No new runtime dependencies. Uses `prisma` and `@prisma/client`, both already in `package.json`.

**Follow-up: the Postgres migration path**

SQLite's single-writer limit caps throughput and prevents horizontal scaling. This is accepted for v1 (SRS §13.2) — the pilot's peak is a few hundred concurrent users at one delivery window. The escape hatch is a Postgres migration, and it is a **datasource change plus `prisma migrate`, with no application code changes**, because all data access goes through the Prisma client. The schema was written to be portable: no SQLite-specific constructs are used, `String` was chosen over Prisma enums specifically to keep the Postgres path open, and the money and quantity types (`Int` / `Float`) map directly to Postgres `INTEGER` and `REAL`. The one thing to plan for is that the single-writer deployment constraint (SRS §12.2) lifts, which means the job runner's reliance on single-instance execution (§8.1) will need revisiting at that point.

**Out of scope**

- Application code — no Route Handlers, Server Actions, or components are written by this change. The schema is the contract that later changes implement.
- `prisma/seed.js` implementation.
- Live Stripe, live payment processing, and payment webhooks (SRS §1.2 non-goals).
- The Postgres migration itself. Only the path is recorded above.
