"use client";

import Link from "next/link";
import { useRef, useLayoutEffect } from "react";
import { ProductCard } from "@/components/store/product-card";
import { Reveal } from "@/components/shared/reveal";
import { SectionHeading } from "@/components/shared/section-heading";
import { buttonVariants } from "@/components/shared/button";
import type { Product } from "@/types/store";
import { getGsap } from "@/lib/animations/gsap";

export function FeaturedProductsSection({ products }: { products: Product[] }) {
  const sectionRef = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const { gsap, ScrollTrigger } = getGsap();
    
    if (!sectionRef.current) return;

    const ctx = gsap.context(() => {
      // Reveal animation when entering the section
      gsap.fromTo(
        sectionRef.current,
        { opacity: 0, y: 100 },
        {
          opacity: 1,
          y: 0,
          duration: 1.2,
          ease: "power3.out",
          scrollTrigger: {
            trigger: sectionRef.current,
            start: "top 80%",
            toggleActions: "play none none none",
          },
        }
      );
    });

    return () => ctx.revert();
  }, []);

  return (
    <section 
      id="produtos" 
      ref={sectionRef}
      className="relative z-20 mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24"
    >
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <Reveal>
          <SectionHeading
            eyebrow="Produtos em destaque"
            title="Drops pensados para vender."
            description="A primeira coleção já nasce com linguagem premium, foco em conversão e espaço claro para futuras ativações sazonais."
          />
        </Reveal>
        <Reveal>
          <Link
            href="/produtos"
            className={buttonVariants({ variant: "secondary", size: "lg" })}
          >
            Ver catálogo completo
          </Link>
        </Reveal>
      </div>

      <div className="mt-10 grid gap-6 lg:grid-cols-3">
        {products.map((product, index) => (
          <Reveal key={product.id} delay={index * 0.06}>
            <ProductCard product={product} />
          </Reveal>
        ))}
      </div>
    </section>
  );
}
