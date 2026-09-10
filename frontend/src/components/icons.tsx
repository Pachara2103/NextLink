/**
 * One SVG sprite rendered once per document (see app/layout.tsx), plus a typed
 * <Icon /> that references it.
 *
 * The stroke presentation attributes live on each <symbol> AND on the <svg> at
 * the use site: a <use> shadow tree inherits from the <use> element's ancestors,
 * never from the symbol's original ancestors, so attributes on a wrapping <g>
 * would silently be dropped and every icon would render as a black fill.
 */

const STROKE = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

export const ICON_NAMES = [
  "link",
  "unlink",
  "users",
  "user",
  "building",
  "search",
  "chevron-down",
  "chevrons-down",
  "chevrons-up",
  "check",
  "check-circle",
  "pencil",
  "plus",
  "sparkles",
  "bot",
  "refresh",
  "phone",
  "mail",
  "briefcase",
  "tag",
  "alert",
  "info",
  "x",
  "arrow-left",
  "arrow-right",
  "clock",
  "inbox",
  "layers",
  "loader",
  "eye",
  "eye-off",
  "log-out",
  "trash",
  "lock",
  "note",
  "message",
  "book",
  "home",
  "calendar",
  "filter",
  "settings",
  "list",
  "grid",
  "chevron-up",
  "more-vertical",
  // คุณขวัญใจ (components/agent/*)
  "send",
  "stop",
  "copy",
  "history",
] as const;

export type IconName = (typeof ICON_NAMES)[number];

export function Icon({
  name,
  className = "size-4",
}: {
  name: IconName;
  className?: string;
}) {
  return (
    <svg {...STROKE} className={className} aria-hidden="true" focusable="false">
      <use href={`#i-${name}`} />
    </svg>
  );
}

export function IconSprite() {
  return (
    <svg width={0} height={0} className="absolute" aria-hidden="true">
      <symbol {...STROKE} id="i-link" viewBox="0 0 24 24">
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
      </symbol>
      <symbol {...STROKE} id="i-unlink" viewBox="0 0 24 24">
        <path d="M9 17H7A5 5 0 0 1 7 7h2" />
        <path d="M15 7h2a5 5 0 0 1 3.54 8.54" />
        <path d="M8 12h3" />
        <path d="m3 3 18 18" />
      </symbol>
      <symbol {...STROKE} id="i-users" viewBox="0 0 24 24">
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </symbol>
      <symbol {...STROKE} id="i-user" viewBox="0 0 24 24">
        <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </symbol>
      <symbol {...STROKE} id="i-building" viewBox="0 0 24 24">
        <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18" />
        <path d="M2 22h20" />
        <path d="M10 6h.01M14 6h.01M10 10h.01M14 10h.01M10 14h.01M14 14h.01" />
        <path d="M10 22v-4h4v4" />
      </symbol>
      {/* The two layout toggles on the group panel. */}
      <symbol {...STROKE} id="i-list" viewBox="0 0 24 24">
        <path d="M8 6h13M8 12h13M8 18h13" />
        <path d="M3.5 6h.01M3.5 12h.01M3.5 18h.01" />
      </symbol>
      <symbol {...STROKE} id="i-grid" viewBox="0 0 24 24">
        <rect x="3" y="3" width="7.5" height="7.5" rx="1.5" />
        <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" />
        <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" />
        <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" />
      </symbol>
      <symbol {...STROKE} id="i-search" viewBox="0 0 24 24">
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.3-4.3" />
      </symbol>
      <symbol {...STROKE} id="i-chevron-down" viewBox="0 0 24 24">
        <path d="m6 9 6 6 6-6" />
      </symbol>
      <symbol {...STROKE} id="i-chevrons-down" viewBox="0 0 24 24">
        <path d="m7 6 5 5 5-5" />
        <path d="m7 13 5 5 5-5" />
      </symbol>
      <symbol {...STROKE} id="i-chevrons-up" viewBox="0 0 24 24">
        <path d="m7 11 5-5 5 5" />
        <path d="m7 18 5-5 5 5" />
      </symbol>
      <symbol {...STROKE} id="i-check" viewBox="0 0 24 24">
        <path d="M20 6 9 17l-5-5" />
      </symbol>
      <symbol {...STROKE} id="i-check-circle" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="9" />
        <path d="m8.5 12 2.5 2.5 4.5-4.5" />
      </symbol>
      <symbol {...STROKE} id="i-pencil" viewBox="0 0 24 24">
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
      </symbol>
      <symbol {...STROKE} id="i-plus" viewBox="0 0 24 24">
        <path d="M5 12h14" />
        <path d="M12 5v14" />
      </symbol>
      <symbol {...STROKE} id="i-sparkles" viewBox="0 0 24 24">
        <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z" />
        <path d="M19 3v4M17 5h4" />
      </symbol>
      <symbol {...STROKE} id="i-bot" viewBox="0 0 24 24">
        <rect x="3.5" y="8" width="17" height="12" rx="3.2" />
        <path d="M12 3.2v4.8" />
        <circle cx="12" cy="2.6" r="1.3" />
        <path d="M8.8 13.2v1.6M15.2 13.2v1.6" />
        <path d="M9.8 17.4h4.4" />
        <path d="M1.6 12.4v3.2M22.4 12.4v3.2" />
      </symbol>
      <symbol {...STROKE} id="i-refresh" viewBox="0 0 24 24">
        <path d="M21 12a9 9 0 1 1-2.64-6.36" />
        <path d="M21 3v5h-5" />
      </symbol>
      <symbol {...STROKE} id="i-phone" viewBox="0 0 24 24">
        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.2 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92Z" />
      </symbol>
      <symbol {...STROKE} id="i-mail" viewBox="0 0 24 24">
        <rect x="2" y="4" width="20" height="16" rx="2" />
        <path d="m22 7-10 5L2 7" />
      </symbol>
      <symbol {...STROKE} id="i-briefcase" viewBox="0 0 24 24">
        <rect x="2" y="7" width="20" height="14" rx="2" />
        <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
      </symbol>
      <symbol {...STROKE} id="i-tag" viewBox="0 0 24 24">
        <path d="M12.59 2.59A2 2 0 0 0 11.17 2H4a2 2 0 0 0-2 2v7.17a2 2 0 0 0 .59 1.42l8.7 8.7a2.43 2.43 0 0 0 3.42 0l6.58-6.58a2.43 2.43 0 0 0 0-3.42Z" />
        <path d="M7.5 7.5h.01" />
      </symbol>
      <symbol {...STROKE} id="i-alert" viewBox="0 0 24 24">
        <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
        <path d="M12 9v4" />
        <path d="M12 17h.01" />
      </symbol>
      <symbol {...STROKE} id="i-info" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 16v-4" />
        <path d="M12 8h.01" />
      </symbol>
      <symbol {...STROKE} id="i-x" viewBox="0 0 24 24">
        <path d="M18 6 6 18" />
        <path d="m6 6 12 12" />
      </symbol>
      <symbol {...STROKE} id="i-arrow-left" viewBox="0 0 24 24">
        <path d="m12 19-7-7 7-7" />
        <path d="M19 12H5" />
      </symbol>
      <symbol {...STROKE} id="i-arrow-right" viewBox="0 0 24 24">
        <path d="M5 12h14" />
        <path d="m12 5 7 7-7 7" />
      </symbol>
      <symbol {...STROKE} id="i-clock" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3.5 2" />
      </symbol>
      <symbol {...STROKE} id="i-inbox" viewBox="0 0 24 24">
        <path d="M22 12h-6l-2 3h-4l-2-3H2" />
        <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11Z" />
      </symbol>
      <symbol {...STROKE} id="i-layers" viewBox="0 0 24 24">
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
      </symbol>
      <symbol {...STROKE} id="i-eye" viewBox="0 0 24 24">
        <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
        <circle cx="12" cy="12" r="3" />
      </symbol>
      <symbol {...STROKE} id="i-eye-off" viewBox="0 0 24 24">
        <path d="M10.7 6.2A9.8 9.8 0 0 1 12 6c6 0 9.5 6 9.5 6a17 17 0 0 1-2.6 3.4" />
        <path d="M6.2 7.4A16.7 16.7 0 0 0 2.5 12S6 18 12 18a9.6 9.6 0 0 0 4-.9" />
        <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
        <path d="m3 3 18 18" />
      </symbol>
      <symbol {...STROKE} id="i-log-out" viewBox="0 0 24 24">
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
        <path d="m16 17 5-5-5-5" />
        <path d="M21 12H9" />
      </symbol>
      <symbol {...STROKE} id="i-trash" viewBox="0 0 24 24">
        <path d="M3 6h18" />
        <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
        <path d="M10 11v6" />
        <path d="M14 11v6" />
      </symbol>
      <symbol {...STROKE} id="i-lock" viewBox="0 0 24 24">
        <rect x="4" y="10" width="16" height="11" rx="2" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3" />
      </symbol>
      <symbol {...STROKE} id="i-note" viewBox="0 0 24 24">
        <path d="M6 3h8l4.5 4.5V21H6z" />
        <path d="M13.8 3v4.6h4.6" />
        <path d="M9.2 12.5h6M9.2 16.4h4" />
      </symbol>
      <symbol {...STROKE} id="i-message" viewBox="0 0 24 24">
        <path d="M4 5h16v11H9.5L4 20z" />
        <path d="M8 9h8M8 12.4h5" />
      </symbol>
      <symbol {...STROKE} id="i-book" viewBox="0 0 24 24">
        <path d="M4 5.5A2 2 0 0 1 6 3.5h13V19H6a2 2 0 0 0-2 2z" />
        <path d="M8 8h7" />
      </symbol>
      <symbol {...STROKE} id="i-home" viewBox="0 0 24 24">
        <path d="M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z" />
      </symbol>
      <symbol {...STROKE} id="i-calendar" viewBox="0 0 24 24">
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M8 3v4M16 3v4M3 11h18" />
      </symbol>
      <symbol {...STROKE} id="i-filter" viewBox="0 0 24 24">
        <path d="M3.5 6h17M6.5 12h11M10 18h4" />
      </symbol>
      <symbol {...STROKE} id="i-settings" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-2.9-1.2l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15H4.5a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.2-2.9l-.06-.06A2 2 0 1 1 8.57 5.2l.06.06a1.7 1.7 0 0 0 2.87-1.2V4a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 11h.1a2 2 0 1 1 0 4Z" />
      </symbol>
      <symbol {...STROKE} id="i-chevron-up" viewBox="0 0 24 24">
        <path d="m6 15 6-6 6 6" />
      </symbol>
      <symbol {...STROKE} id="i-loader" viewBox="0 0 24 24">
        <path d="M12 3v4" />
        <path d="M12 17v4" opacity="0.3" />
        <path d="m5.6 5.6 2.9 2.9" />
        <path d="m15.5 15.5 2.9 2.9" opacity="0.4" />
        <path d="M3 12h4" opacity="0.9" />
        <path d="M17 12h4" opacity="0.5" />
        <path d="m5.6 18.4 2.9-2.9" opacity="0.6" />
        <path d="m15.5 8.5 2.9-2.9" opacity="0.7" />
      </symbol>
      {/* The ⋮ that opens a card's overflow menu. */}
      <symbol {...STROKE} id="i-more-vertical" viewBox="0 0 24 24">
        <circle cx="12" cy="5" r="1" fill="currentColor" />
        <circle cx="12" cy="12" r="1" fill="currentColor" />
        <circle cx="12" cy="19" r="1" fill="currentColor" />
      </symbol>
      <symbol {...STROKE} id="i-send" viewBox="0 0 24 24">
        <path d="M4.5 12 20 4.5 15.2 20l-3.3-5.6Z" />
        <path d="M11.9 14.4 20 4.5" />
      </symbol>
      <symbol {...STROKE} id="i-stop" viewBox="0 0 24 24">
        <rect x="7" y="7" width="10" height="10" rx="2" />
      </symbol>
      <symbol {...STROKE} id="i-copy" viewBox="0 0 24 24">
        <rect x="9" y="9" width="11" height="11" rx="2" />
        <path d="M15 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h3" />
      </symbol>
      <symbol {...STROKE} id="i-history" viewBox="0 0 24 24">
        <path d="M3.6 10.5A8.5 8.5 0 1 1 4 15" />
        <path d="M3.2 5.5v5h5" />
        <path d="M12 7.6V12l3 1.8" />
      </symbol>
    </svg>
  );
}
