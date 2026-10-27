# Deferred Work

- source_spec: none
  summary: Apply the Glassmorphism light theme consistently across the product catalogue and other existing customer surfaces.
  evidence: Split from the Story 2 authentication intent under BMAD's single-goal scope standard; the theme restyle is independently shippable as a pure presentation change and was deferred so authentication could be implemented and reviewed on its own.

- source_spec: `_bmad-output/implementation-artifacts/spec-2-authentication-register-login-logout.md`
  summary: Make `User.email` case-insensitively unique at the database level.
  evidence: Raised by the Edge Case Hunter during the Story 2 review and confirmed — SQLite's `UNIQUE` index on `User.email` uses BINARY collation, so `Alice@example.com` and `alice@example.com` are two distinct accounts. The Story 2 register route normalises the email to lowercase before the insert, so it cannot create the duplicate itself; the exposure is a pre-existing schema property. Fixing it properly requires a Prisma migration that recreates the index with `COLLATE NOCASE`, which is out of scope for an authentication story.

- source_spec: `_bmad-output/implementation-artifacts/spec-2-authentication-register-login-logout.md`
  summary: Add Origin/CSRF validation to the auth endpoints and revoke live sessions when an administrator suspends an account.
  evidence: Raised by the Edge Case Hunter during the Story 2 review. The `SameSite=Lax` session cookie already blocks the cookie from being *sent* on a cross-site request, but `POST /api/auth/register` and `POST /api/auth/login` still act on a cross-site POST. Separately, `src/app/api/auth/login/route.js` destroys a suspended user's sessions when they next attempt to log in, but nothing revokes sessions that are already live when an admin flips `status` to `suspended` — there is no admin UI in the product yet, so the revocation trigger has no home. Both belong to a security-hardening story rather than to the registration feature.
