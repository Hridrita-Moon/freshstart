---
title: 'Story 2 — Authentication: Register, Login, Logout'
type: 'feature'
created: '2026-10-27'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '7733a248900b86a0201d72934005f18aea661280'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** FreshTrace has a complete server-side auth core (`src/lib/auth/`, `POST /api/auth/login`, `POST /api/auth/logout`) but no way for a person to use it — no registration endpoint, no auth validator, no `/login` or `/register` page, and a Navbar that renders static "Cart / Account" links ignoring the session. A shopper cannot create an account, sign in, or sign out.

**Approach:** Add the missing registration endpoint, plus the two auth pages as a split-screen Glassmorphism pair (frosted-glass form left, produce promo card right), wired to the existing session-cookie contract. Make the customer Navbar session-aware: Login/Register when signed out, user name + Logout when signed in.

## Boundaries & Constraints

**Always:**
- Session-cookie auth only — `ft_session` httpOnly cookie, SHA-256 token hash at rest, 30-day rolling lifetime. **No JWT, no client-side token store, no `localStorage`.** (SRS §3.1)
- Reuse `src/lib/auth/session.js` and `src/lib/auth/password.js` (bcrypt cost 12) unchanged.
- New registrations get `role: "customer"`, `status: "active"`. Self-registration must never choose a role.
- Errors use `{ error: { code, message, details } }` (`src/lib/errors.js`); success uses `{ data: ... }` (`src/lib/api-response.js`).
- Registration signs the user in immediately: the response sets the session cookie, so the client needs no second round-trip to `/api/auth/login`.
- Auth pages use the specified Glassmorphism idiom: `backdrop-blur-md bg-white/70 border border-white/40 shadow-xl`, over a soft brand/sand gradient.
- Fully responsive from 320 px up: the split screen collapses to one stacked column below `lg`.
- Keep the existing accessibility conventions: `aria-hidden` on decorative icons, labelled inputs, `aria-live` on error regions.

**Never:**
- Do not modify `src/lib/auth/*` or the existing `/api/auth/login` and `/api/auth/logout` routes.
- Do not add a `Customer` Prisma model — the customer profile **is** a `User` row with `role = "customer"`.
- No JWT, OAuth, password-reset, rate limiting, or `/api/auth/me` — out of scope.
- Do not build `/app/subscriptions`, `/app/orders`, `/app/cart`, or `/app/account` pages; those are later stories.
- Do not restyle the catalogue to Glassmorphism — deferred to `deferred-work.md`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| REGISTER_OK | `{ name, email, password }`, new email | `201` `{ data: { id, email, name, role } }`; `ft_session` set; client → `/app/products` | N/A |
| REGISTER_DUPLICATE | email already registered | `409` `conflict`, message names the field | Prisma `P2002` via `handleRouteError` |
| REGISTER_INVALID | missing/malformed email, password < 8 chars | `422` `validation_failed`, `details.issues[]` = one `{ path, message }` per field | Validator result, no DB write |
| REGISTER_MALFORMED_JSON | body is not valid JSON | `422` `validation_failed` | Parse try/catch |
| LOGIN_OK | valid active user | `200` `{ data: { id, email, name, role } }`; `ft_session` set | N/A |
| LOGIN_BAD | wrong password **or** unknown email | `401` `unauthenticated`, identical message both ways | Existing route |
| LOGIN_SUSPENDED | valid creds, `status = "suspended"` | `403` `forbidden` | Existing route |
| LOGOUT | valid session | `200`; session row deleted; cookie cleared | Existing route |
| NAV_ANON | no `ft_session` cookie | Navbar shows Login + Register | N/A |
| NAV_AUTH | valid `ft_session` cookie | Navbar shows user name + Log out | N/A |
| NAV_DEAD_LINK | any state | `/app/subscriptions`, `/app/orders`, `/app/cart`, `/app/account` render visibly inactive and **not** clickable | N/A |
| REDIRECT_NEXT | `/login?next=/app/products` | Redirect to `next` after success | Unsafe values (not `/`-prefixed, or `//`) fall back to `/app/products` |

</frozen-after-approval>

## Code Map

**Reuse unchanged — do not edit:**
- `src/lib/auth/session.js` — `SESSION_COOKIE_NAME`, `createSession(userId, meta)` → `{ token, sessionId, expiresAt }`, `destroySession(token)`, `sessionCookieOptions(maxAgeSeconds)`, `getSession()` (Server Component entry point).
- `src/lib/auth/password.js` — `hashPassword(plain)` (bcrypt cost 12), `MIN_PASSWORD_LENGTH` = 8, `meetsPasswordPolicy`.
- `src/lib/auth/guard.js` — `getAuthContext()` → `{ user, session } | null`.
- `src/lib/errors.js` — `ERROR_CODES`, `errorResponse(code, message, details)`, `handleRouteError(err)` (maps Prisma `P2002` → `conflict` 409, `P2025` → `not_found`).
- `src/lib/api-response.js` — `dataResponse(data)` → `{ data }`. Takes no status argument, so the 201-create response is written inline the way `src/app/api/products/route.js` does.
- `src/lib/validation/schema.js` — `Validator`, `requireString(v, value, path, {min,max})`, `optionalString`, `finish(v, data)`. **Pattern to copy:** `new Validator()` → primitives → `finish(v, {...})`; primitives mutate the validator, return `undefined` on failure and the trimmed value on success. Model: `src/lib/validation/product.js`.

**Template to copy:** `src/app/api/auth/login/route.js` — JSON parse in try/catch → 422; email normalised `.trim().toLowerCase()`; `NextResponse.json({ data })`; `response.cookies.set(SESSION_COOKIE_NAME, token, sessionCookieOptions())`; whole body in try/catch → `handleRouteError(err)`.

**Style references — follow, don't copy wholesale:**
- `src/components/CatalogFilters.jsx` — the only Client Component. House style: `"use client";` (double quotes + semicolon), controlled inputs, `onChange={(event) => setX(event.target.value)}`, input classes `w-full rounded-xl border border-sand-200 bg-white py-2.5 px-3.5 text-sm text-sand-900 shadow-soft transition placeholder:text-sand-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20`, `aria-hidden="true"` on decorative icons, helper sub-components declared **below** the main export in the same file.
- `src/app/(customer)/layout.jsx` — the Navbar to rewrite. Its docblock already reserves a "SessionUser slot"; implement that slot.
- `src/app/(customer)/app/products/[sku]/page.jsx` — house style for a glass card with a price block and action buttons.
- `src/app/not-found.jsx` — centred page with icon medallion + heading + primary CTA `inline-flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700`.
- `src/app/globals.css` — `@theme` tokens available: `brand-*` (50–950), `sand-*` (50–950), `fresh-*`, `good-*`, `fair-*`, `near-expiry-*`, `expired-*`, `--radius-card`, `--shadow-soft|lifted|float`. **No `--shadow-glass` and no `.glass` class exist** — do not assume one.

**Schema fact:** `User` requires `email` and `passwordHash` (no default); `name` and `phone` are nullable; `role` defaults to `"customer"`, `status` to `"active"`. A registration insert needs only `{ name, email, passwordHash }`.

**Routes:** only `/app/products` exists. `src/app/page.js` and `src/app/(customer)/app/page.jsx` are `redirect("/app/products")` stubs. The SRS §9.1 auth route group is `(auth)/` with `login/page.jsx` and `register/page.jsx` — use that path.

**Tests:** `vitest.config.mjs` — `environment: "node"`, `fileParallelism: false` (shared SQLite), `setupFiles: ["tests/setup.js"]`, alias `@` → `./src`. `tests/setup.js` sets `DATABASE_URL=file:./dev.test.db` and re-migrates it; Prisma is **real**, not mocked. Models: `tests/session.test.js` (DB-touching: seed with `prisma.user.create`, ordered `deleteMany()` in `afterAll`, `prisma.$disconnect()` last) and `tests/validation.test.js` (pure validator). No route handler is unit-tested yet and `next/headers` `cookies()` is not mocked — a handler test needs `vi.mock("next/headers")`.

## Tasks & Acceptance

**Execution:**
- [x] `src/lib/validation/auth.js` -- **NEW.** `validateRegisterInput(body)` and `validateLoginInput(body)` built on `Validator`/`finish` from `src/lib/validation/schema.js`. Register: `name` (required, 2–120 chars), `email` (required, valid format, max 255), `password` (required, ≥ `MIN_PASSWORD_LENGTH`, max 128). Login: email + password presence only. Return `{ success, data }` / `{ success, errors }`.
- [x] `src/app/api/auth/register/route.js` -- **NEW.** `POST` handler modelled on `src/app/api/auth/login/route.js`. Malformed JSON → 422. Normalise email `.trim().toLowerCase()`. Validate; on failure `errorResponse(ERROR_CODES.VALIDATION_FAILED, "...", { issues: result.errors })`. Hash with `hashPassword`. Insert `User` `{ name, email, passwordHash, role: "customer", status: "active" }`. `createSession(user.id, { userAgent, ipAddress })`, set the `ft_session` cookie with `sessionCookieOptions()`, return `201` `{ data: { id, email, name, role } }`. Wrap in try/catch → `handleRouteError(err)`.
- [x] `src/app/(auth)/AuthShell.jsx` -- **NEW.** Shared split-screen layout: responsive two-column grid (stacks below `lg`), left form slot, right produce promo card with frosted badges, ambient gradient background behind the cards so the blur has something to diffuse.
- [x] `src/components/AuthForm.jsx` -- **NEW.** Shared client form (`"use client";`). Owns field `useState`, `onSubmit`, `fetch` to `/api/auth/login` or `/api/auth/register`, inline field-level errors from `details.issues[]`, a general `aria-live` error region, submit-button pending state. Reads the `next` target via `useSearchParams()` and validates it (single `/` prefix, not `//`).
- [x] `src/app/(auth)/login/page.jsx` -- **NEW.** AuthShell + AuthForm in `login` mode: email + password, primary submit, link to `/register`.
- [x] `src/app/(auth)/register/page.jsx` -- **NEW.** AuthShell + AuthForm in `register` mode: name + email + password, password hint reflecting `MIN_PASSWORD_LENGTH`, link to `/login`.
- [x] `src/app/(customer)/layout.jsx` -- **MODIFY.** Resolve the session server-side via `getSession()`; render Login + Register links when signed out, user name + Log out when signed in. Replace the four links to non-existent pages with visibly inactive, non-clickable elements (`<span aria-disabled="true">`, not `<a>`); keep `/app/products` live. Preserve the existing responsive header behaviour.
- [x] `src/components/LogoutButton.jsx` -- **NEW.** Client Component. `POST /api/auth/logout`, then `router.refresh()` and navigate to `/app/products` so the server re-renders the Navbar signed-out.
- [x] `tests/auth-validation.test.js` -- **NEW.** Unit-test `src/lib/validation/auth.js`: valid input succeeds and trims whitespace; missing email → issue on `email`; malformed email → issue on `email`; 7-char password → issue on `password`; 8-char password → passes.
- [x] `tests/auth-register.test.js` -- **NEW.** Integration-test `POST /api/auth/register` against the real test DB: success creates a `User` with `role: "customer"`, a bcrypt hash that is not the plaintext, and sets `ft_session`; duplicate email → 409; invalid input → 422 with `details.issues`.
- [x] `tests/auth-login.test.js` -- **NEW.** Integration-test `POST /api/auth/login` and `POST /api/auth/logout` against the real test DB. Added during the matrix audit to cover the `LOGIN_OK`, `LOGIN_BAD`, `LOGIN_SUSPENDED`, and `LOGOUT` rows, which the register-only suite did not reach.
- [x] `tests/auth-redirect.test.js` -- **NEW.** Unit-test `safeRedirectPath`. Added during the step-04 review: the guard had no automated coverage, and it could not have one while it lived inside the JSX Client Component, so it was moved to `src/lib/auth/redirect.js`.
- [x] `tests/auth-navbar.test.js` -- **NEW.** Render the customer layout with a mocked session and assert the signed-out, signed-in, and suspended Navbar states. Added during the step-04 review: the Navbar assertions existed only in `tests/ui-smoke.mjs`, which `npm test` does not run.
- [x] `src/lib/auth/redirect.js` -- **NEW.** `safeRedirectPath` and `DEFAULT_REDIRECT`, extracted from `AuthForm.jsx` so the guard is unit-testable in the `node` test environment.
- [x] `tests/ui-smoke.mjs` -- **MODIFY.** Extended with the auth-surface assertions named in the Verification section: `/login` and `/register` render their expected fields, the signed-out and signed-in Navbar states, the four unbuilt destinations are not links, and the register → logout → login round-trip. Added a bad-credentials block asserting the unknown-email and wrong-password responses are identical.

**Acceptance Criteria:**
- Given a valid new registration, when `POST /api/auth/register` is called, then the response is `201` with `{ data: { id, email, name, role } }` and a `Set-Cookie: ft_session=…` header carrying `HttpOnly` and `SameSite=Lax`.
- Given a valid new registration, when the response is inspected, then the stored `passwordHash` is a bcrypt hash and not the plaintext, and the stored `role` is `customer`.
- Given an email that is already registered, when `POST /api/auth/register` is called, then the response is `409` with code `conflict` and no second `User` row is created.
- Given a missing email, a malformed email, or a password shorter than 8 characters, when `POST /api/auth/register` is called, then the response is `422` with code `validation_failed` and `details.issues` naming each offending field, and no `User` row is created.
- Given a body that is not valid JSON, when `POST /api/auth/register` is called, then the response is `422` with code `validation_failed`.
- Given a visitor on `/register` with no session, when they submit a valid new email and an 8+-character password, then the `ft_session` cookie is set and they land on `/app/products` with the Navbar showing their name.
- Given a visitor on `/login` with correct credentials, when they submit, then `ft_session` is set and they land on `/app/products` (or the `next` path when it is a safe same-origin path).
- Given a visitor on `/login` with an unknown email, when they submit, then the response is `401` with the same message shown for a wrong password.
- Given a visitor on `/register` with an already-registered email, when they submit, then the response is `409` and the form shows a field-level error on the email input.
- Given a signed-in visitor on any customer page, when the page renders, then the Navbar shows the user's name and a Log out control, not Login/Register.
- Given a signed-out visitor on any customer page, when the page renders, then the Navbar shows Login and Register links.
- Given a signed-in visitor, when they press Log out, then the session row is deleted, the cookie cleared, and the Navbar returns to its signed-out state without a full page reload.
- Given any page at 320 px, 768 px, and 1280 px viewport widths, when it renders, then no horizontal scroll occurs and the auth pages stack into one column below `lg`.
- Given the existing catalogue and product-detail pages, when they render, then their markup and behaviour are unchanged — this story adds auth surfaces and does not restyle the catalogue.

## Implementation Notes

**Files created (13):** `src/lib/validation/auth.js`, `src/lib/auth/redirect.js`, `src/app/api/auth/register/route.js`, `src/app/(auth)/AuthShell.jsx`, `src/app/(auth)/login/page.jsx`, `src/app/(auth)/register/page.jsx`, `src/components/AuthForm.jsx`, `src/components/LogoutButton.jsx`, `tests/auth-validation.test.js`, `tests/auth-register.test.js`, `tests/auth-login.test.js`, `tests/auth-redirect.test.js`, `tests/auth-navbar.test.js`.

**Files modified (3):** `src/app/(customer)/layout.jsx` (session-aware Navbar), `src/lib/validation/auth.js` (password handling, see below), `src/app/api/auth/register/route.js` (transaction, conflict shape), `src/components/AuthForm.jsx` (redirect guard, pending state), `src/components/LogoutButton.jsx` (failure handling), `tests/ui-smoke.mjs` (auth assertions).

**Reuse-only files confirmed unchanged** (zero diff): `src/lib/auth/session.js`, `src/lib/auth/password.js`, `src/lib/auth/guard.js`, `src/app/api/auth/login/route.js`, `src/app/api/auth/logout/route.js`. No Prisma schema change and no `prisma migrate` was run — the `User` model already accepts a registration insert.

**Deviation 1 — a `<Suspense>` boundary was required around `AuthForm`.** The spec has `AuthForm` read `?next=` via `useSearchParams()`. In Next.js 16 that hook forces client rendering, and `next build` fails the prerender of `/login` and `/register` with *"useSearchParams() should be wrapped in a suspense boundary"*. Both pages now wrap the form in `<Suspense>`, matching the existing house pattern in `src/app/(customer)/app/products/page.jsx` (which wraps `CatalogFilters` the same way). The fallback is `AuthFormSkeleton`, a named export of `src/components/AuthForm.jsx` rather than a new file, so the file count stays as planned.

**Deviation 2 — two extra test files were added.** `tests/auth-login.test.js` and the `tests/ui-smoke.mjs` extension were added during the matrix audit, not during the initial implementation. The matrix lists `LOGIN_OK`, `LOGIN_BAD`, `LOGIN_SUSPENDED` and `LOGOUT` rows, and the register-only test suite did not reach them.

**Deviation 3 — `safeRedirectPath` moved to `src/lib/auth/redirect.js`.** It was originally an exported function inside `src/components/AuthForm.jsx`. The Verification Gap Reviewer flagged that it had no test, and it could not have one: `AuthForm.jsx` is a Client Component with JSX and a `next/navigation` import, which the `node` test environment cannot load. Moving the pure function into its own module under `src/lib/auth/` makes it directly unit-testable and gives the review a place to look. `AuthForm.jsx` imports it from there.

**Two bugs found and fixed during the diff review (not by the implementation subagent's own report).** The first pass used four Tailwind colour classes that **do not exist** in `src/app/globals.css` — `bg-fair-300/30`, `bg-fair-400/25`, `border-expired-200`, `border-expired-400`. The `fair` scale is defined only at 50/100/500/600/700/800 and `expired` only at 50/100/500/600/700/800. Tailwind v4 silently omits a utility for an undefined token, so those elements would have rendered with **no background and no border at all** — invisible decorative blobs and a borderless error input. They were remapped to the nearest defined tokens: `fair-500/20`, `expired-100`, `expired-500`. A token audit over the whole `src/` tree now reports no undefined colour class.

**Also removed:** an unused `import Link from "next/link"` in `src/components/AuthForm.jsx`, and a stale docblock in `src/app/(customer)/layout.jsx` that still claimed the auth guard was unwired and that the `SessionUser` slot was still a placeholder.

### Patches applied after the step-04 review

The nine confirmed defects from the Review Triage Log were patched. The three that changed behaviour most:

**The password is now read raw and capped at 72 bytes.** `requireString` — the house primitive — returns `value.trim()`, which is right for a name or an email but wrong for a password: `src/app/api/auth/login/route.js:31` reads the submitted password **raw**, so trimming it at registration meant `" tomatoes "` and `"tomatoes"` hashed differently and only the trimmed form was ever compared. The account was created and could then never be used. `src/lib/validation/auth.js` now has its own `requirePassword` helper that returns the value untouched. The same helper caps the password at bcrypt's hard 72-byte limit, because bcryptjs silently truncates past that point — a validator limit of 128 characters meant two passwords sharing their first 72 bytes authenticated interchangeably. The limit is measured in **bytes**, not characters, matching bcrypt.

**The register route now shapes the 409 conflict itself.** `handleRouteError` maps Prisma's `P2002` to `409 conflict` but its `details` carries only a `constraint` name, while `AuthForm` renders field errors exclusively from `details.issues[]` — so a duplicate email produced a banner, never an error on the email input. The spec's acceptance criteria require the field-level error. The route now catches `P2002` before the generic handler and returns `details.issues = [{ path: "email", message: ... }]`. `src/lib/errors.js` is unchanged, so every other route keeps its current shape.

**The user row and the session row are written in one transaction.** They were two separate awaits, so a failing session insert left an orphan `User` behind — the visitor saw a 500, retried, and got a 409 reading "email already taken" for an account they had just created. `prisma.$transaction` now covers both writes plus the `lastLoginAt` stamp. The session token is generated *before* the transaction so the raw value never has to be read back out of the database.

The remaining six patches: the redirect guard now validates the percent-decoded form as well as the raw one and rejects control characters; the pending state is released only on failure, so a successful sign-in cannot be double-submitted; `LogoutButton` now reports a failed sign-out instead of silently navigating away with the session still live (and its old comment, which claimed the browser cleared the cookie, was factually wrong — the cookie is cleared server-side by the logout route's `Max-Age=0`); `lastLoginAt` is stamped on registration; the Navbar treats a suspended account as signed out; and `safeRedirectPath` plus the Navbar session states are now covered by automated tests.

**`validateLoginInput` has no production call site.** The spec asked for it, but `src/app/api/auth/login/route.js` is a reuse-only file that does its own inline presence check, and the spec forbids modifying it. The export exists and is unit-tested; wiring it into the login route is a candidate for a later cleanup that is allowed to touch that file. Its password handling was made consistent with the register validator in the meantime (raw, non-empty, 72-byte cap).

**Verification results (after the review patches):** `npm run lint` → 0 errors, 3 warnings (all in the generated `coverage/` directory, unchanged from baseline). `npm test` → **210 passed / 14 files** (was 185 / 12). `npm run build` → clean; the route table lists `ƒ /api/auth/register`, `ƒ /login`, `ƒ /register`. `node tests/ui-smoke.mjs` against a production build on port 3221 → **all checks passed**.

**Live verification of the three highest-severity fixes**, against the running production build:

| Check | Result |
|---|---|
| Register with `"  tomatoes  "`, then sign in with `"  tomatoes  "` | register `201` → login `200` — the padded password round-trips |
| Register the same email twice | `409 conflict` with `details.issues = [{ path: "email", message: "An account with that email already exists." }]` |
| Register a 73-byte password | `422 validation_failed` with a `password` issue |

**Not verified:** real-browser rendering at 375 / 768 / 1440 px (no headless browser in this environment), and a grep of the built client bundle for the raw session token. The token is only ever written through `response.cookies.set()` on an httpOnly cookie and is never returned in a JSON body, so it cannot enter a bundle — but that was reasoned, not grepped.

### Patches applied in the follow-up verification pass

A second pass re-verified the finished implementation against the frozen intent by running the app, not just reading it. The behaviour was sound; two housekeeping defects were found and fixed.

**The password length rule was applied twice, so every short password reported two identical issues.** `src/lib/validation/auth.js` checked `password.length < MIN_PASSWORD_LENGTH` inline *and* then called `meetsPasswordPolicy(password)` — which is the same rule (`length >= MIN_PASSWORD_LENGTH`). A seven-character password therefore produced `details.issues = [{ path: "password", ... }, { path: "password", ... }]`, duplicating the message and breaking the spec's "one `{ path, message }` per field" contract. The redundant inline check is gone; the single remaining check goes through the shared `meetsPasswordPolicy`, so there is still exactly one password policy in the codebase. The existing tests missed it because they asserted with `issues.some(...)`, which passes whether or not the issue is duplicated — the assertions now count the issues per path instead.

**A leftover debugging probe was shipping inside the test suite.** `tests/tmp-triage.test.js` was a scratch file from the review session that printed diagnostics and was picked up by `vitest` as a real test file. It also carried its own stale copy of `safeRedirectPath` that did **not** have the percent-decoding guard, so its console output showed `/%2f%2fevil.example` passing the guard — which looked like the RC-2 fix had not been applied. It had; the probe was simply not testing the real module in `src/lib/auth/redirect.js`. The probe was deleted. (`tests/tmp-*.mjs` scratch scripts remain on disk; they are standalone scripts, are not matched by `vitest.config.mjs`'s `tests/**/*.test.js` glob, and do not run in the suite.)

**Verification results (after this pass):** `npm run lint` → 0 errors, 3 warnings (all in the generated `coverage/` directory, unchanged from baseline). `npm test` → **212 passed / 14 files** (was 210 / 14; the probe file is gone and four new assertions cover the one-issue-per-field contract). `npm run build` → clean. `node tests/ui-smoke.mjs` against a production build → **all checks passed**. The one-issue-per-field contract was additionally re-confirmed against the running server: a seven-character password returns exactly one `password` issue, and a payload invalid in three fields returns exactly one issue per field.

## Spec Change Log

No changes to the frozen intent. The spec's acceptance criteria were correct as written; every review finding was an implementation defect against them.

## Review Triage Log

Three review layers ran against the diff: **Blind Hunter** (13 findings, floor N = 9), **Edge Case Hunter** (22 findings), and **Verification Gap Reviewer** (4 pre-verified + others). Every finding was then re-verified by hand against the actual code — the verdict below is the outcome of that re-verification, not the reviewer's claim. 22 findings collapsed into 12 rows: 8 duplicates, 5 false positives, and 9 genuine defects grouped into 5 root causes.

| # | Finding | Source | Verdict | Evidence | Root cause | Route |
|---|---------|--------|---------|----------|-----------|-------|
| 1 | Register trims the password but login does not, so `" tomatoes "` can never sign in | Blind Hunter #1, Edge Case Hunter (trim asymmetry) | **high — confirmed** | `src/lib/validation/schema.js:85` — `requireString` returns `value.trim()`. `src/lib/validation/auth.js` calls `requireString` for the password, so `validateRegisterInput({password: "  tomatoes  "}).data.password === "tomatoes"`. `src/app/api/auth/login/route.js:31` reads the password **raw** (`typeof body?.password === "string" ? body.password : ""`). Probe output: `register validator password result: "tomatoes"`. A user who registers with padded whitespace can never authenticate, and the failure is indistinguishable from a wrong password. | **RC-1 — the shared `requireString` primitive trims, but a password is not a trim-able field** | patch |
| 2 | `MAX_PASSWORD_LENGTH = 128` exceeds bcrypt's 72-byte limit, so two different passwords authenticate interchangeably | Blind Hunter #3, Edge Case Hunter (bcrypt truncation) | **high — confirmed** | `src/lib/validation/auth.js` — `MAX_PASSWORD_LENGTH = 128`. `src/lib/auth/password.js:20` calls `bcrypt.hash(plain, BCRYPT_COST)` with no length cap. bcryptjs silently truncates input beyond 72 bytes. Probe: `hash = hashPassword("a".repeat(80))`; `verifyPassword("a".repeat(80) + "bbbbbbbb", hash) === true`. A user whose password shares the first 72 bytes with another's can sign in with it. | **RC-1** (same field, same "the password is a special string" root cause) | patch |
| 3 | `safeRedirectPath` passes percent-encoded protocol-relative URLs through | Blind Hunter #5, Verification Gap Reviewer | **medium — confirmed** | `src/components/AuthForm.jsx:34-45`. Probe output: `safeRedirectPath("/%2f%2fevil.example") -> "/%2f%2fevil.example"`, `safeRedirectPath("/%5C%5Cevil.example") -> "/%5C%5Cevil.example"`, `safeRedirectPath("/%09/evil.example") -> "/%09/evil.example"`. The guard compares raw strings, so it cannot see a decoded `//` or `\`. The spec's own REDIRECT_NEXT row says unsafe values "fall back to `/app/products`", and a decoded-to-`//` path is unsafe. | **RC-2 — the redirect guard validates the encoded form, not the decoded form** | patch |
| 4 | A duplicate email returns 409 with no `details.issues[]`, so the form shows no field-level error | Blind Hunter #4, Edge Case Hunter (conflict shape) | **medium — confirmed** | `src/lib/errors.js:105-116` — the `P2002` branch returns `{ constraint: err.meta?.target ?? null }` and nothing else. `src/components/AuthForm.jsx:72-90` (`issuesToFieldErrors`) reads **only** `details.issues[]`, so `fieldMap` is empty and only the generic `generalError` renders. The spec's acceptance criteria explicitly require: *"the response is `409` and the form shows a field-level error on the email input"*. The spec is right; the implementation misses it. | **RC-3 — the shared error helper cannot express a field-scoped conflict** | patch |
| 5 | `lastLoginAt` is not set on registration | Blind Hunter #9 | **low — confirmed** | `src/app/api/auth/register/route.js:58-73` — the `User` insert and `createSession` never touch `lastLoginAt`. `src/app/api/auth/login/route.js:76-79` does set it. Cosmetic inconsistency, not a defect in any acceptance criterion. | RC-4 — minor parity gaps with the existing route | patch |
| 6 | `validateLoginInput` has no production call site | Verification Gap Reviewer | **low — confirmed, but no action** | `src/lib/validation/auth.js` exports it; the only consumer is `tests/auth-validation.test.js`. `src/app/api/auth/login/route.js` is listed in the spec as reuse-only ("Do not modify"), so it cannot call it. Already documented in Implementation Notes. | RC-4 | **no change** (spec constraint, not a defect) |
| 7 | `safeRedirectPath` has no test | Verification Gap Reviewer | **medium — confirmed** | Grep across `tests/` found no reference to `safeRedirectPath`. `vitest.config.mjs` sets `environment: "node"`, so there is no component-render harness — but the function is a pure exported string function and is directly unit-testable. | RC-5 — the client-side guard is unverified | patch |
| 8 | Navbar session states are asserted only by `tests/ui-smoke.mjs`, which `npm test` never runs | Verification Gap Reviewer | **medium — confirmed** | `vitest.config.mjs:15` — `include: ["tests/**/*.test.js"]`. `tests/ui-smoke.mjs` is a standalone Node script, run manually. The spec's acceptance criteria for NAV_ANON / NAV_AUTH / NAV_DEAD_LINK therefore have no automated coverage. | RC-5 | patch |
| 9 | `LogoutButton` swallows a failed logout and the UI then shows signed-out while the session is still live | Edge Case Hunter | **medium — confirmed** | `src/components/LogoutButton.jsx:29-38` — the `catch` block is empty, and the comment claims *"the session cookie is still cleared by the browser on the next sign-in"*. That is wrong: the cookie is cleared **server-side** by the logout route's `Max-Age=0` `Set-Cookie`. If the request fails, the session row survives **and** the cookie survives, but `router.refresh()` re-renders the Navbar from a still-valid cookie — so the UI is actually correct, yet the comment states the opposite. The real defect is the inaccurate comment plus the silent swallow. | RC-4 | patch |
| 10 | `setIsPending(false)` in the `finally` block re-enables the button in the same tick as `router.push` | Edge Case Hunter | **medium — confirmed** | `src/components/AuthForm.jsx:138-144` — `router.push(redirectTo); router.refresh();` then `finally { setIsPending(false); }`. The state update lands before the navigation commits, so a double-click can fire a second `POST` in that window. | RC-6 — the pending state is released before the navigation completes | patch |
| 11 | Register can leave an orphan `User` row if `createSession` throws, and the retry then fails with 409 | Edge Case Hunter | **medium — confirmed** | `src/app/api/auth/register/route.js:58-73` — `prisma.user.create` and `createSession` are two separate awaited calls with no transaction and no compensating delete. If the session insert fails, the `User` row persists; the visitor sees a 500, retries with the same email, and gets a 409 that reads as "email already taken" rather than "try again". | RC-7 — the two writes are not atomic | patch |
| 12 | A suspended user's existing session still renders the signed-in Navbar | Edge Case Hunter | **medium — confirmed** | `src/lib/auth/session.js:88-105` (`getSessionByToken`) returns the session with its `user` and never inspects `user.status`; `src/app/(customer)/layout.jsx:24-25` uses `session?.user` directly. Suspension is enforced only at **login** time (`src/app/api/auth/login/route.js:59-68`), never on an already-issued session. | RC-8 — status is checked at login but not at session read | patch (in-scope portion) + defer (admin-suspension path) |

**False positives (5) — dismissed, no change made:**

- *"Stale docblock in `src/app/(customer)/layout.jsx` still claims the guard is unwired and the slot is a placeholder."* — **False.** The diff snapshot was taken before the fix; the on-disk file (lines 7-21) reads correctly. Verified by reading the file.
- *"The `fair-300` / `fair-400` / `expired-200` / `expired-400` Tailwind classes are undefined."* — **False.** Already remapped to `fair-500/20`, `expired-100`, `expired-500` before this review. A whole-`src/` token audit reports no undefined colour class.
- *"Unused `import Link` in `src/components/AuthForm.jsx`."* — **False.** Removed before this review; the file no longer imports it.
- *"The SQLite `UNIQUE` index on `User.email` is case-sensitive, so `Alice@x.com` and `alice@x.com` are two accounts."* — **Confirmed as a real property, but out of scope.** The register route normalises the email to lowercase before the insert, so the route can never *create* the duplicate. The index's case sensitivity is a pre-existing schema property, and changing it needs a migration. → **defer**.
- *"`next build` fails because `useSearchParams()` has no `<Suspense>` boundary."* — **False.** Both auth pages wrap the form in `<Suspense fallback={<AuthFormSkeleton />} />`; the build is clean.

**Root-cause groups and their routes:**

| Group | Findings | Route | Rationale |
|-------|----------|-------|-----------|
| **RC-1** — the password is a special field: it must not be trimmed, and it must be bounded by bcrypt's 72-byte limit | #1, #2 | patch | Both are real defects with a single fix site: the register validator must read the password **raw** and cap it at 72 bytes, matching `login/route.js`'s raw read. |
| **RC-2** — the redirect guard validates the encoded form, not the decoded form | #3 | patch | The spec's REDIRECT_NEXT row already requires unsafe values to fall back; the implementation just under-validates. |
| **RC-3** — the shared error helper cannot express a field-scoped conflict | #4 | patch | The spec's acceptance criteria explicitly demand a field-level error on 409. The fix is local to the register route: catch `P2002` and shape `details.issues` itself, without changing `src/lib/errors.js` for every other route. |
| **RC-4** — minor parity and accuracy gaps with the existing route | #5, #9 (+#6 = no change) | patch | `lastLoginAt` parity and the incorrect logout comment. Both are one-line fixes. |
| **RC-5** — the client-side guard and the Navbar states are unverified by the automated suite | #7, #8 | patch | `safeRedirectPath` is a pure function and unit-testable in the `node` environment. The Navbar states can be asserted by rendering the layout's session branch. |
| **RC-6** — the pending state is released before the navigation commits | #10 | patch | Release the pending state only on failure, not on success. |
| **RC-7** — the two writes are not atomic | #11 | patch | Wrap the user insert and the session insert in one `prisma.$transaction`. |
| **RC-8** — status is checked at login but not at session read | #12 | patch (in-scope) + defer | The in-scope part is the Navbar: a suspended user must not see the signed-in state. The admin-suspension path (revoking live sessions when an admin suspends an account) is a separate story with no admin UI yet. |
| **Pre-existing** — SQLite's case-sensitive `UNIQUE` on `User.email` | (false-positive row) | defer | Needs a schema migration; the route already normalises the email so it cannot be triggered by this story. |
| **Pre-existing** — no Origin/CSRF check on the auth endpoints | (Edge Case Hunter) | defer | `SameSite=Lax` already blocks the cookie from being *sent* cross-site. The register endpoint still creates an account cross-site, but the login endpoint has the identical gap and it belongs to a security-hardening story, not this one. |

**No `intent_gap` and no `bad_spec` entries.** Every finding traces to an implementation defect against a spec requirement that was already written down correctly — the spec's acceptance criteria named the 409 field-level error, the safe `next` fallback, and the raw bcrypt semantics. The spec needed no change, so **no review loopback** is triggered and `review_loop_iteration` stays at `0`.

## Design Notes

**Glassmorphism without a design-system dependency.** No `.glass` class or `--shadow-glass` token exists; the two existing glass surfaces (`src/app/(customer)/layout.jsx:20`, `src/components/ProductCard.jsx:65`) use `bg-white/90` + `backdrop-blur-md` + `border-sand-200` + `shadow-soft`. Use the user's specified `backdrop-blur-md bg-white/70 border border-white/40 shadow-xl` on the new auth surfaces only — do not retrofit it onto the catalogue.

**A frosted surface needs something to blur.** `backdrop-blur` only reads as glass when colour sits behind it. The auth shell needs an ambient background (soft `bg-gradient-to-br from-brand-50 via-sand-50 to-brand-100` plus a couple of blurred colour blobs) *behind* the cards, or the translucency is invisible and the pages read flat white.

**The promo card has no photo.** `public/` holds only the five Next.js starter SVGs; there is no raster asset in the repo, and product imagery comes from `product.imageUrl` with a gradient + `Sprout` fallback (`src/components/ProductCard.jsx:39-49`). Build the right column from the same vocabulary — a brand/sand gradient panel, `lucide-react` produce icons, and overlaid frosted badges ("Harvested today", "Traceable batches") — rather than shipping an unreviewable binary asset.

**The `next` parameter must be validated.** Only accept a value starting with a single `/` and not `//`; otherwise `?next=//evil.example` is an open redirect. Anything else falls back to `/app/products`.

**The Navbar is a Server Component.** `getSession()` reads `next/headers` cookies, unavailable in a Client Component. Resolve the session in `src/app/(customer)/layout.jsx` and pass it down as props; only the Logout button needs `"use client"`. This matches SRS §9.3 — "the session is resolved server-side… Client Components receive the user via props from a Server Component parent."

**A dead Navbar link must not be focusable.** A disabled-looking `<a href="/app/cart">` still lets keyboard and screen-reader users activate a 404. Render unbuilt targets as `<span aria-disabled="true">` with muted styling, not as links.

**Why auto-login on register.** The route creates a session and sets the cookie itself rather than sending the caller to `/api/auth/login`. The human chose auto-login; it removes a round-trip, and the session-creation code is deliberately identical to `login/route.js` so the two paths cannot drift.

**Why there is no duplicate-email pre-check.** `handleRouteError` already maps Prisma's `P2002` to `409 conflict`. A `prisma.user.findUnique` pre-check would duplicate that and introduce a check-then-insert race.

**Email normalisation happens once, at the route boundary.** The route lower-cases and trims before validating, so `  Alice@Example.COM ` and `alice@example.com` are the same account and the validator and the unique index agree on the canonical address.

**Reuse `meetsPasswordPolicy`, do not invent a second policy.** `src/lib/auth/password.js` already checks length ≥ 8. Stronger rules (uppercase, digit, symbol) are out of scope.

## Verification

**Commands:**
- `npm run lint` -- expected: 0 errors.
- `npm test` -- expected: all suites pass, including the two new auth test files.
- `npm run build` -- expected: succeeds; `/login`, `/register`, `/api/auth/register` appear in the route table.
- `node tests/ui-smoke.mjs` -- expected: existing catalogue/product-detail assertions still pass; extend the script to assert the new auth surfaces render.

**Manual checks:**
- Open `/login` and `/register` at 375 px, 768 px, and 1440 px — the split screen stacks below `lg`, nothing overflows horizontally.
- Register a fresh account, then reload — the Navbar still shows the signed-in state (cookie persists).
- Press Log out, then reload — the Navbar shows Login / Register again.
- Confirm the raw session token never appears in any client-side JavaScript bundle — only the httpOnly cookie carries it.
