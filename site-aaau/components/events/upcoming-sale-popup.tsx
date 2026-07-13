"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Route } from "next";
import Link from "next/link";
import { CalendarDays, MapPin, X } from "lucide-react";

import { EventSaleCountdown } from "@/components/events/event-sale-countdown";

type UpcomingSale = {
  active: true;
  eventName: string;
  eventSlug: string;
  salesStartAt: string;
  eventStartAt: string;
  venueName: string;
  coverImage: string | null;
  serverNow: string;
};

async function loadUpcomingSale() {
  const response = await fetch("/api/eventos/upcoming-sale", { cache: "no-store" });
  if (!response.ok) return null;
  const data = await response.json() as UpcomingSale | { active: false; serverNow: string };
  return data.active ? data : null;
}

export function UpcomingSalePopup() {
  const [event, setEvent] = useState<UpcomingSale | null>(null);
  const [open, setOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  const refresh = useCallback(async () => {
    const upcoming = await loadUpcomingSale();
    if (!upcoming) {
      setOpen(false);
      setEvent(null);
      return;
    }
    const key = `aaau-upcoming-sale:${upcoming.eventSlug}:${upcoming.salesStartAt}`;
    setEvent(upcoming);
    if (sessionStorage.getItem(key) !== "dismissed") setOpen(true);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const close = useCallback(() => {
    if (event) sessionStorage.setItem(`aaau-upcoming-sale:${event.eventSlug}:${event.salesStartAt}`, "dismissed");
    setOpen(false);
    previousFocus.current?.focus();
  }, [event]);

  useEffect(() => {
    if (!open) return;
    previousFocus.current = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKeyDown = (keyboardEvent: KeyboardEvent) => {
      if (keyboardEvent.key === "Escape") close();
      if (keyboardEvent.key === "Tab") {
        const dialog = closeRef.current?.closest("[role=dialog]");
        const focusable = dialog?.querySelectorAll<HTMLElement>('button, a[href]');
        if (!focusable?.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (keyboardEvent.shiftKey && document.activeElement === first) { keyboardEvent.preventDefault(); last.focus(); }
        else if (!keyboardEvent.shiftKey && document.activeElement === last) { keyboardEvent.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [close, open]);

  if (!open || !event) return null;
  return (
    <div className="fixed inset-0 z-[180] flex items-end justify-center bg-black/75 p-3 backdrop-blur-sm sm:items-center sm:p-6" onMouseDown={(mouseEvent) => { if (mouseEvent.target === mouseEvent.currentTarget) close(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="upcoming-sale-title" className="relative max-h-[calc(100dvh-1.5rem)] w-full max-w-xl overflow-y-auto rounded-[0.5rem] border border-aaau-sand/25 bg-[#110b0d] shadow-2xl">
        <div className="space-y-5 p-5 sm:p-7">
          <button ref={closeRef} type="button" onClick={close} aria-label="Fechar aviso do evento" className="absolute right-3 top-3 grid h-11 w-11 place-items-center rounded-full border border-white/15 bg-black/65 text-white"><X className="h-5 w-5" /></button>
          <p className="text-xs font-bold uppercase text-aaau-sand">Evento oficial AAAU</p>
          <div>
            <h2 id="upcoming-sale-title" className="break-words font-display text-4xl uppercase text-white sm:text-5xl">{event.eventName}</h2>
            <div className="mt-3 flex flex-col gap-2 text-sm text-white/65 sm:flex-row sm:gap-5">
              <span className="flex items-center gap-2"><CalendarDays className="h-4 w-4" />{new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(event.eventStartAt))}</span>
              <span className="flex items-center gap-2"><MapPin className="h-4 w-4" />{event.venueName}</span>
            </div>
          </div>
          <div className="space-y-3"><p className="text-sm font-semibold text-white/75">As vendas começam em</p><EventSaleCountdown salesStartAt={event.salesStartAt} serverNow={event.serverNow} onElapsed={refresh} /></div>
          <Link href={`/eventos/${event.eventSlug}` as Route} onClick={close} className="flex min-h-12 w-full items-center justify-center rounded-[0.5rem] bg-aaau-ember px-5 py-3 text-sm font-bold uppercase text-white">Ver evento</Link>
        </div>
      </section>
    </div>
  );
}
