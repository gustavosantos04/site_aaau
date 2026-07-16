export default function AdminEventLoading() {
  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-10 sm:px-6 lg:px-8" role="status" aria-label="Carregando seção do evento">
      <div className="h-10 w-64 animate-pulse rounded-[0.5rem] bg-white/10" />
      <div className="flex gap-2 overflow-hidden">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="h-10 w-28 shrink-0 animate-pulse rounded-full bg-white/[0.07]" />
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-28 animate-pulse rounded-[0.5rem] border border-white/10 bg-white/[0.04]" />
        ))}
      </div>
      <span className="sr-only">Carregando...</span>
    </div>
  );
}
