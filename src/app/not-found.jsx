import Link from "next/link";
import { PackageSearch } from "lucide-react";

/**
 * Root not-found boundary.
 *
 * This file serves two kinds of request:
 *
 * 1. **Unmatched URLs.** Next.js routes any URL that matches no route to
 *    `/404`, which renders this file as a normal page — a real 404 status
 *    and a fully server-rendered body.
 * 2. **An unknown product SKU.** `src/proxy.js` resolves the SKU before the
 *    product page renders and rewrites the request to `/404`, so the same
 *    server-rendered 404 is served here.
 *
 * The second case is why the boundary lives at the root rather than in the
 * product segment: the `not-found.jsx` in a nested segment is a *client*
 * error boundary, so a throw from a Server Component would leave the initial
 * HTML empty and the message would only appear after hydration.
 *
 * It renders inside the root layout, so it does not get the customer
 * shell (header/footer) — that is the trade-off of a root-level boundary.
 */
export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center px-4 py-24 text-center">
      <span className="flex size-14 items-center justify-center rounded-full bg-sand-100 text-sand-400">
        <PackageSearch className="size-7" aria-hidden="true" />
      </span>
      <h1 className="mt-5 text-2xl font-semibold tracking-tight text-sand-900">
        We couldn&apos;t find that produce
      </h1>
      <p className="mt-2 text-base leading-relaxed text-sand-600">
        The product may have been delisted, or the link may be incorrect. The
        catalogue shows everything currently available.
      </p>
      <Link
        href="/app/products"
        className="mt-6 inline-flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700"
      >
        Back to catalogue
      </Link>
    </div>
  );
}
