import Link from "next/link";
import { PackageSearch } from "lucide-react";

/**
 * Not-found boundary for the product detail segment.
 *
 * `notFound()` is called by `[sku]/page.jsx` when a SKU does not resolve to
 * an active product. The boundary has to sit in the *same* segment as the
 * page that throws — a boundary further up the tree cannot catch it, because
 * the error is raised while the page itself is rendering.
 *
 * A direct request for an unknown SKU never reaches this file: `src/proxy.js`
 * resolves the SKU before the page renders and rewrites the request to
 * `/404`, which serves the root `not-found.jsx` with a real 404 status and
 * server-rendered markup. This boundary covers the remaining case — a
 * client-side navigation to a SKU that has since been delisted — and it
 * renders inside the customer shell (the `(customer)` layout), so the header
 * and footer are preserved.
 */
export default function ProductNotFound() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center justify-center px-4 py-24 text-center">
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
