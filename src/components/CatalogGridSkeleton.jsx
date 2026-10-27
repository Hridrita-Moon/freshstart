/**
 * CatalogGridSkeleton — the loading state for the catalogue grid.
 *
 * Mirrors the shape of `ProductCard` closely enough that the grid does not
 * jump when the real cards arrive.
 */
export default function CatalogGridSkeleton({ count = 8 }) {
  return (
    <div
      className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
      aria-hidden="true"
    >
      {Array.from({ length: count }, (_, index) => (
        <div
          key={index}
          className="overflow-hidden rounded-card border border-sand-200 bg-white shadow-soft"
        >
          <div className="aspect-[4/3] animate-pulse bg-sand-100" />
          <div className="space-y-3 p-4">
            <div className="h-3 w-16 animate-pulse rounded bg-sand-100" />
            <div className="h-5 w-3/4 animate-pulse rounded bg-sand-100" />
            <div className="h-3.5 w-full animate-pulse rounded bg-sand-100" />
            <div className="h-3.5 w-2/3 animate-pulse rounded bg-sand-100" />
            <div className="flex items-center justify-between border-t border-sand-100 pt-3">
              <div className="h-6 w-24 animate-pulse rounded bg-sand-100" />
              <div className="h-3 w-16 animate-pulse rounded bg-sand-100" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
