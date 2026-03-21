import { Badge } from "@/components/shared/badge";
import { cn } from "@/lib/utils";

export function SectionHeading({
  eyebrow,
  title,
  description,
  className,
}: {
  eyebrow: string;
  title: string;
  description: string;
  className?: string;
}) {
  return (
    <div className={cn("max-w-2xl space-y-4", className)}>
      <Badge>{eyebrow}</Badge>
      <div className="space-y-3">
        <h2 className="font-display text-3xl uppercase tracking-[0.08em] text-white sm:text-4xl md:text-5xl">
          {title}
        </h2>
        <p className="text-sm leading-7 text-white/[0.72] sm:text-base md:text-lg">{description}</p>
      </div>
    </div>
  );
}
