import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function Badge({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full border border-white/[0.15] bg-white/[0.06] px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-white/70",
        className,
      )}
    >
      {children}
    </span>
  );
}
