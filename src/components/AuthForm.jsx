"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/password";
import { DEFAULT_REDIRECT, safeRedirectPath } from "@/lib/auth/redirect";

/**
 * AuthForm — the shared sign-in / sign-up form.
 *
 * SRS §9.2: the form is a Client Component; the pages around it are Server
 * Components. The form talks to the two existing API routes:
 *
 * - `POST /api/auth/login` — sets the `ft_session` cookie.
 * - `POST /api/auth/register` — creates the account *and* sets the cookie.
 *
 * The session token itself never reaches the client: it travels in the
 * httpOnly cookie, so there is nothing to store in JavaScript.
 */

/**
 * @param {object} props
 * @param {"login" | "register"} props.mode
 */
export default function AuthForm({ mode }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const isRegister = mode === "register";

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [generalError, setGeneralError] = useState("");
  const [isPending, setIsPending] = useState(false);

  const redirectTo = safeRedirectPath(searchParams.get("next"));

  /**
   * Turn the API's `details.issues[]` into a field → message map.
   *
   * @param {unknown} details
   * @returns {Record<string, string>}
   */
  function issuesToFieldErrors(details) {
    /** @type {Record<string, string>} */
    const map = {};
    const issues =
      details && typeof details === "object" && Array.isArray(details.issues)
        ? details.issues
        : [];

    for (const issue of issues) {
      if (!issue || typeof issue !== "object") continue;
      const path = typeof issue.path === "string" ? issue.path : "";
      const message = typeof issue.message === "string" ? issue.message : "";
      if (!path || !message) continue;
      // The first issue per field wins — one message per input is enough.
      if (!map[path]) map[path] = message;
    }

    return map;
  }

  /**
   * @param {import("react").FormEvent<HTMLFormElement>} event
   */
  async function handleSubmit(event) {
    event.preventDefault();

    // Ignore a second submit while one is already in flight. Releasing the
    // pending state on success would re-enable the button in the same tick
    // as the navigation, so a double-click could fire a duplicate request.
    if (isPending) return;

    setGeneralError("");
    setFieldErrors({});
    setIsPending(true);

    const endpoint = isRegister ? "/api/auth/register" : "/api/auth/login";
    const payload = isRegister ? { name, email, password } : { email, password };

    // Tracks whether this attempt ended in a navigation. A successful sign-in
    // leaves the button disabled so a double-click cannot fire a second
    // request while the redirect is still in flight.
    let navigated = false;

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      let body = null;
      try {
        body = await response.json();
      } catch {
        body = null;
      }

      if (!response.ok) {
        const error = body?.error;
        const details = error?.details;

        const fieldMap = issuesToFieldErrors(details);
        if (Object.keys(fieldMap).length > 0) {
          setFieldErrors(fieldMap);
        }

        setGeneralError(
          typeof error?.message === "string" && error.message
            ? error.message
            : "Something went wrong. Please try again.",
        );
        return;
      }

      // The cookie is already set by the route; the redirect just needs the
      // server components to re-read it.
      navigated = true;
      router.push(redirectTo);
      router.refresh();
    } catch {
      setGeneralError("Could not reach the server. Please try again.");
    } finally {
      if (!navigated) setIsPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      {/* ── General error ────────────────────────────────────────────── */}
      <div aria-live="polite" aria-atomic="true">
        {generalError ? (
          <p className="flex items-start gap-2 rounded-xl border border-expired-100 bg-expired-50 px-3.5 py-3 text-sm text-expired-800">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{generalError}</span>
          </p>
        ) : null}
      </div>

      {isRegister ? (
        <Field
          id="name"
          label="Full name"
          type="text"
          autoComplete="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          error={fieldErrors.name}
          placeholder="Alice Rahman"
        />
      ) : null}

      <Field
        id="email"
        label="Email"
        type="email"
        autoComplete="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        error={fieldErrors.email}
        placeholder="you@example.com"
      />

      <Field
        id="password"
        label="Password"
        type="password"
        autoComplete={isRegister ? "new-password" : "current-password"}
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        error={fieldErrors.password}
        placeholder={isRegister ? "At least 8 characters" : "••••••••"}
        hint={
          isRegister
            ? `Use at least ${MIN_PASSWORD_LENGTH} characters.`
            : undefined
        }
      />

      <button
        type="submit"
        disabled={isPending}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-sand-200 disabled:text-sand-400"
      >
        {isPending ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            {isRegister ? "Creating your account…" : "Signing you in…"}
          </>
        ) : isRegister ? (
          "Create account"
        ) : (
          "Sign in"
        )}
      </button>
    </form>
  );
}

/**
 * A placeholder for the form while the client bundle boots.
 *
 * `useSearchParams()` forces the form to be client-rendered, so the page
 * needs a `<Suspense>` boundary around it (Next.js prerender requirement).
 * The skeleton mirrors the form's field count so the card does not jump
 * when the real form replaces it.
 *
 * @param {object} props
 * @param {boolean} [props.showName]
 */
export function AuthFormSkeleton({ showName = false }) {
  const fieldCount = showName ? 3 : 2;

  return (
    <div aria-hidden="true">
      {Array.from({ length: fieldCount }).map((_, index) => (
        <div key={index} className="mt-4 first:mt-0">
          <div className="h-4 w-24 rounded bg-sand-200" />
          <div className="mt-1.5 h-10 w-full rounded-xl bg-sand-100" />
        </div>
      ))}
      <div className="mt-4 h-10 w-full rounded-lg bg-sand-200" />
    </div>
  );
}

/**
 * A labelled input with an optional hint and an inline error message.
 *
 * @param {object} props
 * @param {string} props.id
 * @param {string} props.label
 * @param {string} props.type
 * @param {string} props.value
 * @param {(event: import("react").ChangeEvent<HTMLInputElement>) => void} props.onChange
 * @param {string} props.autoComplete
 * @param {string} [props.placeholder]
 * @param {string} [props.hint]
 * @param {string} [props.error]
 */
function Field({
  id,
  label,
  type,
  value,
  onChange,
  autoComplete,
  placeholder,
  hint,
  error,
}) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;

  return (
    <div>
      <label
        htmlFor={id}
        className="block text-sm font-medium text-sand-700"
      >
        {label}
      </label>

      <input
        id={id}
        name={id}
        type={type}
        value={value}
        onChange={onChange}
        autoComplete={autoComplete}
        placeholder={placeholder}
        aria-invalid={error ? "true" : undefined}
        aria-describedby={
          [hintId, errorId].filter(Boolean).join(" ") || undefined
        }
        className={`mt-1.5 w-full rounded-xl border bg-white py-2.5 px-3.5 text-sm text-sand-900 shadow-soft transition placeholder:text-sand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 ${
          error
            ? "border-expired-500 focus:border-expired-500 focus:ring-expired-500/20"
            : "border-sand-200 focus:border-brand-400 focus:ring-brand-500/20"
        }`}
      />

      {hint ? (
        <p id={hintId} className="mt-1.5 text-xs text-sand-500">
          {hint}
        </p>
      ) : null}

      {error ? (
        <p
          id={errorId}
          className="mt-1.5 flex items-start gap-1.5 text-xs text-expired-700"
        >
          <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
}
