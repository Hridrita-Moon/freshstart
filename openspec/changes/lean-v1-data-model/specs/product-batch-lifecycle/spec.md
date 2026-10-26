## Purpose

Defines how FreshTrace manages its product catalogue and the physical lots of produce it sells: product records, batch creation by aggregators, quality-control inspection logging, and the batch state machine governing what customers can see and buy.

## ADDED Requirements

### Requirement: Product Catalogue

The system SHALL maintain products identified by a unique SKU, each with a name, category, default unit of sale, and a base unit price in integer BDT. Each product SHALL declare how many days pass from harvest before it must be delisted.

#### Scenario: Product is created

- **WHEN** an admin creates a product with a SKU, name, category, unit, base price, and shelf life
- **THEN** the product is stored and is immediately available to batch creation
- **AND** the base price is stored as an integer number of BDT

#### Scenario: Duplicate SKU is rejected

- **WHEN** an admin creates a product using a SKU that already exists
- **THEN** the creation is rejected with a conflict error

#### Scenario: Product is deactivated

- **WHEN** an admin soft-deletes a product
- **THEN** the product is marked inactive
- **AND** it no longer appears in customer-facing catalogue listings
- **AND** batches already referencing it remain intact and readable

### Requirement: Batch Creation by Aggregators

An aggregator SHALL be able to register a batch of a product they supply. A batch SHALL carry a unique human-readable code, a harvest date, an origin district, an inbound quantity in kilograms, and a unique short slug used to encode its printed QR code.

#### Scenario: Batch is listed for supply

- **WHEN** an aggregator creates a batch for a product with a harvest date, origin district, and inbound quantity
- **THEN** a batch record is created with a unique batch code and QR slug
- **AND** the status is `in_transit` and the QC status is `pending`
- **AND** the available quantity equals the inbound quantity

#### Scenario: Future harvest date is rejected

- **WHEN** an aggregator submits a harvest date later than today
- **THEN** the batch creation is rejected
- **AND** no batch record is created

#### Scenario: Origin district outside the aggregator's allowlist is rejected

- **WHEN** an aggregator submits an origin district that is not among their configured districts
- **THEN** the batch creation is rejected

#### Scenario: Non-positive inbound quantity is rejected

- **WHEN** an aggregator submits an inbound quantity of zero or less
- **THEN** the batch creation is rejected

#### Scenario: Supplied batch code already in use is rejected

- **WHEN** an aggregator supplies a batch code that another batch already uses
- **THEN** the batch creation is rejected
- **AND** the system does not silently overwrite the existing batch

### Requirement: Quality Control Inspection Logging

Quality-control staff SHALL be able to record an inspection against a batch, capturing the inspection time, grade, observed weight in kilograms, an optional temperature, a pass or fail outcome, notes, and photographs.

#### Scenario: Inspection is recorded

- **WHEN** quality-control staff log an inspection with a grade, weight, and outcome
- **THEN** an inspection record is created against the batch
- **AND** the inspection is attributed to the staff member who performed it

#### Scenario: Failed batch remains unavailable

- **WHEN** an inspection is recorded with a failing outcome
- **THEN** the batch's QC status becomes `failed`
- **AND** the batch remains in `in_transit`
- **AND** the batch is not visible to customers and cannot be ordered

#### Scenario: Batch is re-inspected

- **WHEN** a previously failed batch is inspected again
- **THEN** a second inspection record is created
- **AND** the earlier inspection record is retained

### Requirement: Batch State Machine

A batch SHALL be in exactly one of `in_transit`, `listed`, `delisted`, or `sold_out`. The only permitted transitions SHALL be `in_transit` to `listed`, `listed` to `delisted`, and `listed` to `sold_out`. A delisted batch SHALL NOT be relisted.

#### Scenario: Batch is listed after a passing inspection

- **WHEN** an admin confirms a batch that has a passing inspection
- **THEN** the batch status becomes `listed`
- **AND** the listed time is recorded
- **AND** the batch becomes visible to customers

#### Scenario: Batch is delisted by expiry

- **WHEN** the batch's freshness tier becomes `expired`
- **THEN** the batch status becomes `delisted`
- **AND** the batch is no longer visible to customers

#### Scenario: Batch is delisted by an admin

- **WHEN** an admin force-delists a batch
- **THEN** the batch status becomes `delisted`

#### Scenario: Delisted batch cannot be relisted

- **WHEN** an admin attempts to list a batch whose status is `delisted`
- **THEN** the request is rejected
- **AND** the batch status is unchanged

#### Scenario: Batch is sold out

- **WHEN** a batch's available quantity reaches zero
- **THEN** the batch status becomes `sold_out`
- **AND** the batch is no longer purchasable

### Requirement: Public Batch Verification by QR Code

The system SHALL expose a public, unauthenticated read of a batch by its QR slug, resolving to the same batch as the human-readable batch code, so a scanned label can be verified by anyone.

#### Scenario: Valid QR slug is scanned

- **WHEN** an unauthenticated visitor opens the batch page for a valid QR slug
- **THEN** the batch's product name, harvest date, origin district, freshness tier, and current price are shown
- **AND** the supply-chain journey for the batch is shown

#### Scenario: Unknown QR slug is scanned

- **WHEN** an unauthenticated visitor opens the batch page for a slug that matches no batch
- **THEN** a not-found response is returned
- **AND** no batch data is disclosed
