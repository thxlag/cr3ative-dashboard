import type { PropsWithChildren, ReactNode } from "react";
import clsx from "classnames";

export type CardProps = PropsWithChildren<{
  title?: ReactNode;
  subtitle?: ReactNode;
  className?: string;
  actions?: ReactNode;
}>;

export function Card({ title, subtitle, actions, className, children }: CardProps) {
  return (
    <section
      className={clsx(
        "rounded-2xl border border-slate-800/60 bg-surface-800/80 p-5 shadow-panel backdrop-blur",
        className
      )}
    >
      {(title || actions) && (
        <header className="mb-4 flex items-center justify-between gap-3">
          <div>
            {title && <h3 className="text-base font-semibold text-slate-100">{title}</h3>}
            {subtitle && <p className="text-xs text-slate-400">{subtitle}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}
