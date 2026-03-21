"use client";

import Image from "next/image";
import { useState } from "react";

import { cn } from "@/lib/utils";
import type { ProductImage } from "@/types/store";

export function ProductGallery({ images }: { images: ProductImage[] }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const activeImage = images[activeIndex] ?? images[0];

  if (!activeImage) {
    return null;
  }

  return (
    <div className="space-y-4">
      <div className="relative aspect-[4/4.5] overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top,rgba(166,23,48,0.34),transparent_40%),linear-gradient(180deg,#161616,#090909)]">
        <Image
          src={activeImage.url}
          alt={activeImage.alt}
          fill
          sizes="(max-width: 1024px) 100vw, 50vw"
          className="object-cover"
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        {images.map((image, index) => (
          <button
            key={image.id}
            type="button"
            onClick={() => setActiveIndex(index)}
            className={cn(
              "relative aspect-[4/3.3] overflow-hidden rounded-[1.4rem] border bg-white/[0.02]",
              index === activeIndex ? "border-aaau-ember" : "border-white/10",
            )}
          >
            <Image
              src={image.url}
              alt={image.alt}
              fill
              sizes="(max-width: 1024px) 50vw, 20vw"
              className="object-cover"
            />
          </button>
        ))}
      </div>
    </div>
  );
}
