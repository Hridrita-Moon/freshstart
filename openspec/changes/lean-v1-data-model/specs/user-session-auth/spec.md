## Purpose

Defines how FreshTrace authenticates users and maintains sessions: email and password credentials, server-side session persistence with an httpOnly cookie, session revocation, and password reset.

## ADDED Requirements

### Requirement: Password Credential Storage

User accounts SHALL be authenticated with an email and password. The system SHALL store only a bcrypt hash (cost factor 12) of the password, never the password itself.

#### Scenario: Successful registration

- **WHEN** a visitor registers with an email, password, and name
- **THEN** a user record is created with role `customer`, status `active`, and a bcrypt password hash
- **AND** the plaintext password is not persisted anywhere

#### Scenario: Duplicate email registration

- **WHEN** a visitor registers with an email that already belongs to an account
- **THEN** registration is rejected with a conflict error
- **AND** no new user record is created

### Requirement: Server-Side Session Issuance

On successful login the system SHALL create a session record containing a SHA-256 hash of a cryptographically random 32-byte token, and SHALL return the raw token to the caller in an httpOnly cookie named `ft_session`. The raw token SHALL NOT be stored in the database.

#### Scenario: Login succeeds

- **WHEN** a user submits valid credentials
- **THEN** a session record is created with a token hash and an expiry 30 days in the future
- **AND** the response sets a `ft_session` cookie that is httpOnly, sameSite lax, path `/`, and secure in production
- **AND** the stored token hash does not equal the raw cookie token

#### Scenario: Login fails

- **WHEN** a user submits an email that does not exist, or a wrong password
- **THEN** the request is rejected with an authentication error
- **AND** no session record is created
- **AND** the error message does not reveal whether the email exists

### Requirement: Session Validation and Rolling Expiry

Every authenticated request SHALL be resolved by looking up the session token hash and checking its expiry. When a valid session is used and more than 15 days have elapsed since it was last used, the system SHALL extend its expiry by 30 days.

#### Scenario: Valid session is accepted

- **WHEN** a request carries a `ft_session` cookie whose hash matches a session record that has not expired
- **THEN** the request is authenticated as that session's user
- **AND** the session's last-used time is updated

#### Scenario: Expired session is rejected

- **WHEN** a request carries a cookie matching a session whose expiry has passed
- **THEN** the request is rejected as unauthenticated
- **AND** the expired session is treated as absent

#### Scenario: Unknown token is rejected

- **WHEN** a request carries a cookie whose hash matches no session record
- **THEN** the request is rejected as unauthenticated

### Requirement: Logout and Session Revocation

Logout SHALL delete the current session record and clear the cookie. Because sessions are server-side, revoking a session SHALL take effect immediately without waiting for any token to expire.

#### Scenario: User logs out

- **WHEN** an authenticated user logs out
- **THEN** the session record is deleted
- **AND** the cookie is cleared
- **AND** presenting the same cookie again is rejected as unauthenticated

#### Scenario: Suspended user's sessions are revoked

- **WHEN** an admin suspends a user
- **THEN** all session records belonging to that user are deleted
- **AND** the suspended user's existing cookie is rejected as unauthenticated

#### Scenario: Password change invalidates all sessions

- **WHEN** a user completes a password reset
- **THEN** all session records belonging to that user are deleted
- **AND** the user must sign in again

### Requirement: Password Reset

The system SHALL issue a single-use password reset token valid for 1 hour, store only its SHA-256 hash against the user, and email a reset link to the account's registered address.

#### Scenario: Reset is requested

- **WHEN** a visitor requests a password reset for a registered email
- **THEN** a reset token hash and expiry are recorded against that user
- **AND** a reset email is sent

#### Scenario: Reset is completed

- **WHEN** the user submits a valid unused reset token with a new password
- **THEN** the password hash is updated
- **AND** the reset token is marked used
- **AND** all of that user's sessions are deleted

#### Scenario: Expired or used token is rejected

- **WHEN** a user submits a reset token that has expired or has already been used
- **THEN** the request is rejected
- **AND** the password is unchanged

#### Scenario: Reset request for an unknown email

- **WHEN** a visitor requests a reset for an email that is not registered
- **THEN** no token is created
- **AND** no email is sent

### Requirement: Role Assignment

Every user SHALL have exactly one role from `customer`, `aggregator`, `qc_staff`, or `admin`. Self-registration SHALL create only `customer` accounts. Accounts in the `aggregator`, `qc_staff`, and `admin` roles SHALL be created by an existing admin.

#### Scenario: Self-registration creates a customer

- **WHEN** a visitor self-registers
- **THEN** the resulting account has role `customer`

#### Scenario: Admin provisions a staff account

- **WHEN** an admin provisions an account with role `aggregator` or `qc_staff`
- **THEN** the account is created with that role and status `active`

#### Scenario: Suspended account cannot sign in

- **WHEN** a user whose status is `suspended` attempts to log in
- **THEN** the attempt is rejected
- **AND** no session record is created
