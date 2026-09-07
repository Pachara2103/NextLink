"use client";

import {
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { GroupAvatar } from "@/components/groups/GroupAvatar";
import { Icon } from "@/components/icons";
import { MESSAGES } from "@/lib/constants";
import { cn, companyLabel, groupLabel } from "@/lib/utils";
import type { Contact, GroupLine } from "@/types";

/**
 * The group's avatar: its LINE profile picture when line_groups.picture_url has
 * one, and the link / unlink glyph when it does not (or when the picture fails
 * to load — see GroupAvatar).
 *
 * The border stays tied to is_linked either way. It is the only thing left
 * carrying matched state on a card now that the status pill is gone, and a
 * photo says nothing about whether a company is bound to the group.
 */
export function GroupChip({
  linked,
  size = "md",
  dim = false,
  pictureUrl,
  alt,
}: {
  /** companies.is_linked for this group: a human confirmed the company. */
  linked: boolean;
  size?: "sm" | "md";
  /** Used for groups where nothing is pending any more. */
  dim?: boolean;
  /** line_groups.picture_url, when the group has one. */
  pictureUrl?: string | null;
  /** The group's name, for the image's alt text. */
  alt?: string;
}) {
  const box = size === "md" ? "size-11 rounded-xl" : "size-10 rounded-lg";
  const glyph = size === "md" ? "size-5" : "size-[18px]";

  const frame = dim
    ? "border-line bg-surface"
    : linked
      ? "border-ok-line bg-ok-soft"
      : "border-warn-line bg-warn-soft";

  const fallbackIcon = dim ? "check-circle" : linked ? "link" : "unlink";
  const fallbackColor = dim
    ? "text-text-3"
    : linked
      ? "text-ok"
      : "text-warn";

  return (
    <div
      className={cn(
        "grid shrink-0 place-items-center overflow-hidden border",
        box,
        frame,
      )}
    >
      <GroupAvatar
        src={pictureUrl}
        alt={alt ?? ""}
        className={cn("size-full object-cover", dim && "opacity-60 grayscale")}
        fallback={<Icon name={fallbackIcon} className={cn(glyph, fallbackColor)} />}
      />
    </div>
  );
}

/* The notes page set the pattern for these little tag rows — one leading glyph
   for the whole row, then plain slate chips — and both the alias row and the
   contact row now share it, here and there, so the two read as one pair rather
   than as two differently coloured sets that happen to sit next to each other. */
const TAG_ROW =
  "flex flex-wrap items-center gap-1.5 text-[11.5px] text-text-3";
const TAG_CHIP =
  "rounded-md border border-line bg-surface px-1.5 py-px text-text-2";

/** The company's short names, behind a single tag glyph. */
export function AliasTags({
  aliases,
  highlight,
  className,
}: {
  aliases: string[] | null | undefined;
  /** Search term to mark inside each alias. */
  highlight?: string;
  className?: string;
}) {
  // A blank alias can only come from a half-finished write, but it would render
  // as an empty pill, so it is dropped here rather than shown as one.
  const list = (aliases ?? []).filter((alias) => alias.trim() !== "");
  if (list.length === 0) return null;

  return (
    <span className={cn(TAG_ROW, className)}>
      <Icon name="tag" className="size-3.5 shrink-0" />
      {list.map((alias, index) => (
        <span key={`${alias}-${index}`} className={TAG_CHIP}>
          <Highlight text={alias} term={highlight} />
        </span>
      ))}
    </span>
  );
}

/** The gap between chips in a tag row, in px — Tailwind's gap-1.5. */
const TAG_GAP = 6;
/** Stand-in for the "+n" chip's width until there is one on screen to measure. */
const MORE_CHIP_WIDTH = 34;

/**
 * The company's contacts, as chips in the same style as the aliases they sit
 * beside. Name only — the role in Thai used to lead each pill and is gone,
 * because it was the one part of the chip nobody was reading it for — with the
 * nickname in brackets, behind the same glyph as the จัดการผู้ติดต่อ button
 * that opens the full list.
 */
export function ContactTags({
  contacts,
  max,
  fit = false,
  highlight,
  className,
}: {
  contacts: Contact[];
  /** Past this, the rest collapse into a "+n" chip. Omit to show them all. */
  max?: number;
  /**
   * Keeps the row to a single line: as many chips as actually fit, and the
   * rest counted in the "+n" chip. For the card grid, where a wrapped contact
   * row pushes the footer down and leaves a column of ragged cards.
   */
  fit?: boolean;
  /** Search term to mark inside each name. */
  highlight?: string;
  className?: string;
}) {
  if (contacts.length === 0) return null;

  if (fit) {
    return (
      <FittedContactTags
        contacts={contacts}
        highlight={highlight}
        className={className}
      />
    );
  }

  const shown = max === undefined ? contacts : contacts.slice(0, max);

  return (
    <span className={cn(TAG_ROW, className)}>
      <Icon name="users" className="size-3.5 shrink-0" />
      {shown.map((person) => (
        <ContactChip key={person.id} person={person} highlight={highlight} />
      ))}
      {contacts.length > shown.length && (
        <MoreChip count={contacts.length - shown.length} />
      )}
    </span>
  );
}

/**
 * ContactTags on one line, cut to fit.
 *
 * How many names fit cannot be decided by counting them: these are full Thai
 * names with a nickname in brackets, so three of them fit one card and one
 * fills another. So every chip is rendered and measured, the ones past the
 * edge are hidden, and the count of those goes in the "+n" chip. The measuring
 * runs in a layout effect, before the browser paints, so nothing is seen
 * overflowing first.
 */
function FittedContactTags({
  contacts,
  highlight,
  className,
}: {
  contacts: Contact[];
  highlight?: string;
  className?: string;
}) {
  const rowRef = useRef<HTMLSpanElement | null>(null);
  const [shown, setShown] = useState(contacts.length);

  useLayoutEffect(() => {
    const row = rowRef.current;
    if (!row) return;

    function fit() {
      if (!row) return;

      const chips = [
        ...row.querySelectorAll<HTMLElement>("[data-contact-chip]"),
      ];
      if (chips.length === 0) return;

      const icon = row.querySelector<HTMLElement>("[data-row-icon]");
      const more = row.querySelector<HTMLElement>("[data-more-chip]");

      // Un-hide everything first: a chip left at display:none from the last
      // pass measures 0 and would be counted as fitting.
      for (const chip of chips) chip.hidden = false;

      // Fractional widths, because offsetWidth rounds each chip down and a
      // row of them then overflows by a pixel or two. The 2px held back
      // covers what is left of that rounding in clientWidth itself.
      const widthOf = (el: Element) => el.getBoundingClientRect().width;
      const available = row.clientWidth - 2;
      // Read rather than assumed, so restyling the row's gap cannot quietly
      // put the arithmetic here out of step with what the browser lays out.
      const gap =
        parseFloat(getComputedStyle(row).columnGap) || TAG_GAP;

      const moreWidth = more ? widthOf(more) : MORE_CHIP_WIDTH;
      let used = (icon ? widthOf(icon) : 14) + gap;
      let count = 0;

      for (const [index, chip] of chips.entries()) {
        // Room for the "+n" chip has to be kept while any chip is still left
        // after this one, or the last name fits and its counter does not.
        const reserve = index < chips.length - 1 ? moreWidth + gap : 0;
        const next = used + widthOf(chip) + reserve;
        // The first chip goes in whatever the width: a "+3" on its own says
        // less than one name and a "+2" beside it.
        if (count > 0 && next > available) break;
        used += widthOf(chip) + gap;
        count += 1;
      }

      // Applied here rather than left to React alone: when the count comes out
      // the same as last time there is no re-render to re-hide them.
      for (const [index, chip] of chips.entries()) {
        chip.hidden = index >= count;
      }
      setShown(count);
    }

    fit();

    // A chip's width changes once the display font finishes loading.
    document.fonts?.ready.then(fit).catch(() => {});

    const observer = new ResizeObserver(fit);
    observer.observe(row);
    return () => observer.disconnect();
  }, [contacts]);

  const hidden = contacts.length - shown;

  return (
    // w-full so the row owns its line and clientWidth is the width to fit
    // into; overflow-hidden so the pass before the first measurement, and any
    // single chip too wide for the card, are clipped rather than spilling.
    <span
      ref={rowRef}
      className={cn(TAG_ROW, "w-full flex-nowrap overflow-hidden", className)}
    >
      <Icon name="users" data-row-icon className="size-3.5 shrink-0" />
      {contacts.map((person, index) => (
        <ContactChip
          key={person.id}
          person={person}
          highlight={highlight}
          nowrap
          hidden={index >= shown}
        />
      ))}
      {hidden > 0 && <MoreChip count={hidden} />}
    </span>
  );
}

/** One contact: their name, and their nickname in brackets when they have one. */
function ContactChip({
  person,
  highlight,
  nowrap = false,
  hidden = false,
}: {
  person: Contact;
  highlight?: string;
  /** For the fitted row, where a chip is dropped whole instead of wrapped. */
  nowrap?: boolean;
  hidden?: boolean;
}) {
  const nickname = person.nickname?.trim();

  return (
    <span
      data-contact-chip
      hidden={hidden}
      className={cn(
        TAG_CHIP,
        nowrap ? "shrink-0 whitespace-nowrap" : "max-w-full truncate",
        person.status !== "active" && "opacity-55",
      )}
    >
      <Highlight text={person.name} term={highlight} />
      {nickname && (
        <span className="text-text-3">
          {" ("}
          <Highlight text={nickname} term={highlight} />
          {")"}
        </span>
      )}
    </span>
  );
}

/** The count of the contacts that did not fit. */
function MoreChip({ count }: { count: number }) {
  return (
    <span
      data-more-chip
      title={`และอีก ${count} คน — กดจัดการผู้ติดต่อเพื่อดูทั้งหมด`}
      className={cn(TAG_CHIP, "shrink-0 font-mono tabular-nums")}
    >
      +{count}
    </span>
  );
}

/**
 * Group name, status badges, and underneath it the company line: the company
 * name with its short names beside it, then the company's contacts to the right
 * of those. Both tag rows are omitted entirely when there is nothing in them,
 * so a company with neither reads exactly as it did before.
 */
export function GroupIdentity({
  group,
  badges,
  contacts = [],
  titleSize = "md",
  muted = false,
  highlight,
  onCompanyClick,
}: {
  group: GroupLine;
  badges?: ReactNode;
  /** This company's contacts, for the tag row under the company name. */
  contacts?: Contact[];
  titleSize?: "sm" | "md";
  muted?: boolean;
  /** Search term to mark inside the name and company line. */
  highlight?: string;
  /**
   * Makes the company caption a second way into the company form, so the row
   * is not driven by its edit button alone. Omit it to render plain text.
   */
  onCompanyClick?: () => void;
}) {
  const { primary, secondary } = companyLabel(group);
  const title = groupLabel(group);

  const companyClass = cn(
    "flex min-w-0 items-center gap-1.5 truncate",
    titleSize === "md" ? "text-[13px]" : "text-[12.5px]",
    muted ? "text-text-3" : "text-text-2",
  );

  const companyLine = primary ? (
    <>
      <Icon
        name="building"
        className={cn(
          "size-3.5 shrink-0",
          muted ? "text-text-4" : "text-text-4",
        )}
      />
      <Highlight text={primary} term={highlight} />
      {secondary ? (
        <span className="text-text-4">
          (<Highlight text={secondary} term={highlight} />)
        </span>
      ) : (
        <span className="text-text-4">
          {group.companyTh ? "(ไม่มีชื่อภาษาอังกฤษ)" : "(ไม่มีชื่อภาษาไทย)"}
        </span>
      )}
    </>
  ) : (
    <span className="truncate italic text-text-4">
      {MESSAGES.noCompanyName}
    </span>
  );

  return (
    <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-center gap-2">
        {onCompanyClick ? (
          <button
            type="button"
            onClick={onCompanyClick}
            title={group.isLinked ? "แก้ไขชื่อบริษัท" : "เพิ่มชื่อบริษัท"}
            className={cn(
              "cursor-pointer truncate text-left font-display font-semibold underline-offset-4 transition hover:text-accent",
              titleSize === "md" ? "text-[17px]" : "text-[15px]",
              muted ? "text-text-2" : "text-text",
            )}
          >
            <Highlight text={title} term={highlight} />
          </button>
        ) : (
          <h3
            className={cn(
              "truncate font-display font-semibold",
              titleSize === "md" ? "text-[17px]" : "text-[15px]",
              muted ? "text-text-2" : "text-text",
            )}
          >
            <Highlight text={title} term={highlight} />
          </h3>
        )}

        {badges}
      </div>

      {/* The aliases sit on the company's own line, to the right of the name,
          because that is what they are short for, and the contacts follow them
          — the same order as on the notes page. They wrap with the name rather
          than pushing it out of the row. */}
      <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
        <p className={companyClass}>{companyLine}</p>
        <AliasTags aliases={group.aliases} highlight={highlight} />
        <ContactTags contacts={contacts} highlight={highlight} />
      </div>
    </div>
  );
}

/** Wraps every case-insensitive occurrence of `term` in an accent span. */
export function Highlight({ text, term }: { text: string; term?: string }) {
  const needle = term?.trim();
  if (!needle) return <>{text}</>;

  const parts: ReactNode[] = [];
  const lower = text.toLowerCase();
  const lowerNeedle = needle.toLowerCase();
  let cursor = 0;

  for (;;) {
    const at = lower.indexOf(lowerNeedle, cursor);
    if (at === -1) break;
    if (at > cursor) parts.push(text.slice(cursor, at));
    parts.push(
      <span key={at} className="text-accent">
        {text.slice(at, at + needle.length)}
      </span>,
    );
    cursor = at + needle.length;
  }
  parts.push(text.slice(cursor));

  return <>{parts}</>;
}
