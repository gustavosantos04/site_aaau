import { forwardRef, type ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

type ButtonVariant = "primary" | "secondary" | "ghost" | "light";
type ButtonSize = "sm" | "md" | "lg";

export function buttonVariants({
  variant = "primary",
  size = "md",
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}) {
  return cn(
    "inline-flex items-center justify-center rounded-full border text-sm font-semibold tracking-[0.18em] uppercase transition duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70",
    variant === "primary" &&
      "border-aaau-ember bg-aaau-ember px-6 text-white shadow-glow hover:bg-[#a01d39]",
    variant === "secondary" &&
      "border-white/20 bg-white/[0.08] px-6 text-white hover:border-white/40 hover:bg-white/[0.12]",
    variant === "ghost" &&
      "border-transparent bg-transparent px-0 text-white/75 hover:text-white",
    variant === "light" &&
      "border-white bg-white px-6 text-aaau-night hover:bg-aaau-sand",
    size === "sm" && "h-10 px-4 text-xs",
    size === "md" && "h-12 px-6",
    size === "lg" && "h-14 px-7 text-[0.76rem]",
    className,
  );
}

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: ButtonVariant;
    size?: ButtonSize;
  }
>(function Button(
  { className, variant = "primary", size = "md", type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={buttonVariants({ variant, size, className })}
      {...props}
    />
  );
});
