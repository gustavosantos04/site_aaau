"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

export type CountdownParts = { days: number; hours: number; minutes: number; seconds: number };

export function countdownParts(remainingMs: number): CountdownParts {
  const totalSeconds = Math.max(0, Math.floor(remainingMs / 1000));
  return {
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
  };
}

export function compactCountdownLabel(remainingMs: number) {
  const parts = countdownParts(remainingMs);
  if (parts.days > 0) return `Abre em ${parts.days}d ${parts.hours}h`;
  if (parts.hours > 0) return `Abre em ${parts.hours}h ${parts.minutes}min`;
  if (parts.minutes > 0) return `Abre em ${parts.minutes}min`;
  return "Abre em menos de 1min";
}

export function EventSaleCountdown({
  salesStartAt,
  serverNow,
  onElapsed,
}: {
  salesStartAt: string;
  serverNow: string;
  onElapsed?: () => void | Promise<void>;
}) {
  const offset = useMemo(() => new Date(serverNow).getTime() - Date.now(), [serverNow]);
  const target = useMemo(() => new Date(salesStartAt).getTime(), [salesStartAt]);
  const [remaining, setRemaining] = useState(() => Math.max(0, target - (Date.now() + offset)));

  useEffect(() => {
    let elapsed = false;
    const update = () => {
      const next = Math.max(0, target - (Date.now() + offset));
      setRemaining(next);
      if (next === 0 && !elapsed) {
        elapsed = true;
        void onElapsed?.();
      }
    };
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [offset, onElapsed, target]);

  const parts = countdownParts(remaining);
  return (
    <div className="grid grid-cols-4 gap-2" aria-label="Contagem regressiva para abertura das vendas">
      {([
        ["Dias", parts.days],
        ["Horas", parts.hours],
        ["Min", parts.minutes],
        ["Seg", parts.seconds],
      ] as const).map(([label, value]) => (
        <div key={label} className="min-w-0 rounded-[0.5rem] border border-white/10 bg-black/30 px-2 py-3 text-center">
          <strong className="block font-display text-2xl text-aaau-sand sm:text-3xl">{String(value).padStart(2, "0")}</strong>
          <span className="mt-1 block text-[0.6rem] font-semibold uppercase text-white/55 sm:text-[0.68rem]">{label}</span>
        </div>
      ))}
      <span className="sr-only" aria-live="polite">{parts.days} dias e {parts.hours} horas restantes</span>
    </div>
  );
}

export function EventSaleCountdownRefresh(props: Omit<Parameters<typeof EventSaleCountdown>[0], "onElapsed">) {
  const router = useRouter();
  return <EventSaleCountdown {...props} onElapsed={() => router.refresh()} />;
}

export function EventLotOpeningCountdown({
  salesStartAt,
  serverNow,
}: {
  salesStartAt: string;
  serverNow: string;
}) {
  const router = useRouter();
  const offset = useMemo(() => new Date(serverNow).getTime() - Date.now(), [serverNow]);
  const target = useMemo(() => new Date(salesStartAt).getTime(), [salesStartAt]);
  const [remaining, setRemaining] = useState(() => Math.max(0, target - (Date.now() + offset)));

  useEffect(() => {
    let refreshed = false;
    const update = () => {
      const next = Math.max(0, target - (Date.now() + offset));
      setRemaining(next);
      if (next === 0 && !refreshed) {
        refreshed = true;
        router.refresh();
      }
    };
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [offset, router, target]);

  return <span aria-live="polite">{compactCountdownLabel(remaining)}</span>;
}
