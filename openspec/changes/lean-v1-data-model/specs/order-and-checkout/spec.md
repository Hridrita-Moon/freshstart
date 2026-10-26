## Purpose

Defines how a customer purchases produce: order placement with atomic stock reservation, the mock Stripe checkout flow that transitions an order to paid, and the order lifecycle through to delivery.

## ADDED Requirements

### Requirement: Order Placement with Atomic Stock Reservation

When a customer places an order, the system SHALL reserve the requested quantity from each referenced batch and record the order lines in a single atomic operation. If any line cannot be satisfied, the entire order SHALL fail and no stock SHALL be reserved.

#### Scenario: Order is placed successfully

- **WHEN** a customer places an order for quantities that are available on every referenced batch
- **THEN** an order record is created with status `pending_payment`
- **AND** an order line is created for each item, capturing the product name, quantity, tier-discounted unit price, line total, and the tier in effect
- **AND** the available quantity on each referenced batch is reduced by the ordered quantity
- **AND** the order total is the sum of its line totals plus any delivery fee

#### Scenario: Insufficient stock rejects the whole order

- **WHEN** a customer places an order requesting more than the available quantity of any batch
- **THEN** the request is rejected with an out-of-stock error
- **AND** no order record is created
- **AND** the available quantity on every batch, including those with sufficient stock, is left unchanged

#### Scenario: Quantity is recorded as a fractional weight

- **WHEN** a customer orders 1.5 kilograms of produce
- **THEN** the order line quantity is recorded as 1.5
- **AND** the batch's available quantity is reduced by 1.5

#### Scenario: Concurrent orders cannot oversell a batch

- **WHEN** two orders are placed concurrently for quantities that together exceed a batch's available quantity
- **THEN** at most the quantity actually available is reserved
- **AND** the batch's available quantity never becomes negative

### Requirement: Order Identification and Address Snapshot

Each order SHALL carry a unique human-readable order code and a frozen snapshot of the delivery address as it stood when the order was placed. Later edits to the customer's address SHALL NOT alter orders already placed.

#### Scenario: Order is placed with an address

- **WHEN** an order is placed
- **THEN** the address is copied into the order as an immutable snapshot
- **AND** the order receives a unique order code

#### Scenario: Customer edits their address afterwards

- **WHEN** a customer changes their saved address after an order has been placed
- **THEN** the address snapshot on the already-placed order is unchanged
- **AND** only future orders reflect the new address

### Requirement: Mock Stripe Checkout

The system SHALL provide a local, offline checkout that mimics the Stripe Checkout interaction without contacting any payment network. Creating a checkout session SHALL produce a session identifier and a local checkout URL. Confirming the session SHALL synchronously mark the order paid.

#### Scenario: Checkout session is created

- **WHEN** a customer requests checkout for an order awaiting payment
- **THEN** a payment record is created with status `initiated` and a unique checkout session identifier
- **AND** a local checkout URL is returned
- **AND** no outbound network call is made and no payment credentials are required

#### Scenario: Payment is confirmed

- **WHEN** the customer confirms the checkout session with a payment method
- **THEN** the order status becomes `paid` and its payment status becomes `paid`
- **AND** the payment time is recorded
- **AND** the payment record's status becomes `success`

#### Scenario: Payment is declined

- **WHEN** the checkout session is failed
- **THEN** the order remains in `pending_payment`
- **AND** the payment record's status becomes `failed`

#### Scenario: Customer cancels checkout

- **WHEN** the customer cancels the checkout session
- **THEN** the order status becomes `cancelled`
- **AND** the reserved stock is returned to the batches

#### Scenario: Checkout on an already-paid order

- **WHEN** a checkout session is confirmed for an order that is already paid
- **THEN** the order remains paid
- **AND** no duplicate payment is recorded

### Requirement: Order Cancellation

A customer SHALL be able to cancel an order that has not yet been paid, which SHALL release the reserved stock.

#### Scenario: Pending order is cancelled

- **WHEN** a customer cancels an order whose status is `pending_payment`
- **THEN** the order status becomes `cancelled` and the cancellation reason is recorded
- **AND** the reserved quantity is returned to each referenced batch

#### Scenario: Paid order cannot be cancelled

- **WHEN** a customer attempts to cancel an order that has already been paid
- **THEN** the request is rejected
- **AND** the order status is unchanged
- **AND** stock is not released, because fulfilment is under way

### Requirement: Order Lifecycle and Fulfilment Tracking

An order SHALL be in exactly one of `pending_payment`, `paid`, `in_fulfillment`, `in_transit`, `delivered`, `cancelled`, or `refunded`. An order SHALL have at most one delivery record.

#### Scenario: Order progresses through fulfilment

- **WHEN** an order moves from `paid` towards `delivered`
- **THEN** each transition records the corresponding timestamp
- **AND** the order's delivery status reflects the courier's reported progress

#### Scenario: Delivery is assigned to an order

- **WHEN** a delivery is assigned to an order
- **THEN** a delivery record is created with the courier's order identifier
- **AND** the courier's order identifier is unique, so a repeated courier notification cannot create a second delivery for the same order

#### Scenario: Duplicate courier notification

- **WHEN** a courier webhook is received for an order that already has a delivery record
- **THEN** the existing delivery record is updated rather than a second one being created

#### Scenario: Order is delivered

- **WHEN** the courier reports the order as delivered
- **THEN** the order status becomes `delivered` and the delivery time is recorded on both the order and the delivery

### Requirement: Customer Order Visibility

A customer SHALL be able to list and view only their own orders, and an administrator SHALL be able to list and view all orders, optionally filtered by status or date range.

#### Scenario: Customer lists their orders

- **WHEN** a customer requests their order list
- **THEN** only orders belonging to that customer are returned
- **AND** the results are ordered newest first

#### Scenario: Customer requests another customer's order

- **WHEN** a customer requests an order belonging to a different customer
- **THEN** the request is rejected as forbidden or not found
- **AND** no order data is disclosed
