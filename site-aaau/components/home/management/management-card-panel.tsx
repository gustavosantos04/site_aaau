"use client";

import Image from "next/image";

import type { ManagementArea, ManagementMember } from "@/lib/data/management";
import { cn } from "@/lib/utils";

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function ManagementMemberAvatar({ member }: { member: ManagementMember }) {
  if (member.image) {
    return (
      <div className="relative h-12 w-12 overflow-hidden rounded-[1rem] border border-white/10 bg-white/5">
        <Image
          src={member.image}
          alt={member.name}
          fill
          className="object-cover"
          sizes="48px"
        />
      </div>
    );
  }

  return (
    <div className="flex h-12 w-12 items-center justify-center rounded-[1rem] border border-white/10 bg-white/[0.08] font-display text-sm uppercase tracking-[0.2em] text-white/88">
      {getInitials(member.name)}
    </div>
  );
}

export function ManagementCardPanel({
  area,
  onClose,
  compact = false,
  className,
}: {
  area: ManagementArea;
  onClose?: () => void;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative h-full overflow-hidden rounded-[inherit] border border-white/10 bg-[linear-gradient(145deg,rgba(255,255,255,0.08),rgba(255,255,255,0.02))] p-5 sm:p-6",
        compact ? "p-4" : "p-5 sm:p-6 md:p-7",
        className,
      )}
    >
      <div className="absolute inset-0 rounded-[inherit] bg-[radial-gradient(circle_at_top_right,var(--card-glow),transparent_38%),linear-gradient(160deg,rgba(255,255,255,0.08),transparent_26%),linear-gradient(180deg,rgba(5,5,7,0.88),rgba(10,10,12,0.94))]" />
      <div className="deck-grid absolute inset-[1px] rounded-[inherit] opacity-30" />
      <div className="deck-noise absolute inset-0 rounded-[inherit] opacity-35" />

      <div className="relative flex h-full flex-col">
        <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4">
          <div className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.34em] text-white/50">
              Carta institucional {area.symbol}
            </p>
            <div>
              <h3 className="font-display text-3xl uppercase tracking-[0.08em] text-white sm:text-[2.2rem]">
                {area.title}
              </h3>
              <p className="mt-2 max-w-2xl text-sm leading-7 text-white/68 sm:text-base">
                {area.description}
              </p>
            </div>
          </div>

          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-full border border-white/12 bg-white/[0.06] px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.28em] text-white/72 transition hover:border-white/25 hover:bg-white/[0.1] hover:text-white"
            >
              Fechar
            </button>
          ) : null}
        </div>

        <div className={cn("mt-5 grid flex-1 gap-4", compact ? "grid-cols-1" : "lg:grid-cols-[0.78fr_1.22fr]")}>
          <div className="flex h-full flex-col justify-between rounded-[1.7rem] border border-white/10 bg-black/30 p-4 sm:p-5">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.32em] text-white/48">
                Direcao
              </p>
              <p className="mt-3 max-w-[20rem] font-display text-2xl uppercase leading-none tracking-[0.06em] text-white">
                {area.accent}
              </p>
            </div>

            <div className="mt-5 space-y-4">
              <p className="text-sm leading-7 text-white/66">{area.motto}</p>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-[1.2rem] border border-white/10 bg-white/[0.04] px-4 py-3">
                  <p className="text-[10px] uppercase tracking-[0.28em] text-white/44">Integrantes</p>
                  <p className="mt-2 font-display text-2xl uppercase text-white">
                    {String(area.members.length).padStart(2, "0")}
                  </p>
                </div>

                <div className="rounded-[1.2rem] border border-white/10 bg-white/[0.04] px-4 py-3">
                  <p className="text-[10px] uppercase tracking-[0.28em] text-white/44">Area</p>
                  <p className="mt-2 font-display text-2xl uppercase text-white">{area.symbol}</p>
                </div>
              </div>
            </div>
          </div>

          <div className={cn("grid gap-3", compact ? "sm:grid-cols-2" : "sm:grid-cols-2 xl:grid-cols-2")}>
            {area.members.map((member) => (
              <article
                key={`${area.id}-${member.name}`}
                className="group relative overflow-hidden rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-4 transition duration-500 hover:border-white/20 hover:bg-white/[0.06]"
              >
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,var(--card-glow),transparent_36%)] opacity-60" />

                <div className="relative flex items-center gap-4">
                  <ManagementMemberAvatar member={member} />

                  <div className="min-w-0">
                    <p className="truncate font-semibold text-white">{member.name}</p>
                    <p className="mt-1 text-sm text-white/62">{member.role ?? "Integrante"}</p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
