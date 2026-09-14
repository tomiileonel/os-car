export default function AdminLoading() {
  return (
    <div
      role="status"
      aria-label="Cargando contenido..."
      className="min-h-screen bg-[#090d16] p-4 md:p-8 text-slate-100 animate-pulse space-y-6"
    >
      <span className="sr-only">Cargando contenido administrativo...</span>

      {/* Header skeleton */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between border-b border-slate-800 pb-4">
        <div className="space-y-2">
          <div className="h-7 w-48 bg-slate-800 rounded-md" />
          <div className="h-4 w-72 bg-slate-800/60 rounded-md" />
        </div>
        <div className="flex gap-2">
          <div className="h-10 w-28 bg-slate-800 rounded-md" />
          <div className="h-10 w-24 bg-slate-800 rounded-md" />
        </div>
      </div>

      {/* KPI / Metric cards skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, idx) => (
          <div
            key={idx}
            className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-3"
          >
            <div className="h-4 w-24 bg-slate-800 rounded" />
            <div className="h-8 w-32 bg-slate-800/80 rounded" />
            <div className="h-3 w-40 bg-slate-800/50 rounded" />
          </div>
        ))}
      </div>

      {/* Main content grid skeleton */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="h-6 w-40 bg-slate-800 rounded" />
          <div className="h-9 w-64 bg-slate-800/70 rounded-md" />
        </div>
        <div className="space-y-3 pt-2">
          {Array.from({ length: 5 }).map((_, idx) => (
            <div
              key={idx}
              className="h-14 bg-slate-800/40 rounded-lg border border-slate-800/50 flex items-center px-4 justify-between"
            >
              <div className="h-4 w-1/3 bg-slate-800 rounded" />
              <div className="h-4 w-20 bg-slate-800 rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
