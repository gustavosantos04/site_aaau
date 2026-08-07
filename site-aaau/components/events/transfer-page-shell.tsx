import type { ReactNode } from "react";

export function TransferPageShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
      <section className="rounded-[0.5rem] border border-white/10 bg-white/[0.04] p-6 sm:p-8">
        <h1 className="font-display text-4xl uppercase tracking-[0.06em] text-white sm:text-5xl">{title}</h1>
        <div className="mt-5 space-y-4 text-sm leading-7 text-white/70">{children}</div>
      </section>
    </main>
  );
}
