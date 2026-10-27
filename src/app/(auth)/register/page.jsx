import Link from "next/link";
import { Suspense } from "react";
import AuthShell from "@/app/(auth)/AuthShell";
import AuthForm, { AuthFormSkeleton } from "@/components/AuthForm";

/**
 * Registration page.
 *
 * SRS §9.1: `(auth)/register/page.jsx` — the auth route group sits outside
 * the customer shell.
 *
 * @param {object} props
 * @param {Promise<{ next?: string | string[] }>} props.searchParams
 */
export async function generateMetadata({ searchParams }) {
  const params = await searchParams;
  const next = Array.isArray(params?.next) ? params.next[0] : params?.next;

  return {
    title: "Create an account — FreshTrace",
    description: next
      ? "Create a FreshTrace account to continue."
      : "Create a FreshTrace account for traceable farm-to-table produce delivered in Dhaka.",
  };
}

export default function RegisterPage() {
  return (
    <AuthShell
      title="Create your account"
      subtitle="One account for fresh produce, weekly subscriptions and delivery across Dhaka."
      footer={
        <p>
          Already have an account?{" "}
          <Link
            href="/login"
            className="font-semibold text-brand-700 underline-offset-4 transition hover:underline"
          >
            Sign in
          </Link>
        </p>
      }
    >
      {/* The form reads `?next=` with `useSearchParams()`, so it needs a
          Suspense boundary to be prerendered. */}
      <Suspense fallback={<AuthFormSkeleton showName />}>
        <AuthForm mode="register" />
      </Suspense>
    </AuthShell>
  );
}
