import type { ReactNode } from "react";
import clsx from "classnames";

export type StatTileProps = {
  label: ReactNode;
  value: ReactNode;
  delta?: ReactNode;
  variant?: "default" | "success" | "warning" | "danger";
  className?: string;
};

const variantBorder = {
  default: "border-slate-700/70",
  success: "border-success/40",
  warning: "border-warning/40",
  danger: "border-danger/40",
};

export function StatTile({ label, value, delta, variant = "default", className }: StatTileProps) {
  return (
    <div
      className={clsx(
        "rounded-2xl border bg-surface-800/80 p-4 shadow-panel backdrop-blur",
        variantBorder[variant],
        className
      )}
    >
      <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-slate-100">{value}</p>
      {delta && <p className="mt-1 text-xs text-slate-500">{delta}</p>}
    </div>
  );
}
