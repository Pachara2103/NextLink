"use client";

import type { ComponentProps, ReactNode } from "react";

import { Icon } from "@/components/icons";
import { cn } from "@/lib/utils";

const CONTROL_BASE =
  "w-full rounded-xl border bg-sunken text-sm text-text transition focus:outline-none";
const CONTROL_IDLE =
  "border-line hover:border-text-4 focus:border-accent focus:ring-2 focus:ring-accent/20";
const CONTROL_ERROR = "border-danger-line bg-danger-soft";

export function FieldLabel({
  children,
  required = false,
  tone = "default",
}: {
  children: ReactNode;
  required?: boolean;
  tone?: "default" | "error";
}) {
  return (
    <span
      className={cn(
        "mb-1.5 block font-mono text-[10px] uppercase tracking-[0.14em]",
        tone === "error" ? "text-danger" : "text-text-3",
      )}
    >
      {children}
      {required && <span className="ml-1 text-accent">*</span>}
    </span>
  );
}

export function TextField({
  label,
  required,
  error,
  invalid = false,
  hint,
  mono = false,
  className,
  ...rest
}: ComponentProps<"input"> & {
  label: string;
  required?: boolean;
  /** Shows the error ring plus this message underneath the control. */
  error?: string;
  /** Shows the error ring only, for when one message covers several fields. */
  invalid?: boolean;
  hint?: string;
  /** Digits and addresses read better in the mono face. */
  mono?: boolean;
}) {
  const bad = invalid || Boolean(error);
  return (
    <label className="block">
      <FieldLabel required={required} tone={bad ? "error" : "default"}>
        {label}
      </FieldLabel>
      <input
        type="text"
        aria-invalid={bad ? true : undefined}
        className={cn(
          CONTROL_BASE,
          bad ? CONTROL_ERROR : CONTROL_IDLE,
          "px-3.5 py-2.5",
          mono && "font-mono tabular-nums",
          rest.disabled &&
            "cursor-not-allowed border-line-soft bg-surface text-text-4",
          className,
        )}
        {...rest}
      />
      {error ? (
        <span className="mt-1.5 flex items-center gap-1.5 text-[12px] text-danger">
          <Icon name="alert" className="size-3.5" />
          {error}
        </span>
      ) : (
        hint && <span className="mt-1.5 block text-[12px] text-text-3">{hint}</span>
      )}
    </label>
  );
}

export function SelectField({
  label,
  options,
  className,
  ...rest
}: ComponentProps<"select"> & {
  label?: string;
  options: readonly string[] | { value: string; label: string }[];
}) {
  const normalised = options.map((option) =>
    typeof option === "string" ? { value: option, label: option } : option,
  );

  const control = (
    <div className="relative">
      <select
        className={cn(
          CONTROL_BASE,
          CONTROL_IDLE,
          "appearance-none py-2.5 pr-10 pl-3.5",
          className,
        )}
        {...rest}
      >
        {normalised.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <Icon
        name="chevron-down"
        className="pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-text-3"
      />
    </div>
  );

  if (!label) return control;
  return (
    <label className="block">
      <FieldLabel>{label}</FieldLabel>
      {control}
    </label>
  );
}

/** Compact select used in section headers, where the label is visually hidden. */
export function SortSelect({
  label,
  options,
  ...rest
}: ComponentProps<"select"> & {
  label: string;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="relative">
      <select
        aria-label={label}
        className="appearance-none rounded-xl border border-line bg-sunken py-2 pr-9 pl-3.5 text-[13px] text-text transition hover:border-text-4 focus:border-accent focus:outline-none"
        {...rest}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <Icon
        name="chevron-down"
        className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-text-3"
      />
    </div>
  );
}

export function SearchInput({
  value,
  onValueChange,
  onClear,
  placeholder,
  size = "md",
  className,
}: {
  value: string;
  onValueChange: (value: string) => void;
  onClear?: () => void;
  placeholder?: string;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <div className={cn("relative", className)}>
      <Icon
        name="search"
        className={cn(
          "pointer-events-none absolute top-1/2 -translate-y-1/2 text-text-3",
          size === "md" ? "left-4 size-[18px]" : "left-3.5 size-4",
        )}
      />
      <input
        type="search"
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        placeholder={placeholder}
        className={cn(
          CONTROL_BASE,
          CONTROL_IDLE,
          "[&::-webkit-search-cancel-button]:hidden",
          size === "md" ? "py-3 pr-11 pl-11" : "py-2.5 pr-10 pl-10",
        )}
      />
      {value !== "" && onClear && (
        <button
          type="button"
          aria-label="ล้างคำค้น"
          onClick={onClear}
          className="absolute top-1/2 right-3 grid size-7 -translate-y-1/2 place-items-center rounded-lg text-text-3 transition hover:bg-surface-2 hover:text-text"
        >
          <Icon name="x" className="size-4" />
        </button>
      )}
    </div>
  );
}
