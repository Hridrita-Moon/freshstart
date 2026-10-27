import Link from "next/link";
import { Suspense } from "react";
import AuthShell from "@/app/(auth)/AuthShell";
import AuthForm, { AuthFormSkeleton } from "@/components/AuthForm";

/**
 * Sign-in page.
 *
 * SRS §9.1: `(auth)/login/page.jsx` — the auth route group sits outside the
 * customer shell, so a signed-out visitor gets a focused page rather than
 * the catalogue header.
 *
 * @param {object} props
 * @param {Promise<{ next?: string | string[] }>} props.searchParams
 */
export async function generateMetadata({ searchParams }) {
  const params = await searchParams;
  const next = Array.isArray(params?.next) ? params.next[0] : params?.next;

  return {
    title: "Sign in — FreshTrace",
    description: next
      ? "Sign in to continue to FreshTrace."
      : "Sign in to your FreshTrace account for traceable farm-to-table produce in Dhaka.",
  };
}

export default function LoginPage() {
  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to see today's batches, track your orders and manage your weekly subscription."
      footer={
        <p>
          New to FreshTrace?{" "}
          <Link
            href="/register"
            className="font-semibold text-brand-700 underline-offset-4 transition hover:underline"
          >
            Create an account
          </Link>
        </p>
      }
    >
      {/* The form reads `?next=` with `useSearchParams()`, so it needs a
          Suspense boundary to be prerendered. */}
      <Suspense fallback={<AuthFormSkeleton />}>
        <AuthForm mode="login" />
      </Suspense>
    </AuthShell>
  );
}
