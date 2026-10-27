"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LogOut } from "lucide-react";

/**
 * LogoutButton — signs the visitor out.
 *
 * SRS §3.1: because sessions are server-side, logging out is immediate and
 * global — the route deletes the session row and clears the `ft_session`
 * cookie. The raw token never reaches JavaScript, so there is nothing to
 * clean up on the client.
 *
 * After the request, the server components are refreshed so the Navbar
 * re-renders in its signed-out state without a full page reload.
 */
export default function LogoutButton() {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState("");

  /**
   * @param {import("react").MouseEvent<HTMLButtonElement>} event
   */
  async function handleLogout(event) {
    event.preventDefault();
    setError("");

    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });

      if (!response.ok) {
        // The server refused to end the session. Navigating away now would
        // show a signed-out Navbar while the session is still live, so the
        // visitor is told instead.
        setError("Could not sign you out. Please try again.");
        return;
      }
    } catch {
      // A failed request must not trap the visitor on the page. The session
      // cookie is *not* cleared by the browser here — it is cleared
      // server-side by the logout route's `Max-Age=0` response — so the
      // session may still be alive and the Navbar will still show it.
      setError("Could not reach the server. Please try again.");
      return;
    }

    router.refresh();
    router.push("/app/products");
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleLogout}
        disabled={isPending}
        className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-sand-600 transition hover:bg-sand-100 hover:text-sand-900 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <LogOut className="size-4" aria-hidden="true" />
        <span className="hidden sm:inline">
          {isPending ? "Signing out…" : "Log out"}
        </span>
      </button>

      {error ? (
        <span role="alert" className="text-xs text-expired-700">
          {error}
        </span>
      ) : null}
    </span>
  );
}
