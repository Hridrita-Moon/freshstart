import Link from "next/link";
import { MapPin, Sprout, Tag } from "lucide-react";
import FreshnessBadge from "@/components/FreshnessBadge";
import {
  formatBDT,
  formatQty,
  formatUnit,
  getCategoryLabel,
  getTierPresentation,
} from "@/lib/freshness";

/**
 * ProductCard — a single product in the catalogue grid.
 *
 * The card shows the *best available batch* for a product rather than the
 * product's base price. A shopper should see what they can actually buy
 * today and what it costs now, including the freshness discount the decay
 * engine has applied.
 *
 * When a product has no listed batch, the card is still rendered — it is
 * marked "Sold out" rather than disappearing, so the catalogue stays stable
 * and the product keeps a place in search results.
 *
 * @param {object} props
 * @param {import("@prisma/client").Product & { availableQty?: number, tier?: string, unitPrice?: number }} props.product
 * @param {object} [props.bestBatch] the best available batch, if any
 */
export default function ProductCard({ product, bestBatch }) {
  const hasStock = Boolean(bestBatch);
  const tier = bestBatch?.tier;
  const presentation = getTierPresentation(tier);

  const unitPrice = hasStock ? bestBatch.unitPrice : product.baseUnitPrice;
  const isDiscounted = hasStock && unitPrice < product.baseUnitPrice;

  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-card border border-sand-200 bg-white shadow-soft transition duration-200 hover:-translate-y-0.5 hover:border-sand-300 hover:shadow-lifted focus-within:-translate-y-0.5 focus-within:shadow-lifted">
      {/* ── Media / placeholder ─────────────────────────────────────── */}
      <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden bg-gradient-to-br from-brand-50 via-sand-50 to-sand-100">
        {product.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.imageUrl}
            alt={product.name}
            className="size-full object-cover transition duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <Sprout
            className="size-12 text-brand-300 transition duration-300 group-hover:text-brand-400"
            strokeWidth={1.25}
            aria-hidden="true"
          />
        )}

        {/* The tier badge sits over the media so the freshness is the first
            thing a shopper notices. */}
        {hasStock ? (
          <div className="absolute left-3 top-3">
            <FreshnessBadge tier={tier} />
          </div>
        ) : null}

        {!hasStock ? (
          <div className="absolute right-3 top-3">
            <span className="inline-flex items-center rounded-full bg-white/90 px-2.5 py-1 text-xs font-medium text-sand-600 shadow-soft ring-1 ring-inset ring-sand-200 backdrop-blur-sm">
              Sold out
            </span>
          </div>
        ) : null}

        {isDiscounted ? (
          <div className="absolute bottom-3 left-3">
            <span className="inline-flex items-center gap-1 rounded-full bg-expired-600 px-2 py-0.5 text-[11px] font-semibold text-white shadow-soft">
              <Tag className="size-3" aria-hidden="true" />
              {Math.round((1 - unitPrice / product.baseUnitPrice) * 100)}% off
            </span>
          </div>
        ) : null}
      </div>

      {/* ── Body ────────────────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-sand-500">
              {getCategoryLabel(product.category)}
            </p>
            <h3 className="mt-1 truncate text-base font-semibold text-sand-900">
              {/* The whole card is clickable, but this keeps the link
                  meaningful for screen readers and middle-click. */}
              <Link
                href={`/app/products/${product.sku}`}
                className="after:absolute after:inset-0 after:content-[''] hover:text-brand-700"
              >
                {product.name}
              </Link>
            </h3>
          </div>
        </div>

        {product.description ? (
          <p className="line-clamp-2 text-sm leading-relaxed text-sand-600">
            {product.description}
          </p>
        ) : null}

        <div className="mt-auto space-y-3">
          {/* ── Price ─────────────────────────────────────────────── */}
          <div className="flex items-end justify-between gap-2">
            <div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-xl font-semibold tracking-tight text-sand-900">
                  {formatBDT(unitPrice)}
                </span>
                <span className="text-sm text-sand-500">
                  / {formatUnit(product.defaultUnit)}
                </span>
              </div>
              {isDiscounted ? (
                <p className="mt-0.5 text-xs text-sand-500 line-through">
                  {formatBDT(product.baseUnitPrice)}
                </p>
              ) : null}
            </div>

            {hasStock ? (
              <p className="text-right text-xs text-sand-500">
                {formatQty(bestBatch.availableQty)} {product.defaultUnit} left
              </p>
            ) : null}
          </div>

          {/* ── Meta ──────────────────────────────────────────────── */}
          <dl className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-sand-100 pt-3 text-xs text-sand-500">
            {product.originDistrict ? (
              <div className="flex items-center gap-1.5">
                <dt className="sr-only">Origin</dt>
                <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
                <dd>{product.originDistrict}</dd>
              </div>
            ) : null}

            <div className="flex items-center gap-1.5">
              <dt className="sr-only">Shelf life</dt>
              <Tag className="size-3.5 shrink-0" aria-hidden="true" />
              <dd>{product.harvestToShelfDays}-day shelf life</dd>
            </div>
          </dl>

          {hasStock ? (
            <p className={`text-xs ${presentation.accentClass}`}>
              {presentation.description}
            </p>
          ) : null}
        </div>
      </div>
    </article>
  );
}
