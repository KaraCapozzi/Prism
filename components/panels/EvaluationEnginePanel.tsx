"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Gauge,
  Loader2,
  MessageCircle,
  Play,
  Wrench,
} from "lucide-react";
import { useState } from "react";
import { JUDGES, RUBRIC_DIMENSIONS } from "@/lib/mock-data";
import type {
  AssetInput,
  EditorialApiResponse,
  EditorialMultiJudgeResponse,
  EvalMode,
  JudgeErrorCategory,
  JudgeId,
  JudgeStatus,
  MultiJudgeRunResponse,
  RunResponse,
} from "@/lib/types";
import { scoreColorClass, scoreStatus, StatusBadge } from "@/components/StatusBadge";
import { EditorialReviewPanel } from "@/components/panels/EditorialReviewPanel";

const JUDGE_STATUS_DOT: Record<JudgeStatus, string> = {
  idle: "bg-zinc-600",
  pending: "bg-amber-400 animate-pulse",
  complete: "bg-emerald-400",
  error: "bg-rose-400",
};

const ERROR_CATEGORY_LABEL: Record<JudgeErrorCategory, string> = {
  "missing-key": "Key",
  "out-of-credit": "Out of credit",
  "rate-limited": "Rate limited",
  network: "Network",
  "safety-refusal": "Safety",
  "malformed-response": "Malformed",
  "input-error": "Input",
  unknown: "Error",
};

const MODE_LABEL: Record<EvalMode, string> = {
  "image-only": "image only",
  "image-and-prompt": "image + prompt",
  "before-after": "before + after edit",
};

const JUDGE_SHORT_LABEL: Record<JudgeId, string> = {
  "muse-spark": "Muse",
  claude: "Claude",
  gpt: "GPT",
  gemini: "Gemini",
};

function labelFor(id: string) {
  return RUBRIC_DIMENSIONS.find((d) => d.id === id)?.label ?? id;
}

function mean(nums: number[]): number {
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

/** Turns any http(s) URL in an error message into a clickable link — mainly for
 * the out-of-credit "recharge at <link>" messages. */
function linkify(text: string) {
  const parts = text.split(/(https?:\/\/\S+)/g);
  return parts.map((part, i) =>
    /^https?:\/\//.test(part) ? (
      <a
        key={i}
        href={part}
        target="_blank"
        rel="noopener noreferrer"
        className="underline decoration-dotted underline-offset-2 hover:text-rose-300"
      >
        {part}
      </a>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

interface EvaluationEnginePanelProps {
  asset: AssetInput | null;
  prompt: string;
  editMode: boolean;
  beforeAsset: AssetInput | null;
  onResult: (result: MultiJudgeRunResponse | null) => void;
  editorialEnabled: boolean;
}

export function EvaluationEnginePanel({
  asset,
  prompt,
  editMode,
  beforeAsset,
  onResult,
  editorialEnabled,
}: EvaluationEnginePanelProps) {
  const [runStatus, setRunStatus] = useState<"idle" | "pending" | "done">("idle");
  const [result, setResult] = useState<MultiJudgeRunResponse | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [editorialResult, setEditorialResult] = useState<EditorialMultiJudgeResponse | null>(null);
  const [editorialRunError, setEditorialRunError] = useState<string | null>(null);

  function missingPieces(): string | null {
    if (!editMode) {
      return asset ? null : "Load an asset in the center pane to enable this.";
    }
    const missing: string[] = [];
    if (!beforeAsset) missing.push("a Before image");
    if (!asset) missing.push("an After image");
    if (!prompt.trim()) missing.push("an edit instruction");
    return missing.length ? `Add ${missing.join(", ")} to enable this.` : null;
  }

  const blockedReason = missingPieces();

  async function runEvaluation() {
    if (blockedReason || runStatus === "pending" || !asset) return;
    setRunStatus("pending");
    setRunError(null);
    if (editorialEnabled) {
      setEditorialRunError(null);
      setEditorialResult(null);
    }

    const formData = new FormData();
    if (asset.kind === "upload") {
      formData.set("file", asset.file);
    } else {
      formData.set("url", asset.url);
    }
    if (editMode && beforeAsset) {
      if (beforeAsset.kind === "upload") {
        formData.set("beforeFile", beforeAsset.file);
      } else {
        formData.set("beforeUrl", beforeAsset.url);
      }
    }
    if (prompt.trim()) {
      formData.set("prompt", prompt.trim());
    }

    // Editorial only ever needs the current (after) image — its own separate
    // request, separate route, separate prompt. Never the same call as technical.
    const editorialFormData = new FormData();
    if (asset.kind === "upload") {
      editorialFormData.set("file", asset.file);
    } else {
      editorialFormData.set("url", asset.url);
    }

    const [technicalSettled, editorialSettled] = await Promise.allSettled([
      fetch("/api/judge/run", { method: "POST", body: formData }),
      editorialEnabled ? fetch("/api/editorial/run", { method: "POST", body: editorialFormData }) : Promise.resolve(null),
    ]);

    if (technicalSettled.status === "rejected") {
      setRunError("Couldn't reach the evaluation route — check the dev server is running.");
      setRunStatus("idle");
      setResult(null);
      onResult(null);
    } else {
      try {
        const body = (await technicalSettled.value.json()) as RunResponse;
        if (!body.ok) {
          setRunError(body.error);
          setRunStatus("idle");
          setResult(null);
          onResult(null);
        } else {
          setResult(body);
          onResult(body);
          setRunStatus("done");
        }
      } catch {
        setRunError("Couldn't reach the evaluation route — check the dev server is running.");
        setRunStatus("idle");
        setResult(null);
        onResult(null);
      }
    }

    if (editorialEnabled) {
      if (editorialSettled.status === "rejected" || editorialSettled.value === null) {
        setEditorialRunError("Couldn't reach the editorial review route — check the dev server is running.");
      } else {
        try {
          const body = (await editorialSettled.value.json()) as EditorialApiResponse;
          if (!body.ok) {
            setEditorialRunError(body.error);
          } else {
            setEditorialResult(body);
          }
        } catch {
          setEditorialRunError("Couldn't reach the editorial review route — check the dev server is running.");
        }
      }
    }
  }

  const overallScore =
    result && result.consensus.length > 0
      ? Math.round(mean(result.consensus.map((d) => d.consensus)))
      : null;
  const contestedCount = result?.consensus.filter((d) => d.contested).length ?? 0;
  const successfulJudges = result
    ? (Object.values(result.outcomes).filter((o) => o.ok).length as number)
    : 0;

  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto p-4">
      <section className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
            <Gauge className="h-3.5 w-3.5" />
            Consensus score
          </h2>
          {overallScore !== null && <StatusBadge status={scoreStatus(overallScore)} />}
        </div>
        {overallScore !== null ? (
          <>
            <p className={`mt-2 font-mono text-4xl font-bold tabular-nums ${scoreColorClass(overallScore)}`}>
              {overallScore}
              <span className="text-lg font-medium text-zinc-600">/100</span>
            </p>
            <p className="mt-1 text-[11px] text-zinc-500">
              Mean of {result?.consensus.length} active-dimension medians · {successfulJudges}/4 judges
              responded
            </p>
            {contestedCount > 0 && (
              <p className="mt-1 text-[11px] text-amber-400/80">
                {contestedCount} dimension{contestedCount === 1 ? "" : "s"} contested (spread &gt; 15pts)
              </p>
            )}
          </>
        ) : (
          <p className="mt-2 text-xs text-zinc-500">Run an evaluation to see a real score here.</p>
        )}
      </section>

      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
          Judge panel
        </h2>
        <ul className="mt-2 space-y-1.5">
          {JUDGES.map((judge) => {
            const outcome = result?.outcomes[judge.id];
            const flattenedReason = result?.excludedFromConsensus?.[judge.id];
            const status: JudgeStatus = outcome
              ? outcome.ok
                ? "complete"
                : "error"
              : runStatus === "pending"
                ? "pending"
                : "idle";
            return (
              <li
                key={judge.id}
                className="rounded-md border border-zinc-800/70 bg-zinc-900/30 px-2.5 py-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${flattenedReason ? "bg-amber-400" : JUDGE_STATUS_DOT[status]}`}
                    />
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-zinc-300">{judge.name}</p>
                      <p className="truncate font-mono text-[11px] text-zinc-600">{judge.modelId}</p>
                    </div>
                  </div>
                  <span className="shrink-0 text-[11px] text-zinc-500">{judge.role}</span>
                </div>
                {outcome && !outcome.ok && (
                  <p className="mt-1.5 flex items-start gap-1 text-[11px] text-rose-400">
                    <span className="mt-0.5 shrink-0 rounded bg-rose-500/15 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-rose-300">
                      {ERROR_CATEGORY_LABEL[outcome.category]}
                    </span>
                    <span className="leading-snug">{linkify(outcome.error)}</span>
                  </p>
                )}
                {outcome?.ok && flattenedReason && (
                  <p className="mt-1.5 flex items-start gap-1 text-[11px] text-amber-400">
                    <span className="mt-0.5 shrink-0 rounded bg-amber-500/15 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-300">
                      Known limitation
                    </span>
                    <span className="leading-snug">
                      Forced-mode flattening — returned {outcome.results[0]?.score} across every
                      dimension, excluded from this run&apos;s consensus.
                    </span>
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="rounded-lg border border-indigo-500/20 bg-indigo-500/5 p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-indigo-300">
            Run evaluation — all 4 judges
          </h2>
          <button
            type="button"
            onClick={runEvaluation}
            disabled={!!blockedReason || runStatus === "pending"}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-indigo-500/15 px-2.5 py-1.5 text-xs font-medium text-indigo-300 ring-1 ring-inset ring-indigo-500/30 hover:bg-indigo-500/25 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-indigo-500/15"
          >
            {runStatus === "pending" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
            {runStatus === "pending" ? "Evaluating…" : "Run judge"}
          </button>
        </div>

        {blockedReason && <p className="mt-2 text-[11px] text-zinc-500">{blockedReason}</p>}

        {runError && (
          <p className="mt-2 flex items-start gap-1.5 text-xs text-rose-400">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {runError}
          </p>
        )}

        {result && (
          <p className="mt-2 text-[11px] text-zinc-500">
            Mode: {MODE_LABEL[result.mode]} · {result.consensus.length} dimension
            {result.consensus.length === 1 ? "" : "s"} · {successfulJudges}/4 judges responded
          </p>
        )}
      </section>

      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
          Dimension breakdown
        </h2>
        {!result ? (
          <p className="mt-2 text-xs text-zinc-500">Nothing scored yet.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {result.consensus.map((d) => {
              const dissentNote = result.dissentNotes.find((n) => n.dimensionId === d.dimensionId);
              return (
                <li key={d.dimensionId}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5 text-zinc-400">
                      {d.contested && <AlertTriangle className="h-3 w-3 text-amber-400" />}
                      {labelFor(d.dimensionId)}
                    </span>
                    <span className={`font-mono font-semibold ${scoreColorClass(d.consensus)}`}>
                      {d.consensus}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
                    <div
                      className={`h-full rounded-full ${d.contested ? "bg-amber-400" : "bg-indigo-500"}`}
                      style={{ width: `${d.consensus}%` }}
                    />
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-zinc-500">
                    {(Object.keys(d.judgeScores) as JudgeId[]).map((judgeId) => (
                      <span key={judgeId}>
                        {JUDGE_SHORT_LABEL[judgeId]} {d.judgeScores[judgeId]}
                      </span>
                    ))}
                  </div>
                  {d.contested && (
                    <p className="mt-1 text-[11px] text-amber-400/80">
                      Contested · σ {d.dissent.toFixed(1)}
                    </p>
                  )}
                  {dissentNote && (
                    <div className="mt-1 flex items-start gap-1.5 rounded-md bg-zinc-900/60 px-2 py-1.5">
                      <MessageCircle className="mt-0.5 h-3 w-3 shrink-0 text-indigo-400" />
                      {dissentNote.result.ok ? (
                        <p className="text-[11px] italic leading-snug text-zinc-400">
                          {dissentNote.result.note}
                        </p>
                      ) : (
                        <p className="flex items-start gap-1 text-[11px] text-rose-400">
                          <span className="mt-0.5 shrink-0 rounded bg-rose-500/15 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-rose-300">
                            {ERROR_CATEGORY_LABEL[dissentNote.result.category]}
                          </span>
                          <span className="leading-snug">
                            Narration unavailable — {linkify(dissentNote.result.error)}
                          </span>
                        </p>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="rounded-lg border border-rose-500/20 bg-rose-500/5 p-4">
        <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-rose-400">
          <Wrench className="h-3.5 w-3.5" />
          Root cause
        </h2>
        {!result ? (
          <p className="mt-2 text-xs text-zinc-500">Nothing scored yet.</p>
        ) : result.rootCause === null ? (
          <p className="mt-2 flex items-start gap-1.5 text-xs leading-relaxed text-emerald-400/90">
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            No dominant failure — every dimension scored in the &quot;no observable problems&quot; band.
          </p>
        ) : !result.rootCause.ok ? (
          <p className="mt-2 flex items-start gap-1.5 text-xs text-rose-400">
            <span className="mt-0.5 shrink-0 rounded bg-rose-500/15 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-rose-300">
              {ERROR_CATEGORY_LABEL[result.rootCause.category]}
            </span>
            <span className="leading-relaxed">{linkify(result.rootCause.error)}</span>
          </p>
        ) : (
          <>
            <p className="mt-1 text-[11px] font-medium text-rose-300">{result.rootCause.finding.label}</p>
            <p className="mt-2 text-xs leading-relaxed text-zinc-400">{result.rootCause.finding.summary}</p>
            <p className="mt-3 flex items-start gap-1.5 text-xs leading-relaxed text-emerald-400/90">
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {result.rootCause.finding.fix}
            </p>
          </>
        )}
      </section>

      {editorialEnabled && (
        <>
          <div className="border-t-4 border-purple-500/30" />
          <EditorialReviewPanel
            status={runStatus}
            result={editorialResult}
            runError={editorialRunError}
          />
        </>
      )}
    </div>
  );
}
