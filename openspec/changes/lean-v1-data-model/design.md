# Design: Lean v1 Data Model

## Context

See `proposal.md` — Why, for motivation. This document covers how the schema is structured and why.

The governing constraints come from `openspec/config.yaml`: Next.js 16 App Router in JavaScript, a single deployable application, Prisma over SQLite, custom session auth, and a local mock Stripe checkout. SQLite's single-writer limit is the constraint that shapes most of the decisions below.

## Goals / Non-Goals

**Goals**

- Encode the v1 product flows as relational constraints wherever the database can enforce them, so application bugs cannot corrupt state.
- Make the freshness decay engine and the refund formula correct by construction rather than by convention.
- Keep the model small enough that a developer can hold it in their head — 15 models, no speculative tables.

**Non-Goals**

- No write path or application code. This change delivers the contract; later changes implement it.
- No Postgres migration. The schema is portable to it, but v1 does not need it (SRS §12.4).
- No seed script. Required by SRS §14.3 but implemented as a separate change.

## Decisions

### Decision 1: Model the freshness tier as a stored cache, not the source of truth

`Batch.currentTier` and `Batch.currentPriceMultiplier` are persisted, but the decay function is recomputed on every read and is authoritative over the stored value.

*Rationale:* The decay tier is a pure function of `harvestDate`, `harvestToShelfDays`, and the current time. Persisting it buys nothing at read time — it would have to be recomputed anyway to be correct — but it does allow the scheduled job to detect and act on the `expired` transition, which is what drives delisting. The stored value is a cache for reporting and for the job's own bookkeeping.

*Alternatives considered:* Computing the tier purely on read and never persisting it. Rejected because the scheduled job needs to detect the transition to `expired` to emit the delist; without a stored value it would have to diff the whole table each run.

*Consequence:* Callers must never trust the stored tier without recomputing. This is a discipline requirement on the application layer, documented in the `freshness-decay-pricing` spec's "Decay Recalculation" requirement.

### Decision 2: `OrderItem` is a real table, not a JSON array on `Order`

*Rationale:* Order lines carry a foreign key to `Batch`. The database can then refuse to delete a batch that a paid order depends on, and per-line refund accounting becomes a relational query. The earlier MongoDB design embedded lines as a JSON array precisely because Mongo could not express that foreign key; moving to SQLite removes the excuse to keep the weaker shape.

*Alternatives considered:* A JSON `items` column on `Order`. Rejected — it forfeits the referential integrity guarantee and pushes per-line refund arithmetic into application code.

### Decision 3: `RefundItem` is a real table, not a JSON column on `Refund`

*Rationale:* Same reasoning as `OrderItem`, applied to the refund breakdown. The refund formula — discount-aware unit price times quantity — needs to be computed per line and then summed. As a JSON array that sum is application logic; as a child table it is a query the database can answer, and the line amounts are individually addressable and auditable.

*Consequence:* `Refund.amount` is denormalised from its lines. The two must stay in agreement; the invariant is enforced in the write path, not by the database.

### Decision 4: Stock reservation uses a conditional update inside an interactive transaction

Order placement decrements `Batch.availableQty` with a single conditional statement — `where availableQty >= requestedQty AND status = 'listed'` — and wraps that together with the order and line inserts in one `prisma.$transaction` callback.

*Rationale:* The conditional update is atomic on its own, so it cannot oversell even under concurrency. The transaction is needed because a decrement and an order insert are two statements: without it, a failure between them would leak reserved stock that no order accounts for.

*Alternatives considered:*
- *Read-then-write* (`if (batch.availableQty < qty) throw; batch.availableQty -= qty`). Rejected — a read-then-write sequence has a window between the check and the write in which a concurrent order can consume the same stock.
- *`SELECT ... FOR UPDATE`.* Rejected — SQLite has no row-level locking, and serialising writes at the file level would make the whole database a bottleneck.
- *Application-level mutex.* Rejected — correct only within a single process, and breaks the moment the app scales past one instance.

*Consequence:* The oversell guarantee rests on the conditional update matching exactly one row. `updateMany` returning zero rows is the failure signal, not a thrown database error.

### Decision 5: Money is integer BDT, quantities are Float

*Rationale:* Currency in floating point accumulates rounding error, and the refund formula multiplies and sums prices repeatedly. Integer BDT removes the error class entirely. Quantities are kilograms and genuinely fractional (1.5 kg of mango), so `Float` is the correct type there. The two are never mixed in a single arithmetic expression: a quantity multiplies an integer price and the result is rounded to an integer.

*Alternatives considered:* Decimal for money. Rejected — SQLite has no native decimal type, so Prisma would store it as a scaled integer or a string anyway, giving the integer's simplicity without its clarity. Integer minor units (poisha) instead of BDT. Rejected as premature; prices in the pilot are whole BDT, and the tier multiplier rounds to whole BDT anyway.

### Decision 6: Enum-like fields are strings validated in the application layer

`role`, `status`, `qcStatus`, `currentTier`, `courierStatus`, `paymentStatus`, and similar fields are `String`.

*Rationale:* SQLite has no native enum type, and Prisma's enum support is not portable to SQLite — declaring a Prisma enum would break the Postgres migration path. A string column with an application-level allowlist keeps the schema portable and gives a single place to change the allowed values.

*Consequence:* The database will accept a nonsense `status` value. This is a deliberate trade: database-level enforcement is unavailable, so the allowlist is the enforcement point and must be applied on every write path.

### Decision 7: Session tokens are stored hashed

`Session.tokenHash` holds the SHA-256 of the raw token; the raw token exists only in the httpOnly cookie.

*Rationale:* If the database leaks, the attacker holds hashes that cannot be replayed as cookies. The cost is one SHA-256 per request, which is negligible next to bcrypt at login.

*Alternatives considered:* Storing the raw token. Rejected — a database read would yield directly replayable session cookies.

### Decision 8: Five tables from the SRS §4 model were removed

`AuditLog`, `JobRun`, `IdempotencyKey`, `WebhookEvent`, and `AggregatorProfile` are not in the schema. `PasswordReset` was folded onto `User`.

*Rationale:* Each was removed because no endpoint in SRS §6.4 reads it, and each would have to be written to on every request to be worth its cost. `AuditLog` in particular is write-only overhead on the order and refund paths. `AggregatorProfile` and `PasswordReset` were folded rather than dropped because their data is genuinely needed — an aggregator's allowed districts and a pending reset token both belong to exactly one user.

*Alternatives considered:* Keeping them all for SRS fidelity. Rejected — the SRS is a specification to be revised, not a schema to be transcribed. Fidelity to a document that describes more than the product needs is not the goal.

*Consequence:* The SRS must be revised to match. This is recorded as a follow-up in the proposal and in the tasks below. If any of these tables is later needed, the addition is straightforward — they are independent of the rest of the model.

### Decision 9: Referential actions are declared explicitly, with business records kept RESTRICT

Dependent child rows cascade on parent deletion (`Session`, `Address`, `BatchQcLog`, `OrderItem`, `RefundItem`). Business records do not: `Order`, `Refund`, `Payment`, and `Delivery` keep RESTRICT against their parents, so a batch with order lines or a product with batches cannot be deleted out from under them.

*Rationale:* Prisma's default is RESTRICT, so this needs no action to be safe — but it is declared explicitly rather than left implicit, because the cascade rows are a deliberate choice (a user's sessions and addresses should go with them) and the implicit default would otherwise mask which is which.

*Alternatives considered:* Cascading everything. Rejected — silently deleting a paid order when its customer is removed would destroy the financial record the business depends on.

### Decision 10: `Delivery.courierOrderId` is unique, replacing a webhook event log

*Rationale:* Pathao is the only webhook source in v1, and it is idempotent by nature: re-delivering the same order status must not create a second delivery record. A unique column on the courier's own order identifier gives that guarantee with one constraint instead of a whole table of payload logs and retry counters.

*Alternatives considered:* A generic `WebhookEvent` table with retry state. Rejected as infrastructure for one provider. When live Stripe is introduced, its webhook needs genuine replay protection and a signed-payload check — but that is a Stripe-specific concern, and adding a `WebhookEvent` table then would be cleaner than generalising it now.

## Risks / Trade-offs

- **[The database accepts invalid status values]** → Enum-like fields are validated against an allowlist on every write path. This discipline has no database-level backstop, so it must be applied consistently. The value list for each field is documented in a comment on the field itself.

- **[Two writes inside the stock reservation can partially fail]** → Both the conditional decrement and the order inserts run inside one interactive transaction, so a failure rolls back and releases the reservation. This is the single most important correctness property of the schema; the `order-and-checkout` spec asserts it.

- **[SQLite's single-writer limit caps throughput and prevents horizontal scaling]** → Accepted for v1 (SRS §13.2). The pilot's peak is a few hundred concurrent users at one delivery window. The escape hatch is a Postgres migration, which is a datasource change plus `prisma migrate` with no application code changes, since all data access goes through the Prisma client. The schema is already written to be portable: no SQLite-specific constructs are used.

- **[The stored `currentTier` can disagree with the computed tier]** → The decay function is authoritative on every read; the stored value is a cache for the scheduled job and reporting. Risk is a future developer trusting the stored column. Mitigated by the field's name, the `Decay Recalculation` requirement, and a comment on the field.

- **[The schema and SRS §4 disagree until the SRS is revised]** → Tracked as an explicit task in this change, so the two do not drift silently.

- **[Fractional kilogram quantities and integer prices interact]** → A quantity multiplies an integer unit price and the line total is rounded to an integer BDT. Per-line rounding is applied at the line level, not the total level, so the sum of line totals always equals the order subtotal. This invariant must hold in the write path.

## Migration Plan

The placeholder database holds no production data, so there is nothing to migrate.

1. Replace `prisma/schema.prisma` with the new schema.
2. Run `npx prisma migrate dev --name init` to create the baseline migration and regenerate `prisma/dev.db`.
3. Run `npx prisma generate` to regenerate the client.
4. Verify with `npx prisma validate` and `npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script` that the DDL is valid SQLite.
5. Exercise the critical write paths against a scratch database: session creation and resolution, the conditional stock decrement including the oversell case, mock checkout confirmation, and per-line refund creation.

**Rollback:** the previous schema is a single file in git with no dependent code. Reverting `prisma/schema.prisma` and regenerating the client restores the previous state. There is no data to lose.

## Open Questions

- Whether the seed script should be a separate change or part of this one. Deferred — it does not affect the specs, the schema, or the approach taken here.
