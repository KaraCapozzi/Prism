import { Aperture, Circle } from "lucide-react";

export function AppHeader() {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-zinc-800 bg-zinc-950/80 px-4">
      <div className="flex items-center gap-2.5">
        <Aperture className="h-5 w-5 text-indigo-400" strokeWidth={1.75} />
        <span className="font-mono text-sm font-semibold tracking-tight text-zinc-100">
          PRISM
        </span>
        <span className="hidden text-xs text-zinc-500 sm:inline">
          Muse quality console
        </span>
      </div>
      <div className="flex items-center gap-2 text-xs text-zinc-500">
        <Circle className="h-2 w-2 fill-zinc-600 text-zinc-600" />
        <span>No active run</span>
      </div>
    </header>
  );
}
