import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("h-10 w-10", className)}
      aria-hidden="true"
    >
      <path
        d="M60 8L95 20V50C95 78 79 100 60 112C41 100 25 78 25 50V20L60 8Z"
        fill="url(#shield)"
      />
      <path
        d="M39 43C39 33 46 28 54 28H66C74 28 81 33 81 43V50C81 61 73 70 63 70H57C47 70 39 61 39 50V43Z"
        fill="#F7F2EA"
      />
      <path d="M45 36L53 42L42 48L45 36Z" fill="#090909" />
      <path d="M75 36L67 42L78 48L75 36Z" fill="#090909" />
      <path d="M50 52C53 49 67 49 70 52L65 61H55L50 52Z" fill="#090909" />
      <path
        d="M46 68C52 76 68 76 74 68"
        stroke="#F7F2EA"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <defs>
        <linearGradient
          id="shield"
          x1="60"
          y1="8"
          x2="60"
          y2="112"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#A71D3A" />
          <stop offset="1" stopColor="#6F1023" />
        </linearGradient>
      </defs>
    </svg>
  );
}
