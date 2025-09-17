import type { ButtonHTMLAttributes } from "react";
import clsx from "classnames";

const baseClasses = "inline-flex items-center justify-center font-medium transition duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2";

const variantClasses: Record<ButtonVariant, string> = {
  primary: "rounded-full bg-accent-strong px-4 py-2 text-white shadow-panel hover:bg-accent focus-visible:outline-accent",
  secondary: "rounded-full border border-slate-700/80 bg-surface-700/60 px-4 py-2 text-slate-100 hover:border-accent/40 hover:text-accent focus-visible:outline-accent",
  ghost: "rounded-full px-3 py-2 text-slate-300 hover:text-accent hover:bg-slate-800/60 focus-visible:outline-accent",
  danger: "rounded-full bg-danger/90 px-4 py-2 text-white hover:bg-danger focus-visible:outline-danger",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "text-xs px-3 py-1.5",
  md: "text-sm",
  lg: "text-base px-5 py-2.5",
};

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
};

export function Button({
  className,
  variant = "primary",
  size = "md",
  loading = false,
  disabled,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={clsx(
        baseClasses,
        variantClasses[variant],
        sizeClasses[size],
        (disabled || loading) && "opacity-60 cursor-not-allowed",
        className
      )}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && <span className="mr-2 h-3 w-3 animate-spin rounded-full border-2 border-white/50 border-t-white" />}
      {children}
    </button>
  );
}
