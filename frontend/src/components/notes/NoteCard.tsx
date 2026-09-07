"use client";

import { Icon } from "@/components/icons";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import {
  SENTIMENT,
  SOURCE,
  TERM_LABEL,
  noteTypeMeta,
  notePersonLabel,
} from "@/lib/notes";
import { formatThaiDate } from "@/lib/utils";
import type { Note } from "@/types";

/** One note. The sentiment shows up three times over — bar, badge and dot — on
 *  purpose: it is the thing a reviewer scans a long list for. */
export function NoteCard({
  note,
  onEdit,
  onDelete,
}: {
  note: Note;
  onEdit: (note: Note) => void;
  onDelete: (note: Note) => void;
}) {
  const sentiment = SENTIMENT[note.sentiment ?? "neutral"];
  const source = SOURCE[note.source ?? "external"];
  const type = noteTypeMeta(note.type ?? "mou");
  const person = notePersonLabel(note);
  const edited = note.createdAt !== note.updatedAt;

  return (
    <article className="group rounded-xl border border-line bg-surface p-4 transition hover:border-text-4 hover:bg-surface-2">
      <div className="flex flex-wrap items-start gap-3">
        <span
          className={`mt-0.5 h-[38px] w-[3px] shrink-0 rounded-full ${sentiment.bar}`}
          aria-hidden
        />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="neutral">
              <Icon name={type.icon} className="size-3.5" />
              {type.label}
            </Badge>
            <Badge tone="neutral" className={source.badge}>
              <Icon name={source.icon} className="size-3.5" />
              {source.short}
            </Badge>
            <Badge tone="neutral" className={sentiment.badge}>
              <span className={`size-1.5 rounded-full ${sentiment.dot}`} />
              {sentiment.label}
            </Badge>
          </div>

          <p className="mt-2.5 text-[13.5px] leading-relaxed whitespace-pre-line text-text">
            {note.content}
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-x-3.5 gap-y-1.5 text-[12px] text-text-3">
            {person && (
              <span className="flex items-center gap-1.5">
                <Icon name="user" className="size-3.5" />
                <span className="text-text-2">{person}</span>
              </span>
            )}
            <span className="flex items-center gap-1.5 tabular-nums">
              <Icon name="clock" className="size-3.5" />
              แก้ไข {formatThaiDate(note.updatedAt, true)}
            </span>
            {edited && (
              <span className="flex items-center gap-1.5 tabular-nums text-text-4">
                <Icon name="calendar" className="size-3.5" />
                สร้าง {formatThaiDate(note.createdAt)}
              </span>
            )}
          </div>
        </div>

        {/* Controls on top, the term chip pushed to the bottom-right corner. */}
        <div className="flex shrink-0 flex-col items-end gap-2 self-stretch">
          <div className="flex items-center gap-1.5">
            <Button size="sm" icon="pencil" onClick={() => onEdit(note)}>
              แก้ไข
            </Button>
            <Button
              size="sm"
              variant="danger"
              icon="trash"
              onClick={() => onDelete(note)}
            >
              ลบ
            </Button>
          </div>
          <span
            className="mt-auto inline-flex items-center gap-1.5 rounded-full border border-line bg-sunken px-2.5 py-1 font-mono text-[11px] tabular-nums text-text-2"
            title={`ปีการศึกษา ${note.academicYear ?? "-"} · ${
              TERM_LABEL[note.term ?? 0] ?? "ไม่ระบุภาคเรียน"
            }`}
          >
            <Icon name="calendar" className="size-3.5" />
            {note.academicYear ?? "-"} · เทอม {note.term ?? "-"}
          </span>
        </div>
      </div>
    </article>
  );
}
