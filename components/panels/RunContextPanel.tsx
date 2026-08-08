import { Clock, FileImage, History, ListChecks } from "lucide-react";
import { MOCK_ASSET, MOCK_RUN_HISTORY, RUBRIC_DIMENSIONS } from "@/lib/mock-data";
import { StatusBadge, scoreColorClass } from "@/components/StatusBadge";
import { GoldenDatasetPanel } from "@/components/panels/GoldenDatasetPanel";

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function RunContextPanel() {
  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto p-4">
      <section>
        <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
          <FileImage className="h-3.5 w-3.5" />
          Current asset
        </h2>
        <div className="mt-2 rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
          <p className="truncate font-mono text-sm text-zinc-200">
            {MOCK_ASSET.fileName}
          </p>
          <dl className="mt-2 space-y-1 text-xs text-zinc-500">
            <div className="flex justify-between">
              <dt>Source</dt>
              <dd className="text-zinc-400">
                {MOCK_ASSET.source} · {MOCK_ASSET.sourceModel}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt>Dimensions</dt>
              <dd className="text-zinc-400">{MOCK_ASSET.dimensions}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Added</dt>
              <dd className="text-zinc-400">{formatTime(MOCK_ASSET.addedAt)}</dd>
            </div>
          </dl>
        </div>
      </section>

      <section>
        <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
          <ListChecks className="h-3.5 w-3.5" />
          Rubric — adaptive, up to 8 dimensions
        </h2>
        <p className="mt-1 text-[11px] leading-snug text-zinc-600">
          Which ones score depends on what you give it — an image alone, an image with a
          prompt, or a before/after pair.
        </p>
        <ul className="mt-2 space-y-1.5">
          {RUBRIC_DIMENSIONS.map((dim, i) => (
            <li
              key={dim.id}
              className="rounded-md border border-zinc-800/70 bg-zinc-900/30 px-2.5 py-1.5"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-medium text-zinc-300">
                  <span className="text-zinc-600">{i + 1}.</span> {dim.label}
                </p>
                <span className="shrink-0 rounded-full bg-zinc-800/70 px-1.5 py-0.5 text-[10px] text-zinc-500">
                  {dim.needs}
                </span>
              </div>
              <p className="mt-0.5 text-[11px] leading-snug text-zinc-500">
                {dim.description}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex-1">
        <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
          <History className="h-3.5 w-3.5" />
          Run history
        </h2>
        <ul className="mt-2 space-y-1.5">
          {MOCK_RUN_HISTORY.map((run) => (
            <li
              key={run.id}
              className="flex items-center justify-between gap-2 rounded-md border border-zinc-800/70 bg-zinc-900/30 px-2.5 py-2 hover:border-zinc-700"
            >
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-zinc-300">
                  {run.label}
                </p>
                <p className="mt-0.5 flex items-center gap-1 text-[11px] text-zinc-500">
                  <Clock className="h-3 w-3" />
                  {formatTime(run.timestamp)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span
                  className={`font-mono text-sm font-semibold ${scoreColorClass(run.overallScore)}`}
                >
                  {run.overallScore}
                </span>
                <StatusBadge status={run.status} />
              </div>
            </li>
          ))}
        </ul>
      </section>

      <GoldenDatasetPanel />
    </div>
  );
}
