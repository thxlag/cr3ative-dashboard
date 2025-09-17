import type { PropsWithChildren } from "react";
import clsx from "classnames";

const toneClasses = {
  info: "bg-accent-soft text-accent",
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  danger: "bg-danger/10 text-danger",
  neutral: "bg-slate-800/70 text-slate-300",
};

export type BadgeTone = keyof typeof toneClasses;

export function Badge({ children, tone = "neutral", className }: PropsWithChildren<{ tone?: BadgeTone; className?: string }>) {
  return (
    <span className={clsx("inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold", toneClasses[tone], className)}>
      {children}
    </span>
  );
}
