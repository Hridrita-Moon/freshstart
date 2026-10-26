## Purpose

Defines FreshTrace's rule-based freshness decay engine: how a batch's freshness tier is derived from its harvest date, the price multiplier each tier carries, and how that multiplier is applied when a customer is charged.

## ADDED Requirements

### Requirement: Freshness Tier Assignment

A batch's freshness tier SHALL be derived from the number of whole Dhaka-time calendar days elapsed since its harvest date, measured against the product's shelf life in days.

| Days since harvest | Tier | Price multiplier |
|---|---|---|
| 0–1 | `fresh` | 1.00 |
| 2–3 | `good` | 0.80 |
| 4–5 | `fair` | 0.60 |
| 6 to shelf life | `near_expiry` | 0.30 |
| beyond shelf life | `expired` | 0.00 |

#### Scenario: Batch harvested today is fresh

- **WHEN** a batch is evaluated on its harvest date
- **THEN** its tier is `fresh` with a price multiplier of 1.00

#### Scenario: Tier advances on the Dhaka day boundary

- **WHEN** a batch harvested on 2026-10-09 is evaluated at 00:00 Dhaka time on 2026-10-11
- **THEN** its tier becomes `good` with a price multiplier of 0.80
- **AND** the tier does not advance at any moment within the preceding calendar day

#### Scenario: Batch beyond its shelf life is expired

- **WHEN** a batch is evaluated more days after harvest than its product's shelf life
- **THEN** its tier is `expired` with a price multiplier of 0.00

### Requirement: Tier-Aware Pricing

The price charged for a unit of produce SHALL be the product's base unit price multiplied by the tier multiplier of the batch being purchased, rounded to a whole number of BDT.

#### Scenario: Fresh batch is charged full price

- **WHEN** a customer buys from a `fresh` batch
- **THEN** the unit price equals the product's base unit price

#### Scenario: Near-expiry batch is discounted

- **WHEN** a customer buys from a `near_expiry` batch
- **THEN** the unit price equals 30 percent of the product's base unit price, rounded to a whole number of BDT

#### Scenario: Tier is captured at time of purchase

- **WHEN** an order line is created
- **THEN** the tier in effect at that moment is recorded on the order line
- **AND** the discounted unit price actually charged is recorded on the order line

### Requirement: Decay Recalculation

The system SHALL recalculate batch tiers on every read of a batch, on a recurring schedule, and immediately when a batch passes inspection. The stored tier and multiplier on a batch are a cache of the computed value and SHALL NOT be treated as authoritative over a fresh calculation.

#### Scenario: Tier is correct without waiting for the schedule

- **WHEN** a batch is read after its tier has changed
- **THEN** the returned tier reflects the current time, regardless of the last scheduled recalculation

#### Scenario: Expiry is detected by the schedule

- **WHEN** the scheduled recalculation runs and finds a listed batch whose tier has become `expired`
- **THEN** the batch is delisted
- **AND** the recalculation is recorded as having processed the batch

#### Scenario: Passing inspection refreshes the tier

- **WHEN** a batch passes inspection
- **THEN** its tier and multiplier are recalculated and stored at that moment

### Requirement: Expired Produce Is Unbuyable

A batch whose tier is `expired` SHALL NOT be purchasable, and SHALL NOT be offered as an available batch to customers.

#### Scenario: Customer browses an expired batch

- **WHEN** a customer requests the available batches for a product
- **THEN** batches that are `expired`, `delisted`, or `sold_out` are excluded from the result

#### Scenario: Order attempt against an expired batch

- **WHEN** a customer attempts to place an order against a batch that has expired
- **THEN** the request is rejected
- **AND** no stock is reserved and no order is created
