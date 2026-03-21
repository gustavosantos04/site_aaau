import type { RefObject } from "react";

const particles = [
  { left: "12%", top: "68%", size: "8px", delay: "0s", duration: "8s" },
  { left: "20%", top: "34%", size: "10px", delay: "1.3s", duration: "10s" },
  { left: "28%", top: "58%", size: "6px", delay: "0.8s", duration: "7s" },
  { left: "44%", top: "22%", size: "9px", delay: "2.2s", duration: "9s" },
  { left: "54%", top: "70%", size: "12px", delay: "1.8s", duration: "11s" },
  { left: "66%", top: "30%", size: "7px", delay: "0.4s", duration: "8.5s" },
  { left: "74%", top: "62%", size: "11px", delay: "1.1s", duration: "9.5s" },
  { left: "84%", top: "44%", size: "7px", delay: "2.6s", duration: "8.7s" },
];

export function HeroAtmosphere({
  atmosphereRef,
}: {
  atmosphereRef: RefObject<HTMLDivElement | null>;
}) {
  return (
    <div
      ref={atmosphereRef}
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      <div className="absolute left-[-8%] top-[8%] h-[34rem] w-[34rem] rounded-full bg-aaau-ember/[0.28] blur-[140px] hero-glow-drift" />
      <div className="absolute right-[-10%] top-[18%] h-[26rem] w-[26rem] rounded-full bg-white/[0.08] blur-[140px] hero-glow-drift" />
      <div className="absolute left-[18%] top-[16%] h-28 w-px bg-gradient-to-b from-transparent via-white/[0.3] to-transparent" />
      <div className="absolute right-[16%] top-[24%] h-36 w-px bg-gradient-to-b from-transparent via-aaau-ember/[0.65] to-transparent" />
      <div className="absolute inset-x-[10%] bottom-[18%] h-px bg-gradient-to-r from-transparent via-white/[0.16] to-transparent" />

      {particles.map((particle, index) => (
        <span
          key={`${particle.left}-${particle.top}-${index}`}
          className="hero-particle absolute rounded-full bg-white/[0.4] blur-[1px]"
          style={{
            left: particle.left,
            top: particle.top,
            width: particle.size,
            height: particle.size,
            animationDelay: particle.delay,
            animationDuration: particle.duration,
          }}
        />
      ))}
    </div>
  );
}
