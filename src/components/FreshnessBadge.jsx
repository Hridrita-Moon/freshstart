import { getTierPresentation } from "@/lib/freshness";

/**
 * FreshnessBadge — shows how fresh a batch is.
 *
 * The tier comes from the decay engine (SRS §5.1), which prices each tier
 * differently. Showing the tier next to the price is the whole point of the
 * product: the customer can see *why* one batch is cheaper than another.
 *
 * Renders as a plain element rather than a HeroUI `Badge` so it can be used
 * inside headings and list rows without pulling in an interactive wrapper.
 *
 * @param {object} props
 * @param {string} props.tier          `fresh` | `good` | `fair` | `near_expiry` | `expired`
 * @param {boolean} [props.showDot]    show the status dot (default true)
 * @param {string} [props.className]   extra classes on the wrapper
 * @param {string} [props.size]        `sm` | `md`
 */
export default function FreshnessBadge({
  tier,
  showDot = true,
  className = "",
  size = "md",
}) {
  const presentation = getTierPresentation(tier);

  const sizeClasses =
    size === "sm"
      ? "px-2 py-0.5 text-[11px] gap-1.5"
      : "px-2.5 py-1 text-xs gap-1.5";

  const dotSize = size === "sm" ? "size-1.5" : "size-2";

  return (
    <span
      className={`inline-flex items-center rounded-full font-medium ring-1 ring-inset whitespace-nowrap ${presentation.badgeClass} ${sizeClasses} ${className}`}
    >
      {showDot ? (
        <span
          className={`${presentation.dotClass} ${dotSize} rounded-full`}
          aria-hidden="true"
        />
      ) : null}
      {presentation.label}
    </span>
  );
}
