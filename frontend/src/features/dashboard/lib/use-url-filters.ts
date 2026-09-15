"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { academicPeriodFromQuery } from "./academic-period";

/**
 * Mirror the active filters into the query string and restore them on load, so
 * a filtered view can be bookmarked or pasted to a colleague and survives a
 * refresh.
 *
 * Record filters use history.replaceState to avoid adding an entry on every
 * keystroke. Academic period changes use the Next router separately to load
 * the correct server payload; these reserved parameters must be preserved.
 *
 * Pass an empty string for a filter that is at its default; those are left out
 * of the URL so a clean view has a clean address.
 */
export function useUrlFilters(values: Record<string, string>, onRestore: (found: Record<string, string>) => void) {
  const searchParams = useSearchParams();
  const [restored, setRestored] = useState(false);
  // URL params are available during rendering. Restore once before committing
  // the view so an initial effect cannot overwrite bookmarked filters.
  if (!restored) {
    const found: Record<string, string> = {};
    searchParams.forEach((value, key) => {
      if (value && key !== "year" && key !== "term") found[key] = value;
    });
    setRestored(true);
    if (Object.keys(found).length > 0) onRestore(found);
  }

  // Serialised so the effect tracks the values rather than the object identity.
  const serialised = JSON.stringify(values);

  useEffect(() => {
    // Skip the first pass: writing before the restore has run would erase the
    // very query string we are about to read.
    if (!restored) return;
    const params = new URLSearchParams();
    const current = new URLSearchParams(window.location.search);
    if (current.has("year") || current.has("term")) {
      const period = academicPeriodFromQuery(current);
      params.set("year", String(period.year)); params.set("term", period.term);
    }
    for (const [key, value] of Object.entries(JSON.parse(serialised) as Record<string, string>)) {
      if (value && key !== "year" && key !== "term") params.set(key, value);
    }
    const query = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`);
  }, [serialised, restored]);
}
