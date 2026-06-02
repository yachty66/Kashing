export function Placeholder({
  title,
  tagline,
  planned,
}: {
  title: string;
  tagline: string;
  planned: string[];
}) {
  return (
    <div className="p-8 max-w-3xl w-full">
      <header className="mb-6">
        <div className="text-xs text-muted uppercase tracking-wide mb-2">Coming next</div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="text-muted text-sm mt-1 leading-relaxed">{tagline}</p>
      </header>
      <div className="card p-6">
        <div className="text-sm text-foreground/80 mb-3">What this page will do:</div>
        <ul className="space-y-2">
          {planned.map((p, i) => (
            <li key={i} className="flex gap-3 text-sm">
              <span className="text-muted shrink-0">·</span>
              <span className="text-foreground/90">{p}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
