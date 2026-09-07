"use client";

import { Icon, type IconName } from "@/components/icons";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import {
  CONTACT_ROLE_LABELS,
  CONTACT_STATUS_LABELS,
} from "@/lib/constants";
import { cn, formatThaiDate } from "@/lib/utils";
import type { Contact, ContactPersonStatus } from "@/types";

/** Only "active" is good news; the other three all read as "no longer here". */
const STATUS_TONE: Record<
  ContactPersonStatus,
  { badge: "matched" | "neutral" | "unmatched"; icon: IconName }
> = {
  active: { badge: "matched", icon: "check-circle" },
  resigned: { badge: "unmatched", icon: "log-out" },
  transferred: { badge: "unmatched", icon: "arrow-right" },
  inactive: { badge: "neutral", icon: "x" },
};

export function CompanyContactCard({
  person,
  /** True while another card's form is open — one form at a time. */
  locked,
  onEdit,
  onDelete,
}: {
  person: Contact;
  locked: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const status = STATUS_TONE[person.status];
  const nickname = person.nickname?.trim();
  const inactive = person.status !== "active";

  return (
    <div
      className={cn(
        "rounded-xl border p-3.5 transition",
        inactive
          ? "border-line-soft bg-surface"
          : "border-line bg-surface",
      )}
    >
      <div className="flex flex-wrap items-start gap-3">
        <div
          className={cn(
            "grid size-9 shrink-0 place-items-center rounded-full border",
            inactive
              ? "border-line bg-surface-2 text-text-3"
              : "border-accent-line bg-accent-soft text-accent",
          )}
        >
          <Icon name="user" className="size-4" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4
              className={cn(
                "font-display text-[14.5px] font-semibold",
                inactive ? "text-text-2" : "text-text",
              )}
            >
              {person.name}
              {nickname && (
                <span className="font-normal text-text-3"> ({nickname})</span>
              )}
            </h4>
            <Badge tone="contact">{CONTACT_ROLE_LABELS[person.role]}</Badge>
            <Badge tone={status.badge}>
              <Icon name={status.icon} className="size-3" />
              {CONTACT_STATUS_LABELS[person.status]}
            </Badge>
          </div>

          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px]">
            <Detail icon="phone" value={person.phone} empty="ไม่มีเบอร์โทร" mono />
            <Detail icon="mail" value={person.email} empty="ไม่มีอีเมล" mono />
            <span className="flex items-center gap-1.5 font-mono text-[11px] tabular-nums text-text-4">
              <Icon name="clock" className="size-3.5" />
              {formatThaiDate(person.updatedAt, true)}
            </span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Button icon="pencil" size="sm" disabled={locked} onClick={onEdit}>
            แก้ไข
          </Button>
          <Button
            variant="danger"
            icon="trash"
            size="sm"
            disabled={locked}
            onClick={onDelete}
          >
            ลบ
          </Button>
        </div>
      </div>
    </div>
  );
}

function Detail({
  icon,
  value,
  empty,
  mono = false,
}: {
  icon: IconName;
  value: string | null;
  empty: string;
  mono?: boolean;
}) {
  const blank = !value || value.trim() === "";
  return (
    <span
      className={cn(
        "flex min-w-0 items-center gap-1.5",
        blank ? "text-text-4 italic" : "text-text-2",
      )}
    >
      <Icon name={icon} className="size-3.5 shrink-0 text-text-4" />
      <span className={cn("truncate", mono && !blank && "font-mono tabular-nums")}>
        {blank ? empty : value}
      </span>
    </span>
  );
}
