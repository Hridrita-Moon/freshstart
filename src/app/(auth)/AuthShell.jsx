import Link from "next/link";
import { Leaf, MapPin, Sprout, Truck } from "lucide-react";

/**
 * AuthShell — the shared split-screen layout for `/login` and `/register`.
 *
 * SRS §9.1 places both auth pages in the `(auth)` route group, outside the
 * customer shell, so a signed-out visitor never sees the catalogue header.
 *
 * The layout is a two-column grid on `lg` and above and a single stacked
 * column below it, so the same markup works from 320 px up.
 *
 * Glassmorphism idiom: `backdrop-blur-md bg-white/70 border border-white/40
 * shadow-xl` over a soft brand/sand gradient. The blur only reads as glass
 * when there is colour behind it, so the ambient gradient and the blurred
 * colour blobs sit *behind* the cards.
 *
 * @param {object} props
 * @param {import("react").ReactNode} props.children the form slot
 * @param {string} props.title
 * @param {string} props.subtitle
 * @param {import("react").ReactNode} [props.footer]
 */
export default function AuthShell({ children, title, subtitle, footer }) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-brand-50 via-sand-50 to-brand-100">
      {/* ── Ambient colour blobs ───────────────────────────────────────
          These sit behind the cards so `backdrop-blur` has something to
          diffuse. They are decorative only. */}
      <div
        className="pointer-events-none absolute -left-24 -top-24 size-80 rounded-full bg-brand-300/40 blur-3xl"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -bottom-32 -right-16 size-96 rounded-full bg-fair-500/20 blur-3xl"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute left-1/2 top-1/3 size-72 -translate-x-1/2 rounded-full bg-brand-200/40 blur-3xl"
        aria-hidden="true"
      />

      <div className="relative mx-auto flex min-h-screen max-w-6xl flex-col items-center justify-center px-4 py-10 sm:px-6 lg:px-8">
        {/* ── Brand ───────────────────────────────────────────────────── */}
        <Link
          href="/app/products"
          className="mb-8 flex items-center gap-2 font-semibold tracking-tight text-sand-900"
        >
          <span className="flex size-9 items-center justify-center rounded-xl bg-brand-600 text-white shadow-soft">
            <Leaf className="size-5" aria-hidden="true" />
          </span>
          <span className="text-xl">FreshTrace</span>
        </Link>

        <div className="grid w-full items-center gap-8 lg:grid-cols-2 lg:gap-14">
          {/* ── Form column ──────────────────────────────────────────── */}
          <div className="w-full">
            <div className="rounded-card border border-white/40 bg-white/70 p-6 shadow-xl backdrop-blur-md sm:p-8">
              <h1 className="text-2xl font-semibold tracking-tight text-sand-900">
                {title}
              </h1>
              <p className="mt-2 text-sm leading-relaxed text-sand-600">
                {subtitle}
              </p>

              <div className="mt-6">{children}</div>

              {footer ? (
                <div className="mt-6 border-t border-sand-200/70 pt-5 text-sm text-sand-600">
                  {footer}
                </div>
              ) : null}
            </div>
          </div>

          {/* ── Promo column ──────────────────────────────────────────── */}
          <PromoCard />
        </div>
      </div>
    </div>
  );
}

/**
 * The right-hand produce promo card.
 *
 * There is no photography in the repository, so the panel is built from the
 * same vocabulary the catalogue uses — a brand/sand gradient, `lucide-react`
 * produce icons, and frosted badges — rather than shipping an unreviewable
 * binary asset.
 */
function PromoCard() {
  return (
    <div className="relative overflow-hidden rounded-card border border-white/40 bg-gradient-to-br from-brand-600 via-brand-700 to-brand-900 p-8 text-white shadow-xl backdrop-blur-md sm:p-10">
      {/* A soft light source in the corner, so the panel has depth. */}
      <div
        className="pointer-events-none absolute -right-20 -top-20 size-64 rounded-full bg-brand-400/40 blur-3xl"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -bottom-24 -left-16 size-64 rounded-full bg-fair-500/20 blur-3xl"
        aria-hidden="true"
      />

      <div className="relative">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-medium text-brand-50 backdrop-blur-sm">
          <Sprout className="size-3.5" aria-hidden="true" />
          Farm-to-table, delivered in Dhaka
        </span>

        <h2 className="mt-5 text-2xl font-semibold tracking-tight sm:text-3xl">
          Know exactly when it was picked.
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-brand-50/90">
          Every batch carries its harvest date and freshness tier, so the price
          you pay always matches how fresh the produce actually is.
        </p>

        {/* ── Produce motifs ─────────────────────────────────────────── */}
        <div className="mt-8 flex items-end gap-3">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-white/15 backdrop-blur-sm">
            <Leaf className="size-7" strokeWidth={1.25} aria-hidden="true" />
          </span>
          <span className="flex size-14 items-center justify-center rounded-2xl bg-white/15 backdrop-blur-sm">
            <Sprout className="size-7" strokeWidth={1.25} aria-hidden="true" />
          </span>
          <span className="flex size-14 items-center justify-center rounded-2xl bg-white/15 backdrop-blur-sm">
            <Truck className="size-7" strokeWidth={1.25} aria-hidden="true" />
          </span>
        </div>

        {/* ── Frosted badges ─────────────────────────────────────────── */}
        <ul className="mt-8 flex flex-wrap gap-2.5">
          <li className="inline-flex items-center gap-1.5 rounded-full border border-white/30 bg-white/20 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-md">
            <Sprout className="size-3.5" aria-hidden="true" />
            Harvested today
          </li>
          <li className="inline-flex items-center gap-1.5 rounded-full border border-white/30 bg-white/20 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-md">
            <MapPin className="size-3.5" aria-hidden="true" />
            Traceable batches
          </li>
        </ul>
      </div>
    </div>
  );
}
