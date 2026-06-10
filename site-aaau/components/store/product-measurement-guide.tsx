import type { ProductMeasurementGuide } from "@/types/store";

export function ProductMeasurementGuideView({
  guide,
}: {
  guide?: ProductMeasurementGuide;
}) {
  if (!guide) {
    return null;
  }

  return (
    <section className="mt-8 rounded-[2rem] border border-white/10 bg-white/[0.03] p-5 sm:p-6 lg:mt-10">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-2xl space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/[0.45]">
            Medidas
          </p>
          <h2 className="font-display text-3xl uppercase tracking-[0.08em] text-white sm:text-4xl">
            {guide.title}
          </h2>
          <p className="text-sm leading-7 text-white/[0.62]">{guide.note}</p>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 lg:min-w-[22rem] lg:grid-cols-1">
          {guide.metrics.map((metric) => (
            <div
              key={metric.label}
              className="grid grid-cols-[3rem,1fr] items-center gap-3 rounded-[1rem] border border-white/10 bg-black/20 px-3 py-2"
            >
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-aaau-ember text-xs font-semibold uppercase text-white">
                {metric.label}
              </span>
              <span className="text-xs leading-5 text-white/[0.62]">
                {metric.description}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        {guide.tables.map((table) => (
          <article
            key={table.id}
            className="overflow-hidden rounded-[1.5rem] border border-white/10 bg-black/20"
          >
            <div className="border-b border-white/10 px-4 py-3">
              <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-white">
                {table.title}
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-xs uppercase tracking-[0.16em] text-white/[0.45]">
                    <th className="sticky left-0 bg-[#111] px-4 py-3 font-semibold">
                      Medida
                    </th>
                    {table.columns.map((column) => (
                      <th key={column} className="px-4 py-3 text-center font-semibold">
                        {column}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {table.rows.map((row) => (
                    <tr key={row.label} className="border-b border-white/5 last:border-0">
                      <th className="sticky left-0 bg-[#111] px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-white/70">
                        {row.label}
                      </th>
                      {row.values.map((value, index) => (
                        <td
                          key={`${row.label}-${table.columns[index] ?? index}`}
                          className="px-4 py-3 text-center text-white/[0.72]"
                        >
                          {value}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
