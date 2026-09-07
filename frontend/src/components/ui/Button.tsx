import type { ComponentProps } from "react";

import { Icon, type IconName } from "@/components/icons";
import { cn } from "@/lib/utils";

export type ButtonVariant =
  | "primary"
  | "warn"
  | "secondary"
  | "ghost"
  | "danger";

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-accent text-accent-ink font-semibold shadow-lift hover:bg-accent-hover active:bg-accent",
  warn: "bg-warn text-warn-ink font-semibold shadow-lift hover:bg-warn-hover",
  secondary:
    "border border-line bg-surface-2 text-text-2 font-medium hover:border-text-4 hover:bg-surface",
  ghost: "text-text-2 font-medium hover:bg-surface-2 hover:text-text",
  danger:
    "border border-danger-line bg-danger-soft text-danger font-medium hover:bg-danger-strong",
};

const SIZES = {
  sm: "px-3.5 py-2 text-[13px]",
  md: "px-4 py-2.5 text-[13px]",
} as const;

interface ButtonProps extends Omit<ComponentProps<"button">, "children"> {
  variant?: ButtonVariant;
  size?: keyof typeof SIZES;
  icon?: IconName;
  iconRight?: IconName;
  loading?: boolean;
  fullWidth?: boolean;
  children?: React.ReactNode;
}

export function Button({
  variant = "secondary",
  size = "md",
  icon,
  iconRight,
  loading = false,
  fullWidth = false,
  disabled,
  className,
  children,
  ...rest
}: ButtonProps) {
  const isDisabled = disabled || loading;
  return (
    <button
      type="button"
      disabled={isDisabled}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl transition",
        SIZES[size],
        VARIANTS[variant],
        fullWidth && "w-full",
        isDisabled &&
          "cursor-not-allowed border-line-soft bg-surface-2 text-text-4 shadow-none hover:bg-surface-2",
        className,
      )}
      {...rest}
    >
      {loading ? (
        <Icon name="loader" className="size-4 animate-spin" />
      ) : (
        icon && <Icon name={icon} className="size-4" />
      )}
      {children}
      {iconRight && <Icon name={iconRight} className="size-4" />}
    </button>
  );
}

/** Square button that holds nothing but an icon. */
export function IconButton({
  icon,
  label,
  className,
  disabled,
  ...rest
}: Omit<ComponentProps<"button">, "children"> & {
  icon: IconName;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      className={cn(
        "grid size-9 place-items-center rounded-xl border transition",
        disabled
          ? "cursor-not-allowed border-line-soft bg-surface-2 text-text-4"
          : "border-line bg-surface-2 text-text-2 hover:border-text-4 hover:bg-surface",
        className,
      )}
      {...rest}
    >
      <Icon name={icon} className="size-4" />
    </button>
  );
}

/** Borderless close affordance used in the corner of inline forms. */
export function CloseButton({
  className,
  ...rest
}: Omit<ComponentProps<"button">, "children">) {
  return (
    <button
      type="button"
      aria-label="ปิด"
      className={cn(
        "grid size-8 place-items-center rounded-lg text-text-3 transition hover:bg-surface-2 hover:text-text",
        className,
      )}
      {...rest}
    >
      <Icon name="x" className="size-4" />
    </button>
  );
}
