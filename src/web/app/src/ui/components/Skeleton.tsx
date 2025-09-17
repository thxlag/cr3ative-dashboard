import clsx from "classnames";

type SkeletonProps = {
  className?: string;
};

export function Skeleton({ className }: SkeletonProps) {
  return <div className={clsx("animate-pulse rounded-xl bg-slate-800/60", className)} />;
}
