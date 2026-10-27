import { Suspense } from "react";
import { PackageSearch } from "lucide-react";
import ProductCard from "@/components/ProductCard";
import CatalogFilters from "@/components/CatalogFilters";
import CatalogGridSkeleton from "@/components/CatalogGridSkeleton";
import {
  getBestBatch,
  getCatalogProducts,
  getCategoryCounts,
} from "@/lib/catalog";

/**
 * Product catalogue.
 *
 * SRS §9.1: `(customer)/app/products/page.jsx` — the catalog.
 * SRS §9.2: a Server Component (list) with a Client Component (filters).
 * SRS §9.3: the data is read directly through Prisma, not via an HTTP hop.
 *
 * Each product is shown with its *best available batch* — the freshest batch
 * still in stock, at the price the decay engine has computed for it. The
 * shopper therefore sees what they can buy today and what it costs now.
 */
export const metadata = {
  title: "Catalogue — FreshTrace",
  description:
    "Browse fresh, traceable produce from Dhaka's farm-to-table hub. Every batch shows its harvest date and freshness tier.",
};

export default async function ProductsPage({ searchParams }) {
  const params = await searchParams;
  const category = typeof params?.category === "string" ? params.category : "all";
  const search = typeof params?.q === "string" ? params.q : "";

  const [products, categories] = await Promise.all([
    getCatalogProducts({ category, search }),
    getCategoryCounts(),
  ]);

  const totalCount = categories.reduce((sum, entry) => sum + entry.count, 0);

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      {/* ── Page header ────────────────────────────────────────────── */}
      <div className="max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-tight text-sand-900">
          Today&apos;s produce
        </h1>
        <p className="mt-2 text-base leading-relaxed text-sand-600">
          Everything here was harvested in the last few days and passed
          inspection at our hub. Prices reflect the batch&apos;s freshness — the
          fresher it is, the closer to the base price.
        </p>
      </div>

      {/* ── Filters ────────────────────────────────────────────────── */}
      <div className="mt-8">
        <Suspense fallback={<div className="h-24" />}>
          <CatalogFilters
            categories={categories}
            activeCategory={category}
            totalCount={totalCount}
          />
        </Suspense>
      </div>

      {/* ── Grid ───────────────────────────────────────────────────── */}
      <div className="mt-8">
        {products.length === 0 ? (
          <EmptyCatalogue hasFilters={category !== "all" || search !== ""} />
        ) : (
          <Suspense fallback={<CatalogGridSkeleton />}>
            <ProductGrid products={products} />
          </Suspense>
        )}
      </div>
    </div>
  );
}

/**
 * The grid itself.
 *
 * Split into its own component so the Suspense boundary covers the per-batch
 * queries: the catalogue shell renders immediately while the best-batch
 * lookups stream in.
 *
 * @param {object} props
 * @param {import("@prisma/client").Product[]} props.products
 */
async function ProductGrid({ products }) {
  const bestBatches = await Promise.all(
    products.map((product) => getBestBatch(product.id)),
  );

  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {products.map((product, index) => (
        <ProductCard
          key={product.id}
          product={product}
          bestBatch={bestBatches[index]}
        />
      ))}
    </div>
  );
}

/**
 * @param {object} props
 * @param {boolean} props.hasFilters
 */
function EmptyCatalogue({ hasFilters }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-card border border-dashed border-sand-300 bg-white px-6 py-20 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-sand-100 text-sand-400">
        <PackageSearch className="size-6" aria-hidden="true" />
      </span>
      <h2 className="mt-4 text-base font-semibold text-sand-900">
        {hasFilters ? "No produce matches those filters" : "No produce listed yet"}
      </h2>
      <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-sand-600">
        {hasFilters
          ? "Try a different category, or clear the search to see everything on offer."
          : "Our hub is receiving new batches daily. Check back soon."}
      </p>
    </div>
  );
}
