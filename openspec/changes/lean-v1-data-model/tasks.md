# Tasks: Lean v1 Data Model

## 1. Replace the schema

- [x] 1.1 Replace `prisma/schema.prisma` with the 15-model schema — `User`, `Session`, `Product`, `Batch`, `BatchQcLog`, `SubscriptionPlan`, `Subscription`, `Address`, `Order`, `OrderItem`, `Delivery`, `Payment`, `Refund`, `RefundItem`, `HubClosure` — over `provider = "sqlite"`.
- [x] 1.2 Add the schema header comment documenting the field conventions this change relies on: integer BDT for money, `Float` for kilogram quantities, `String` for enum-like fields with the allowed values on the field comment, and explicit `onDelete` actions.
- [x] 1.3 Model `User` with the four roles (`customer`, `aggregator`, `qc_staff`, `admin`), `passwordHash`, and the folded aggregator fields (`companyName`, `districts`) plus the folded password-reset fields (`resetTokenHash`, `resetTokenExpiresAt`).
- [x] 1.4 Model `Session` with `tokenHash` unique, `expiresAt`, and `lastUsedAt`, and `onDelete: Cascade` from `User` so a deleted user's sessions go with them.
- [x] 1.5 Model `Product` with `sku`, `category`, `defaultUnit`, `baseUnitPrice` (integer BDT), and `harvestToShelfDays` — the decay input.
- [x] 1.6 Model `Batch` with `harvestDate`, `inboundQty` / `availableQty` (`Float`), `qcStatus`, `currentTier`, `currentPriceMultiplier`, `status`, `batchCode` and `qrSlug` unique, and a comment on `currentTier` marking it a cache of the computed tier rather than the source of truth.
- [x] 1.7 Model `BatchQcLog` with the inspector relation, grade, `weightKg`, `passed`, and `onDelete: Cascade` from `Batch`.
- [x] 1.8 Model `SubscriptionPlan` with `basketSize`, `weeklyPrice` (integer BDT, a ceiling rather than a fixed charge), and `composition` as a JSON string.
- [x] 1.9 Model `Subscription` with `dayOfWeek`, `status`, `nextDeliveryAt`, `pauseUntil`, `startedAt`, `endedAt`, and relations to `User`, `SubscriptionPlan`, and `Address`.
- [x] 1.10 Model `Address` with the full postal fields, `isDefault`, and `onDelete: Cascade` from `User`.
- [x] 1.11 Model `Order` with `orderCode` unique, the frozen `addressSnapshot`, `subtotal` / `deliveryFee` / `grandTotal` (integer BDT), `paymentStatus`, `status`, the lifecycle timestamps (`placedAt`, `paidAt`, `deliveredAt`), and `cancelReason`.
- [x] 1.12 Model `OrderItem` as a real child table with `batchId` foreign key, the denormalised `name`, `qty` (`Float`), `unitPrice` after tier discount (integer BDT), `lineTotal`, and `freshnessTierAtOrder`.
- [x] 1.13 Model `Delivery` with `courierOrderId` unique — the idempotency guarantee that replaces the removed `WebhookEvent` table — plus courier status, tracking, pickup, and delivery timestamps.
- [x] 1.14 Model `Payment` with `provider` defaulting to `mock_stripe`, `sessionId` unique, `gatewayTxnId` unique, `amount`, and a `status` of `initiated` / `success` / `failed` / `cancelled` / `refunded`.
- [x] 1.15 Model `Refund` with `requestedBy` / `requestedByRole`, `reason`, `amount`, `status`, `resolvedBy` / `resolvedAt`, and `gatewayRefundRef`.
- [x] 1.16 Model `RefundItem` as a real child table of `Refund` with `orderItemId`, `qty`, and `amount` — replacing the JSON `items` blob so per-line amounts are individually addressable.
- [x] 1.17 Model `HubClosure` with `date` unique and a `reason`.
- [x] 1.18 Declare referential actions explicitly on every relation: `Cascade` for dependent child rows (`Session`, `Address`, `BatchQcLog`, `OrderItem`, `RefundItem`), `Restrict` for business records (`Order`, `Refund`, `Payment`, `Delivery`) so a paid order cannot lose its parent.
- [x] 1.19 Add the indexes each access path in the specs needs — order lookup by customer and recency, refunds by status and recency, sessions by expiry, batches by status and expiry, subscriptions by status and next delivery date.

## 2. Validate and generate

- [x] 2.1 Run `npx prisma format` so the schema is canonical.
- [x] 2.2 Run `npx prisma validate` and resolve every error until it passes — in particular the `RefundItem` → `OrderItem` back-relation, which Prisma requires.
- [x] 2.3 Run `npx prisma generate` and confirm the client builds with all 15 models.
- [x] 2.4 Run `npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script` and confirm the emitted DDL is valid SQLite with no SQLite-specific constructs that would block a later Postgres migration.

## 3. Regenerate the database

- [x] 3.1 Delete the placeholder `prisma/dev.db` (it holds the old three-table schema and no production data).
- [x] 3.2 Run `npx prisma migrate dev --name init` to create the baseline migration and regenerate `prisma/dev.db`.
- [x] 3.3 Confirm the baseline migration file sits alongside `schema.prisma` in `prisma/migrations/`, so the schema and the database are reproducible from a clean checkout. The file is present and `prisma migrate status` reports "Database schema is up to date"; committing it is a separate git action outside this change.

## 4. Verify the critical write paths

- [x] 4.1 Exercise session creation and resolution against a scratch database: create a session with a hashed token, resolve it back to the user, and confirm the raw token is never written.
- [x] 4.2 Exercise the conditional stock decrement: reserve stock within availability and confirm `availableQty` falls by exactly the ordered quantity.
- [x] 4.3 Exercise the oversell guard: request more than `availableQty` and confirm the conditional update matches zero rows, so no order is created and no stock is reserved.
- [x] 4.4 Exercise mock checkout confirmation: confirm a checkout session and verify the order moves to `paid`, the payment record moves to `success`, and the payment time is recorded.
- [x] 4.5 Exercise per-line refund creation: create a refund covering multiple order lines and verify each line amount derives from the tier-discounted `unitPrice` times the refunded quantity, and that the refund total equals the sum of its lines.
- [x] 4.6 Exercise cascade behaviour: delete a user and confirm their sessions and addresses are removed while business records remain untouched.
- [x] 4.7 Remove the scratch database and any scratch scripts once the checks pass.

> **Verification result: 33 assertions, all passing.** The harness also caught a real discrepancy between the schema and Decision 9 of the design: `Payment`, `Delivery`, and `Refund` were declared `Cascade` against `Order`, which would have let a paid order's payment history be deleted along with it. All three are now `Restrict`, matching the design's rationale that business records must not be destroyed by a parent deletion.

## 5. Reconcile the SRS with the implemented model

- [x] 5.1 Update `SRS.md` §4 to describe the 15-model schema as implemented, replacing the 20-model list and the removed fields.
- [x] 5.2 Update `SRS.md` §10.12 data retention to drop the purge targets for `AuditLog` and `IdempotencyKey`, which no longer exist, and to cover the tables that do.
- [x] 5.3 Update any remaining SRS section that references a removed model or field, so the specification and the schema do not drift silently. §3.5 (password reset), §6.3 (idempotency), §8.1–8.3 (job runner and scheduled jobs), §10.9 (audit), and §10.10 (webhook timestamps) were all updated.
- [x] 5.4 Note in `SRS.md` that `prisma/seed.js` remains outstanding under SRS §14.3, pending the separate seed change.

## 6. Close the change

- [x] 6.1 Run `npx openspec validate lean-v1-data-model --strict` and confirm the change validates.
- [x] 6.2 Run `npx openspec status --change lean-v1-data-model` and confirm all four artifacts are complete.
- [x] 6.3 Record the Postgres migration path as a follow-up in the proposal's Impact section, noting that all data access goes through the Prisma client and the switch is a datasource change plus `prisma migrate` with no application code changes.
