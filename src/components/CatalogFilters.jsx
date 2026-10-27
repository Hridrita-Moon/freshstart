"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";
import { Search, X } from "lucide-react";

/**
 * CatalogFilters — the interactive filter bar above the catalogue grid.
 *
 * SRS §9.2: the catalogue is a Server Component (list) plus a Client
 * Component (filters) — the initial paint is server-rendered, and the
 * filters are interactive.
 *
 * Filters are stored in the URL (`?category=fruit&q=mango`) so the view is
 * shareable and the browser's back button works. The server component
 * re-runs with the new search params when the URL changes.
 */
export default function CatalogFilters({ categories, activeCategory, totalCount }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const urlQuery = searchParams.get("q") ?? "";

  // The search box is a controlled input, but its value comes from the URL.
  // React's documented pattern for "adjust state when a prop changes" is to
  // compare against the previous value *during render* rather than to
  // synchronise it in an effect — an effect that calls `setState` causes a
  // cascading render.
  const [query, setQuery] = useState(urlQuery);
  const [lastUrlQuery, setLastUrlQuery] = useState(urlQuery);

  if (urlQuery !== lastUrlQuery) {
    setLastUrlQuery(urlQuery);
    setQuery(urlQuery);
  }

  /**
   * Push a new URL, preserving the other parameters.
   *
   * @param {Record<string, string | null>} updates
   */
  const applyFilters = useCallback(
    (updates) => {
      const params = new URLSearchParams(searchParams.toString());

      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === "" || value === "all") {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      }

      const queryString = params.toString();
      startTransition(() => {
        router.replace(queryString ? `?${queryString}` : "?", { scroll: false });
      });
    },
    [router, searchParams],
  );

  // Debounce the search box so typing does not fire a request per keystroke.
  useEffect(() => {
    if (query === urlQuery) return;

    const timer = setTimeout(() => {
      applyFilters({ q: query || null });
    }, 300);

    return () => clearTimeout(timer);
  }, [query, urlQuery, applyFilters]);

  const hasFilters = activeCategory !== "all" || (searchParams.get("q") ?? "") !== "";

  return (
    <div className="flex flex-col gap-4">
      {/* ── Search ────────────────────────────────────────────────── */}
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-sand-400"
          aria-hidden="true"
        />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search for mangoes, tomatoes, mint…"
          aria-label="Search the catalogue"
          className="w-full rounded-xl border border-sand-200 bg-white py-2.5 pl-10 pr-10 text-sm text-sand-900 shadow-soft transition placeholder:text-sand-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
        />
        {query ? (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              applyFilters({ q: null });
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-sand-400 transition hover:bg-sand-100 hover:text-sand-600"
            aria-label="Clear search"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        ) : null}
      </div>

      {/* ── Category chips ────────────────────────────────────────── */}
      <div
        className="flex flex-wrap items-center gap-2"
        role="group"
        aria-label="Filter by category"
      >
        <CategoryChip
          label="All produce"
          count={totalCount}
          active={activeCategory === "all"}
          onClick={() => applyFilters({ category: null })}
        />

        {categories.map((entry) => (
          <CategoryChip
            key={entry.category}
            label={CATEGORY_LABELS[entry.category] ?? entry.category}
            count={entry.count}
            active={activeCategory === entry.category}
            onClick={() => applyFilters({ category: entry.category })}
          />
        ))}

        {hasFilters ? (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              applyFilters({ category: null, q: null });
            }}
            className="ml-1 text-sm font-medium text-brand-700 underline-offset-4 transition hover:underline"
          >
            Clear all
          </button>
        ) : null}
      </div>

      {/* The grid dims slightly while a new filter result is loading, so the
          transition is visible without a full-page spinner. */}
      <div
        className={`transition-opacity ${isPending ? "opacity-60" : "opacity-100"}`}
        aria-live="polite"
        aria-busy={isPending}
      />
    </div>
  );
}

const CATEGORY_LABELS = {
  fruit: "Fruit",
  vegetable: "Vegetables",
  other: "Herbs & other",
  all: "All produce",
};

/**
 * @param {object} props
 * @param {string} props.label
 * @param {number} props.count
 * @param {boolean} props.active
 * @param {() => void} props.onClick
 */
function CategoryChip({ label, count, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
        active
          ? "bg-brand-600 text-white shadow-soft"
          : "bg-white text-sand-600 ring-1 ring-inset ring-sand-200 transition hover:bg-sand-50 hover:text-sand-900"
      }`}
    >
      {label}
      <span
        className={`text-xs tabular-nums ${active ? "text-brand-100" : "text-sand-400"}`}
      >
        {count}
      </span>
    </button>
  );
}
