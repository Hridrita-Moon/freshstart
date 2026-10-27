import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MapPin, PackageSearch, Sprout, Tag } from "lucide-react";
import BatchCard from "@/components/BatchCard";
import FreshnessBadge from "@/components/FreshnessBadge";
import { getAvailableBatches, getProductBySku } from "@/lib/catalog";
import {
  formatBDT,
  formatUnit,
  getCategoryLabel,
  getTierPresentation,
} from "@/lib/freshness";

/**
 * Product detail.
 *
 * SRS §9.1: `(customer)/app/products/[sku]/page.jsx` — product detail.
 * SRS §9.2: a Server Component, for SEO.
 *
 * The page is keyed by SKU rather than the internal cuid because a SKU is
 * meaningful to a person — it is the code printed on labels and paperwork.
 */
export async function generateMetadata({ params }) {
  const { sku } = await params;
  const product = await getProductBySku(sku);

  if (!product) {
    return { title: "Product not found — FreshTrace" };
  }

  return {
    title: `${product.name} — FreshTrace`,
    description:
      product.description ??
      `${product.name} from ${product.originDistrict ?? "our partner farms"}, with visible harvest date and freshness tier.`,
  };
}

export default async function ProductDetailPage({ params }) {
  const { sku } = await params;

  // The existence check has already run in `src/proxy.js`, which rewrites an
  // unknown SKU to the `/404` route. The check here is a second line of
  // defence: it covers the case where the product is delisted between the
  // proxy lookup and this render.
  return <ProductDetail sku={sku} />;
}

async function ProductDetail({ sku }) {
  const product = await getProductBySku(sku);

  if (!product) {
    notFound();
  }

  const batches = await getAvailableBatches(product.id);

  // The cheapest batch currently on offer is the headline price.
  const lowestPrice =
    batches.length > 0
      ? Math.min(...batches.map((batch) => batch.unitPrice))
      : product.baseUnitPrice;

  const bestBatch = batches[0] ?? null;

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      {/* ── Breadcrumb ────────────────────────────────────────────── */}
      <nav aria-label="Breadcrumb" className="mb-6">
        <Link
          href="/app/products"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-sand-500 transition hover:text-brand-700"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to catalogue
        </Link>
      </nav>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_380px]">
        {/* ── Main column ──────────────────────────────────────────── */}
        <div>
          <div className="flex aspect-[16/9] items-center justify-center overflow-hidden rounded-card bg-gradient-to-br from-brand-50 via-sand-50 to-sand-100">
            {product.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={product.imageUrl}
                alt={product.name}
                className="size-full object-cover"
              />
            ) : (
              <Sprout
                className="size-20 text-brand-300"
                strokeWidth={1}
                aria-hidden="true"
              />
            )}
          </div>

          {product.description ? (
            <div className="mt-8">
              <h2 className="text-lg font-semibold text-sand-900">
                About this produce
              </h2>
              <p className="mt-2 leading-relaxed text-sand-600">
                {product.description}
              </p>
            </div>
          ) : null}

          {/* ── Available batches ──────────────────────────────────── */}
          <div className="mt-10">
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="text-lg font-semibold text-sand-900">
                Available batches
              </h2>
              {batches.length > 0 ? (
                <p className="text-sm text-sand-500">
                  {batches.length} batch{batches.length === 1 ? "" : "es"} in stock
                </p>
              ) : null}
            </div>

            {batches.length === 0 ? (
              <div className="mt-4 flex flex-col items-center justify-center rounded-card border border-dashed border-sand-300 bg-white px-6 py-16 text-center">
                <span className="flex size-12 items-center justify-center rounded-full bg-sand-100 text-sand-400">
                  <PackageSearch className="size-6" aria-hidden="true" />
                </span>
                <h3 className="mt-4 text-base font-semibold text-sand-900">
                  No batches available right now
                </h3>
                <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-sand-600">
                  Every batch of this produce has been sold or has passed its
                  shelf life. New batches arrive daily.
                </p>
                <Link
                  href="/app/products"
                  className="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700"
                >
                  Browse other produce
                </Link>
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                {batches.map((batch) => (
                  <BatchCard
                    key={batch.id}
                    batch={batch}
                    unit={product.defaultUnit}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Sidebar ──────────────────────────────────────────────── */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-card border border-sand-200 bg-white p-6 shadow-soft">
            <p className="text-xs font-medium uppercase tracking-wide text-sand-500">
              {getCategoryLabel(product.category)}
            </p>
            <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-sand-900">
              {product.name}
            </h1>

            <p className="mt-1 font-mono text-xs text-sand-400">{product.sku}</p>

            {bestBatch ? (
              <div className="mt-4">
                <FreshnessBadge tier={bestBatch.tier} />
                <p className="mt-2 text-sm text-sand-600">
                  {getTierPresentation(bestBatch.tier).description}
                </p>
              </div>
            ) : null}

            {/* ── Price ────────────────────────────────────────────── */}
            <div className="mt-6 border-t border-sand-100 pt-6">
              <div className="flex items-end gap-2">
                <span className="text-3xl font-semibold tracking-tight text-sand-900">
                  {formatBDT(lowestPrice)}
                </span>
                <span className="pb-1 text-sm text-sand-500">
                  / {formatUnit(product.defaultUnit)}
                </span>
              </div>
              {batches.length > 0 &&
              batches.some((batch) => batch.unitPrice < product.baseUnitPrice) ? (
                <p className="mt-1.5 text-sm text-sand-500">
                  Base price{" "}
                  <span className="line-through">
                    {formatBDT(product.baseUnitPrice)}
                  </span>{" "}
                  — discounted for freshness
                </p>
              ) : null}
            </div>

            {/* ── Attributes ───────────────────────────────────────── */}
            <dl className="mt-6 space-y-3.5 border-t border-sand-100 pt-6 text-sm">
              <div className="flex items-center justify-between gap-4">
                <dt className="flex items-center gap-2 text-sand-500">
                  <Tag className="size-4 shrink-0" aria-hidden="true" />
                  Shelf life
                </dt>
                <dd className="font-medium text-sand-800">
                  {product.harvestToShelfDays} days
                </dd>
              </div>

              {product.originDistrict ? (
                <div className="flex items-center justify-between gap-4">
                  <dt className="flex items-center gap-2 text-sand-500">
                    <MapPin className="size-4 shrink-0" aria-hidden="true" />
                    Origin
                  </dt>
                  <dd className="font-medium text-sand-800">
                    {product.originDistrict}
                  </dd>
                </div>
              ) : null}

              <div className="flex items-center justify-between gap-4">
                <dt className="text-sand-500">Sold by</dt>
                <dd className="font-medium text-sand-800">
                  {formatUnit(product.defaultUnit)}
                </dd>
              </div>
            </dl>

            {/* ── Actions ──────────────────────────────────────────── */}
            <div className="mt-6 space-y-2.5 border-t border-sand-100 pt-6">
              <button
                type="button"
                disabled={batches.length === 0}
                className="w-full rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-sand-200 disabled:text-sand-400"
              >
                {batches.length === 0 ? "Out of stock" : "Add to basket"}
              </button>
              <button
                type="button"
                className="w-full rounded-lg border border-sand-200 bg-white px-4 py-2.5 text-sm font-semibold text-sand-700 transition hover:bg-sand-50"
              >
                Add to weekly subscription
              </button>
            </div>

            <p className="mt-4 text-xs leading-relaxed text-sand-400">
              Prices are computed from each batch&apos;s freshness tier, so they
              move as the produce ages.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
