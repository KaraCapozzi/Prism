import { AlertTriangle, CheckCircle2, Gauge, Wrench } from "lucide-react";
import {
  JUDGES,
  MOCK_DIMENSION_SCORES,
  MOCK_OVERALL_SCORE,
  MOCK_ROOT_CAUSE,
  RUBRIC_DIMENSIONS,
} from "@/lib/mock-data";
import type { JudgeStatus } from "@/lib/types";
import { scoreColorClass, scoreStatus, StatusBadge } from "@/components/StatusBadge";

const JUDGE_STATUS_DOT: Record<JudgeStatus, string> = {
  idle: "bg-zinc-600",
  pending: "bg-amber-400 animate-pulse",
  complete: "bg-emerald-400",
  error: "bg-rose-400",
};

function labelFor(id: string) {
  return RUBRIC_DIMENSIONS.find((d) => d.id === id)?.label ?? id;
}

export function EvaluationEnginePanel() {
  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto p-4">
      <section className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
            <Gauge className="h-3.5 w-3.5" />
            Consensus score
          </h2>
          <StatusBadge status={scoreStatus(MOCK_OVERALL_SCORE)} />
        </div>
        <p
          className={`mt-2 font-mono text-4xl font-bold tabular-nums ${scoreColorClass(MOCK_OVERALL_SCORE)}`}
        >
          {MOCK_OVERALL_SCORE}
          <span className="text-lg font-medium text-zinc-600">/100</span>
        </p>
        <p className="mt-1 text-[11px] text-zinc-500">
          Median across 4 judges · std dev flags spread &gt; 15pts as contested
        </p>
      </section>

      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
          Judge panel
        </h2>
        <ul className="mt-2 space-y-1.5">
          {JUDGES.map((judge) => (
            <li
              key={judge.id}
              className="flex items-center justify-between gap-2 rounded-md border border-zinc-800/70 bg-zinc-900/30 px-2.5 py-2"
            >
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${JUDGE_STATUS_DOT[judge.status]}`}
                />
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-zinc-300">
                    {judge.name}
                  </p>
                  <p className="truncate font-mono text-[11px] text-zinc-600">
                    {judge.modelId}
                  </p>
                </div>
              </div>
              <span className="shrink-0 text-[11px] text-zinc-500">{judge.role}</span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
          Dimension breakdown
        </h2>
        <ul className="mt-2 space-y-2">
          {MOCK_DIMENSION_SCORES.map((d) => (
            <li key={d.dimensionId}>
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 text-zinc-400">
                  {d.contested && (
                    <AlertTriangle className="h-3 w-3 text-amber-400" />
                  )}
                  {labelFor(d.dimensionId)}
                </span>
                <span className={`font-mono font-semibold ${scoreColorClass(d.consensus)}`}>
                  {d.consensus}
                </span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
                <div
                  className={`h-full rounded-full ${
                    d.contested ? "bg-amber-400" : "bg-indigo-500"
                  }`}
                  style={{ width: `${d.consensus}%` }}
                />
              </div>
              {d.contested && (
                <p className="mt-1 text-[11px] text-amber-400/80">
                  Contested · σ {d.dissent.toFixed(1)}
                </p>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-lg border border-rose-500/20 bg-rose-500/5 p-4">
        <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-rose-400">
          <Wrench className="h-3.5 w-3.5" />
          Root cause — {MOCK_ROOT_CAUSE.label}
        </h2>
        <p className="mt-2 text-xs leading-relaxed text-zinc-400">
          {MOCK_ROOT_CAUSE.summary}
        </p>
        <p className="mt-3 flex items-start gap-1.5 text-xs leading-relaxed text-emerald-400/90">
          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {MOCK_ROOT_CAUSE.fix}
        </p>
      </section>
    </div>
  );
}
