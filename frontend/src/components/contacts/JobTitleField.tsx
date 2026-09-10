"use client";

import { useState } from "react";

import { FieldLabel, SelectField, TextField } from "@/components/ui/Field";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { EMPLOYEE_FIELD_LABELS, JOB_TITLE_OPTIONS } from "@/lib/constants";
import { cn, isJobTitlePreset } from "@/lib/utils";

/**
 * Which of the field's two inputs is live. Not derived from the value on every
 * render: an empty string is a legal state for both modes — a dropdown on
 * "— เลือกตำแหน่ง —" and a text box the user has just cleared look identical
 * in the draft — so the choice has to be held rather than guessed.
 */
export type JobTitleMode = "preset" | "custom";

/**
 * The mode a stored value opens in.
 *
 * A title the system knows opens on the dropdown showing it; anything else —
 * including the free text the extraction pass writes out of LINE chat — opens
 * on the text box holding it, so an edit starts from what is there rather than
 * from a blank the user has to retype. A row with no title at all opens on the
 * dropdown, because picking one of three is less work than typing.
 */
export function jobTitleModeFor(
  value: string | null | undefined,
): JobTitleMode {
  const title = (value ?? "").trim();
  if (title === "") return "preset";
  return isJobTitlePreset(title) ? "preset" : "custom";
}

const MODE_OPTIONS: { value: JobTitleMode; label: string }[] = [
  { value: "preset", label: "เลือกจากระบบ" },
  { value: "custom", label: "กรอกเอง" },
];

/**
 * `employees.job_title` — one of three known titles, or anything at all.
 *
 * The column is free text, and it has to stay that way: the extraction pass
 * writes whatever the chat said. But three titles come up often enough that
 * retyping them is the wrong default, so the field offers both and remembers
 * which one it is on.
 *
 * Neither direction loses what you had. Switching to กรอกเอง starts from the
 * preset that was picked, so refining "Senior" into "Senior Engineer" is one
 * switch and a few keystrokes; switching to เลือกจากระบบ has to clear the box
 * (the dropdown has no option to show a hand-typed title on) but remembers
 * the text, so switching back brings it straight back — see `customDraft`.
 *
 * Two shapes, because the field has to fit two different grids without
 * leaving a hole in either — see `layout`.
 */
export function JobTitleField({
  value,
  mode,
  layout,
  onValueChange,
  onModeChange,
}: {
  value: string;
  mode: JobTitleMode;
  /**
   * `row` takes a full-width row and sits the mode switch beside the input, on
   * one line. For the review form, whose other six fields then fill three
   * clean two-column rows above it.
   *
   * `cell` folds into a single grid cell, switch on the label row, so the
   * field counts as one of the eight the add/edit form lays out four rows
   * deep. Nothing is lost between them but the horizontal room.
   */
  layout: "row" | "cell";
  onValueChange: (value: string) => void;
  onModeChange: (mode: JobTitleMode) => void;
}) {
  /**
   * The last thing typed in กรอกเอง, kept so a trip through the dropdown does
   * not destroy it.
   *
   * The dropdown cannot display a hand-typed title — it has no option for it —
   * so switching to เลือกจากระบบ has to clear the value, or a title nobody can
   * see would be saved. Remembering it here is what makes that clearing
   * reversible: switch back and the text is there to carry on editing.
   */
  const [customDraft, setCustomDraft] = useState(() =>
    isJobTitlePreset(value.trim()) ? "" : value,
  );

  function handleValue(next: string) {
    if (mode === "custom") setCustomDraft(next);
    onValueChange(next);
  }

  function switchTo(next: JobTitleMode) {
    if (next === mode) return;

    if (next === "preset") {
      if (!isJobTitlePreset(value.trim())) setCustomDraft(value);
      onValueChange("");
    } else {
      // A preset that was actually picked wins — it is the more recent choice,
      // and refining "Senior" into "Senior Engineer" is a normal reason to
      // switch. Otherwise the remembered text comes back.
      const picked = value.trim();
      onValueChange(isJobTitlePreset(picked) ? picked : customDraft);
    }

    onModeChange(next);
  }

  // The dropdown only ever shows a value it has an option for; anything else
  // is what the text box is holding, and reads as "nothing picked" here.
  const control =
    mode === "preset" ? (
      <SelectField
        aria-label={EMPLOYEE_FIELD_LABELS.jobTitle}
        options={JOB_TITLE_OPTIONS}
        value={isJobTitlePreset(value.trim()) ? value.trim() : ""}
        onChange={(event) => handleValue(event.target.value)}
      />
    ) : (
      <TextField
        aria-label={EMPLOYEE_FIELD_LABELS.jobTitle}
        placeholder="เช่น Software Engineer"
        value={value}
        onChange={(event) => handleValue(event.target.value)}
      />
    );

  if (layout === "cell") {
    return (
      <div>
        {/* The switch rides the label's own line, at the label's own type
            size. A boxed control here would make this header ~15px taller
            than the plain label in the cell beside it, and since grid cells
            top-align their content, this field's input would then sit that
            far below its neighbour's — the row would read as broken. */}
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <span className="truncate font-mono text-[10px] tracking-[0.14em] text-text-3 uppercase">
            {EMPLOYEE_FIELD_LABELS.jobTitle}
          </span>
          <span className="flex shrink-0 items-center gap-1">
            {MODE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={option.value === mode}
                onClick={() => switchTo(option.value)}
                className={cn(
                  "rounded px-1.5 font-mono text-[10px] tracking-[0.08em] whitespace-nowrap uppercase transition",
                  option.value === mode
                    ? "bg-accent-soft text-accent"
                    : "text-text-4 hover:text-text-2",
                )}
              >
                {option.label}
              </button>
            ))}
          </span>
        </div>
        {control}
      </div>
    );
  }

  return (
    <div className="sm:col-span-2">
      <FieldLabel>{EMPLOYEE_FIELD_LABELS.jobTitle}</FieldLabel>
      {/* The switch belongs to the input, so it sits on the input's line
          rather than above it — and on a full-width row there is room for the
          full control. */}
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="min-w-0 flex-1">{control}</div>
        <SegmentedControl
          value={mode}
          onChange={switchTo}
          options={MODE_OPTIONS}
          size="sm"
        />
      </div>
    </div>
  );
}
