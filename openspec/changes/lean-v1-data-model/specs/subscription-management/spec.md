## Purpose

Defines FreshTrace's recurring weekly basket subscriptions: the plans customers can choose, the subscription lifecycle including pause and resume, and the hub-closure rule that automatically skips a delivery week.

## ADDED Requirements

### Requirement: Subscription Plans

The system SHALL offer subscription plans, each with a name, a basket size category, a weekly price in integer BDT, and a composition describing which products and default quantities the basket contains.

#### Scenario: Plans are listed

- **WHEN** a customer requests the available plans
- **THEN** only active plans are returned
- **AND** each plan reports its name, basket size, weekly price, and composition

#### Scenario: Plan is deactivated

- **WHEN** an admin deactivates a plan
- **THEN** it no longer appears in the plan list
- **AND** existing subscriptions on that plan continue unchanged

#### Scenario: Plan weekly price is a ceiling, not a fixed charge

- **WHEN** a subscription renewal prices a basket whose items have decayed past fresh
- **THEN** the customer is charged the per-item tiered total
- **AND** that total may be lower than the plan's stated weekly price

### Requirement: Subscription Creation

A customer SHALL be able to create a subscription by choosing a plan, a delivery address, and a single fixed day of the week on which deliveries arrive. The subscription SHALL record the date of its next delivery.

#### Scenario: Subscription is created

- **WHEN** a customer subscribes with a plan, an address, and a delivery weekday
- **THEN** a subscription record is created with status `active`
- **AND** its next delivery date is the next occurrence of the chosen weekday
- **AND** its start date is recorded

#### Scenario: Subscription to an inactive plan is rejected

- **WHEN** a customer attempts to subscribe to a plan that is not active
- **THEN** the request is rejected

#### Scenario: Subscription to another customer's address is rejected

- **WHEN** a customer attempts to subscribe using an address that belongs to a different customer
- **THEN** the request is rejected

### Requirement: Subscription Pause and Resume

A customer SHALL be able to pause an active subscription until a given date, and to resume it. A paused subscription SHALL NOT generate renewal orders.

#### Scenario: Subscription is paused

- **WHEN** a customer pauses their subscription with an end date
- **THEN** the status becomes `paused` and the pause-until date is recorded
- **AND** no renewal order is created for the paused period

#### Scenario: Subscription is resumed

- **WHEN** a customer resumes a paused subscription
- **THEN** the status returns to `active` and the pause-until date is cleared
- **AND** the next delivery date is recomputed to the next occurrence of the chosen weekday, skipping any hub-closure date

#### Scenario: Paused subscription past its end date

- **WHEN** a subscription's pause-until date has passed and it has not been resumed
- **THEN** it is not renewed until the customer resumes it

### Requirement: Subscription Cancellation

Cancelling a subscription SHALL end it, record the end date, and stop all future renewals.

#### Scenario: Subscription is cancelled

- **WHEN** a customer cancels their subscription
- **THEN** the status becomes `ended` and the end date is recorded
- **AND** no further renewal orders are created for it

#### Scenario: Cancelled subscription is not renewed

- **WHEN** the renewal process encounters a subscription with status `ended`
- **THEN** it is skipped

### Requirement: Hub-Closure Auto-Skip

The system SHALL record dates on which the QC hub is closed. A renewal falling on a closure date SHALL be skipped, the next delivery date advanced by seven days, and the customer notified. No order SHALL be placed for a skipped week.

#### Scenario: Renewal falls on a hub closure

- **WHEN** a subscription's next delivery date falls on a recorded hub closure
- **THEN** no order is created for that week
- **AND** the next delivery date is advanced by seven days
- **AND** the customer is notified with the reason and the new delivery date

#### Scenario: Closure is removed

- **WHEN** an admin removes a hub closure
- **THEN** a future renewal falling on that date is no longer skipped

#### Scenario: Closure dates are unique

- **WHEN** an admin records a closure for a date that already has one
- **THEN** the request is rejected

### Requirement: Address Protection for Active Subscriptions

An address referenced by an active or paused subscription SHALL NOT be deleted.

#### Scenario: Customer deletes a referenced address

- **WHEN** a customer attempts to delete an address that an active or paused subscription references
- **THEN** the request is rejected with a conflict
- **AND** the response identifies the referencing subscriptions
- **AND** the address is not deleted

#### Scenario: Customer deletes an unreferenced address

- **WHEN** a customer deletes an address that no active or paused subscription references
- **THEN** the address is deleted

#### Scenario: Ended subscription does not block deletion

- **WHEN** a customer deletes an address referenced only by ended subscriptions
- **THEN** the address is deleted

### Requirement: Renewal Order Freshness Disclosure

When a renewal order is created, the system SHALL compute the freshness tier each basket item will have on the planned delivery day, record that tier and its price on the order line, and disclose the tier to the customer.

#### Scenario: Renewal discloses expected tiers

- **WHEN** a renewal order is created
- **THEN** each order line records the tier the item is expected to have on the delivery day
- **AND** the customer's confirmation lists each item with its expected tier and price

#### Scenario: Item expires before the delivery day

- **WHEN** an item in a renewal basket would be expired at the time the order is created
- **THEN** that item is dropped from the basket
- **AND** the customer is notified
- **AND** the order is still placed for the remaining items
