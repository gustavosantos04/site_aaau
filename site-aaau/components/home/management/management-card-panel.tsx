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
      <div className="relative h-14 w-14 overflow-hidden rounded-[1.2rem] border border-white/15 bg-white/5 shadow-lg">
        <Image
          src={member.image}
          alt={member.name}
          fill
          className="object-cover"
          sizes="56px"
        />
      </div>
    );
  }

  return (
    <div className="flex h-14 w-14 items-center justify-center rounded-[1.2rem] border border-white/15 bg-gradient-to-br from-white/12 to-white/6 font-display text-xs uppercase tracking-[0.2em] text-white/92 shadow-lg">
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
        compact ? "p-4" : "p-5 sm:p-6 md:p-8",
        className,
      )}
    >
      <div className="absolute inset-0 rounded-[inherit] bg-[radial-gradient(circle_at_top_right,var(--card-glow),transparent_38%),linear-gradient(160deg,rgba(255,255,255,0.08),transparent_26%),linear-gradient(180deg,rgba(5,5,7,0.88),rgba(10,10,12,0.94))]" />
      <div className="deck-grid absolute inset-[1px] rounded-[inherit] opacity-30" />
      <div className="deck-noise absolute inset-0 rounded-[inherit] opacity-35" />

      <div className="relative flex h-full flex-col">
        {/* Header com título e botão fechar */}
        <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-5 mb-6">
          <div className="space-y-1">
            <p className="text-[9px] font-semibold uppercase tracking-[0.36em] text-white/48">
              Gestão {area.symbol}
            </p>
            <h3 className="font-display text-3xl uppercase tracking-[0.08em] text-white sm:text-[2.5rem] leading-tight">
              {area.title}
            </h3>
          </div>

          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-full border border-white/12 bg-white/[0.06] px-4 py-2 text-[9px] font-semibold uppercase tracking-[0.28em] text-white/72 transition duration-300 hover:border-white/25 hover:bg-white/[0.12] hover:text-white"
            >
              Fechar
            </button>
          ) : null}
        </div>

        {/* Grid de membros - layout simplificado */}
        <div className={cn("flex-1 grid gap-3", compact ? "sm:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-3")}>
          {area.members.map((member, index) => (
            <article
              key={`${area.id}-${member.name}`}
              className="group relative overflow-hidden rounded-[1.5rem] border border-white/10 bg-gradient-to-br from-white/[0.08] to-white/[0.02] p-4 transition duration-500 hover:border-white/20 hover:bg-gradient-to-br hover:from-white/[0.12] hover:to-white/[0.04] hover:shadow-lg"
              style={{
                animationDelay: `${index * 0.08}s`,
              }}
            >
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,var(--card-glow),transparent_36%)] opacity-40 group-hover:opacity-60 transition duration-500" />

              <div className="relative flex flex-col items-start gap-3">
                <ManagementMemberAvatar member={member} />

                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-white text-base leading-tight">
                    {member.name}
                  </p>
                  <p className="mt-1 text-xs text-white/64 font-medium uppercase tracking-[0.1em]">
                    {member.role ?? "Integrante"}
                  </p>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
