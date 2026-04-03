import Image from "next/image";

import officialLogo from "@/public/images/brand/Logo AAAU PNG.png";
import { cn } from "@/lib/utils";

export function BrandLogo({
  className,
  priority = false,
  imageClassName,
  sizes = "(max-width: 768px) 48px, 56px",
  quality = 100,
}: {
  className?: string;
  priority?: boolean;
  imageClassName?: string;
  sizes?: string;
  quality?: number;
}) {
  return (
    <div className={cn("relative isolate shrink-0 overflow-visible", className)}>
      <div className="absolute inset-[12%] rounded-full bg-aaau-ember/18 blur-xl" />
      <Image
        src={officialLogo}
        alt="Logo oficial da AAAU"
        fill
        priority={priority}
        sizes={sizes}
        quality={quality}
        className={cn(
          "relative object-contain [mix-blend-mode:screen] drop-shadow-[0_12px_30px_rgba(0,0,0,0.36)]",
          imageClassName,
        )}
      />
    </div>
  );
}
