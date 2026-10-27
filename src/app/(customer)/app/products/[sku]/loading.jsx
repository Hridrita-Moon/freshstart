import ProductDetailSkeleton from "@/components/ProductDetailSkeleton";

/**
 * Loading boundary for the product detail segment.
 *
 * The customer shell (header, footer) is sent immediately and the product
 * details stream in behind the skeleton.
 *
 * This boundary also shapes the *not-found* behaviour of the segment:
 * `not-found.js` renders between `loading.js` and `page.js`, so a
 * `notFound()` thrown while the page is suspended is caught by the segment
 * boundary. For a direct request for an unknown SKU that never happens —
 * `src/proxy.js` resolves the SKU first and rewrites to `/404`.
 */
export default function Loading() {
  return <ProductDetailSkeleton />;
}
