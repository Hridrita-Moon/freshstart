## Purpose

Defines how FreshTrace handles refunds for delivered orders: customer refund requests, per-line refund amounts derived from the price actually paid, and admin approval, rejection, and processing.

## ADDED Requirements

### Requirement: Refund Request

A customer SHALL be able to request a refund on a delivered order, specifying a reason and the order lines and quantities affected. A refund request SHALL record who requested it and in what role.

#### Scenario: Customer requests a refund

- **WHEN** a customer requests a refund on a delivered order with a reason and affected lines
- **THEN** a refund record is created with status `requested`
- **AND** the requesting customer and role `customer` are recorded
- **AND** the requester and role `qc_staff` are recorded when raised by quality-control staff

#### Scenario: Refund requested before delivery

- **WHEN** a customer requests a refund on an order that has not been delivered
- **THEN** the request is rejected

#### Scenario: Refund requested on another customer's order

- **WHEN** a customer requests a refund on an order belonging to a different customer
- **THEN** the request is rejected
- **AND** no refund record is created

### Requirement: Refund Amount Derived From Price Paid

A refund line amount SHALL be computed from the tier-discounted unit price actually charged on the order line, multiplied by the refunded quantity. A refund SHALL NEVER be calculated from the product's undiscounted base price.

#### Scenario: Near-expiry item is refunded at the discounted price

- **WHEN** a customer refunds an item that was bought at the near-expiry tier price
- **THEN** the refund amount equals the discounted price paid for that item
- **AND** the refund does not restore the higher fresh-tier price

#### Scenario: Partial line refund

- **WHEN** a customer refunds 2 kilograms of an order line priced at 120 BDT per kilogram
- **THEN** that refund line's amount is 240 BDT

#### Scenario: Refund lines are recorded individually

- **WHEN** a refund covers multiple order lines
- **THEN** each affected line is recorded as its own refund line with its own quantity and amount
- **AND** the refund's total amount equals the sum of its lines

### Requirement: Refund Approval and Rejection

An administrator SHALL be able to approve or reject a pending refund request. Approval SHALL record the resolving administrator and the resolution time; rejection SHALL likewise record the resolver and the time.

#### Scenario: Admin approves a refund

- **WHEN** an admin approves a pending refund
- **THEN** the refund status becomes `approved`
- **AND** the resolving administrator and resolution time are recorded

#### Scenario: Admin rejects a refund

- **WHEN** an admin rejects a pending refund with a reason
- **THEN** the refund status becomes `rejected`
- **AND** the resolving administrator and resolution time are recorded

#### Scenario: Already resolved refund

- **WHEN** an admin attempts to approve or reject a refund that is not pending
- **THEN** the request is rejected
- **AND** the refund status is unchanged

### Requirement: Refund Processing

A processed refund SHALL be recorded against the mock payment provider with a refund reference, the order's refunded amount SHALL be updated, and the order's payment status SHALL reflect whether the refund was full or partial.

#### Scenario: Refund is processed

- **WHEN** an admin processes an approved refund
- **THEN** a refund reference is recorded against the mock payment provider
- **AND** the order's refunded amount is increased by the refund amount
- **AND** the order's payment status becomes `refunded` when the refunded amount equals the order total
- **AND** the order's payment status becomes `partially_refunded` when it is less than the order total

#### Scenario: Refund exceeds the order total

- **WHEN** a refund's total exceeds the amount paid on the order
- **THEN** the request is rejected
- **AND** the refunded amount is not increased

### Requirement: Refund Visibility

A customer SHALL be able to view the refund requests raised against their own orders, and an administrator SHALL be able to view all refunds, optionally filtered by status.

#### Scenario: Customer views refunds on their order

- **WHEN** a customer requests the refunds for their order
- **THEN** only refunds against that order are returned
- **AND** each refund reports its status, reason, amount, and per-line breakdown

#### Scenario: Admin lists refunds

- **WHEN** an admin requests the refund list with a status filter
- **THEN** only refunds with that status are returned
- **AND** refunds are ordered newest first
