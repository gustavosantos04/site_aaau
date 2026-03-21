import Image from "next/image";

import officialLogo from "@/public/images/brand/Logo AAAU PNG.png";
import { cn } from "@/lib/utils";

export function BrandLogo({
  className,
  priority = false,
}: {
  className?: string;
  priority?: boolean;
}) {
  return (
    <div
      className={cn(
        "relative shrink-0 overflow-hidden rounded-full border border-white/[0.12] bg-white/[0.06] shadow-[0_10px_30px_rgba(0,0,0,0.28)]",
        className,
      )}
    >
      <Image
        src={officialLogo}
        alt="Logo oficial da AAAU"
        fill
        priority={priority}
        sizes="(max-width: 768px) 48px, 56px"
        className="object-contain p-1.5"
      />
    </div>
  );
}
