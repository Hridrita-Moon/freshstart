/**
 * ProductDetailSkeleton — the loading state for the product detail page.
 *
 * Mirrors the shape of the detail page (media block, sidebar card) closely
 * enough that the layout does not jump when the real content arrives.
 */
export default function ProductDetailSkeleton() {
  return (
    <div
      className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8"
      aria-busy="true"
      aria-live="polite"
    >
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_380px]">
        {/* ── Main column ────────────────────────────────────────── */}
        <div>
          <div className="aspect-[16/9] animate-pulse rounded-card bg-sand-100" />

          <div className="mt-8 space-y-3">
            <div className="h-5 w-40 animate-pulse rounded bg-sand-100" />
            <div className="h-4 w-full animate-pulse rounded bg-sand-100" />
            <div className="h-4 w-4/5 animate-pulse rounded bg-sand-100" />
          </div>

          <div className="mt-10 space-y-4">
            <div className="h-5 w-44 animate-pulse rounded bg-sand-100" />
            <div className="h-32 w-full animate-pulse rounded-card bg-sand-100" />
            <div className="h-32 w-full animate-pulse rounded-card bg-sand-100" />
          </div>
        </div>

        {/* ── Sidebar ────────────────────────────────────────────── */}
        <aside>
          <div className="rounded-card border border-sand-200 bg-white p-6 shadow-soft">
            <div className="h-3 w-16 animate-pulse rounded bg-sand-100" />
            <div className="mt-2.5 h-7 w-48 animate-pulse rounded bg-sand-100" />
            <div className="mt-2 h-3 w-24 animate-pulse rounded bg-sand-100" />

            <div className="mt-6 border-t border-sand-100 pt-6">
              <div className="h-9 w-32 animate-pulse rounded bg-sand-100" />
            </div>

            <div className="mt-6 space-y-3.5 border-t border-sand-100 pt-6">
              <div className="h-4 w-full animate-pulse rounded bg-sand-100" />
              <div className="h-4 w-full animate-pulse rounded bg-sand-100" />
              <div className="h-4 w-full animate-pulse rounded bg-sand-100" />
            </div>

            <div className="mt-6 space-y-2.5 border-t border-sand-100 pt-6">
              <div className="h-10 w-full animate-pulse rounded-lg bg-sand-100" />
              <div className="h-10 w-full animate-pulse rounded-lg bg-sand-100" />
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
