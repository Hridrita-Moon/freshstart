import { Calendar, MapPin, ShieldCheck, Truck } from "lucide-react";
import FreshnessBadge from "@/components/FreshnessBadge";
import {
  formatBDT,
  formatDate,
  formatQty,
  getTierPresentation,
} from "@/lib/freshness";

/**
 * BatchCard — one available batch of a product on the detail page.
 *
 * A product can have several batches in stock at once, each with its own
 * harvest date and freshness tier. This is the transparency the product
 * promises: the customer sees exactly which lot they are buying, harvested
 * on which date, from which district.
 *
 * @param {object} props
 * @param {Record<string, any>} props.batch
 * @param {string} props.unit the product's unit of sale
 */
export default function BatchCard({ batch, unit }) {
  const presentation = getTierPresentation(batch.tier);
  const isDiscounted = batch.unitPrice < batch.baseUnitPrice;

  return (
    <article className="overflow-hidden rounded-card border border-sand-200 bg-white shadow-soft">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-sand-100 bg-sand-50/60 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <FreshnessBadge tier={batch.tier} size="sm" />
          <span className="text-sm font-medium text-sand-700">
            {presentation.description}
          </span>
        </div>

        <div className="flex items-baseline gap-1.5">
          <span className="text-lg font-semibold tracking-tight text-sand-900">
            {formatBDT(batch.unitPrice)}
          </span>
          <span className="text-sm text-sand-500">/ {unit}</span>
          {isDiscounted ? (
            <span className="text-xs text-sand-500 line-through">
              {formatBDT(batch.baseUnitPrice)}
            </span>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 p-4 sm:grid-cols-2">
        <DetailRow icon={Calendar} label="Harvested">
          {formatDate(batch.harvestDate)}
          <span className="ml-1 text-sand-400">
            ({batch.daysSinceHarvest} day{batch.daysSinceHarvest === 1 ? "" : "s"} ago)
          </span>
        </DetailRow>

        <DetailRow icon={MapPin} label="Origin">
          {batch.originDistrict}
        </DetailRow>

        <DetailRow icon={Truck} label="Available">
          {formatQty(batch.availableQty)} {unit}
        </DetailRow>

        <DetailRow icon={ShieldCheck} label="Shelf life left">
          {batch.remainingShelfDays > 0
            ? `${batch.remainingShelfDays} day${batch.remainingShelfDays === 1 ? "" : "s"}`
            : "Last day"}
        </DetailRow>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-sand-100 px-4 py-3 text-xs text-sand-500">
        <span className="font-mono">{batch.batchCode}</span>
        {batch.aggregator?.companyName || batch.aggregator?.name ? (
          <span>Supplied by {batch.aggregator.companyName ?? batch.aggregator.name}</span>
        ) : null}
      </div>
    </article>
  );
}

/**
 * @param {object} props
 * @param {import("lucide-react").LucideIcon} props.icon
 * @param {string} props.label
 * @param {import("react").ReactNode} props.children
 */
function DetailRow({ icon: Icon, label, children }) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="mt-0.5 size-4 shrink-0 text-sand-400" aria-hidden="true" />
      <div className="min-w-0">
        <dt className="text-xs font-medium uppercase tracking-wide text-sand-400">
          {label}
        </dt>
        <dd className="mt-0.5 text-sm text-sand-800">{children}</dd>
      </div>
    </div>
  );
}
