/**
 * Redirect-target validation.
 *
 * The `?next=` parameter on `/login` and `/register` lets the app send a
 * visitor back to where they came from. It is attacker-controlled, so it
 * must never be able to point at another origin.
 *
 * This lives in its own module rather than inside `AuthForm.jsx` so it can be
 * unit-tested directly — the component is a Client Component with JSX and
 * `next/navigation` imports, which the Node test environment cannot load.
 */

/** Where a visitor lands after a successful sign-in. */
export const DEFAULT_REDIRECT = "/app/products";

/**
 * Validate a `?next=` target.
 *
 * Only a single-slash-prefixed path is accepted. `//evil.example` is a
 * protocol-relative URL that would redirect off-site, so it is rejected
 * alongside anything that is not a path at all.
 *
 * The check is applied to the **decoded** form as well as the raw one.
 * `/%2f%2fevil.example` passes a naive raw-string comparison but decodes to
 * `//evil.example`, which the browser resolves as a protocol-relative URL.
 * Decoding first and validating both forms closes that gap.
 *
 * @param {string | null} value
 * @returns {string}
 */
export function safeRedirectPath(value) {
  if (typeof value !== "string") return DEFAULT_REDIRECT;

  const candidate = value.trim();

  if (!candidate.startsWith("/")) return DEFAULT_REDIRECT;
  if (candidate.startsWith("//")) return DEFAULT_REDIRECT;

  // Control characters can truncate or split the header value downstream.
  if (/[\u0000-\u001f\u007f]/.test(candidate)) return DEFAULT_REDIRECT;

  // Reject a backslash in either the raw or the decoded form. A backslash is
  // treated as a path separator by several browsers, so `\` can stand in for
  // the `//` of a protocol-relative URL.
  if (candidate.includes("\\")) return DEFAULT_REDIRECT;

  // The decoded form must satisfy the same rules as the raw form.
  let decoded;
  try {
    decoded = decodeURIComponent(candidate);
  } catch {
    // A malformed percent-escape cannot be trusted — reject it.
    return DEFAULT_REDIRECT;
  }

  if (!decoded.startsWith("/")) return DEFAULT_REDIRECT;
  if (decoded.startsWith("//")) return DEFAULT_REDIRECT;
  if (decoded.includes("\\")) return DEFAULT_REDIRECT;
  if (/[\u0000-\u001f\u007f]/.test(decoded)) return DEFAULT_REDIRECT;

  return candidate;
}
