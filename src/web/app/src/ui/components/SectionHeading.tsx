import type { PropsWithChildren, ReactNode } from "react";
import clsx from "classnames";

export type SectionHeadingProps = PropsWithChildren<{
  eyebrow?: string;
  actions?: ReactNode;
  className?: string;
}>;

export function SectionHeading({ children, eyebrow, actions, className }: SectionHeadingProps) {
  return (
    <div className={clsx("mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div>
        {eyebrow && <p className="text-xs uppercase tracking-wide text-slate-500">{eyebrow}</p>}
        <h2 className="text-xl font-semibold text-slate-100">{children}</h2>
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
