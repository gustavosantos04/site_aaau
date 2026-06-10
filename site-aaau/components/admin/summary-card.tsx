export function SummaryCard({
  label,
  value,
  helper,
}: {
  label: string;
  value: string | number;
  helper: string;
}) {
  return (
    <article className="rounded-[1.5rem] border border-white/10 bg-[#101010] p-5 shadow-[0_18px_70px_rgba(0,0,0,0.18)]">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/[0.45]">
        {label}
      </p>
      <p className="mt-4 font-display text-4xl uppercase tracking-[0.08em] text-aaau-sand">
        {value}
      </p>
      <p className="mt-2 text-sm leading-6 text-white/60">{helper}</p>
    </article>
  );
}
