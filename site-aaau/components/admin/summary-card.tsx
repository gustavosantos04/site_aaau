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
    <article className="rounded-[1.8rem] border border-white/10 bg-white/[0.03] p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/[0.45]">
        {label}
      </p>
      <p className="mt-4 font-display text-4xl uppercase tracking-[0.08em] text-white">
        {value}
      </p>
      <p className="mt-2 text-sm leading-6 text-white/60">{helper}</p>
    </article>
  );
}
