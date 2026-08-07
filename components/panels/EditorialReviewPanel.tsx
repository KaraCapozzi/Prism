"use client";

import { AlertTriangle, MessageCircle, Palette, ShieldAlert } from "lucide-react";
import { EDITORIAL_ACTIVE_DIMENSIONS, editorialDimensionLabel } from "@/lib/editorial/schema";
import type {
  Confidence,
  EditorialMultiJudgeResponse,
  EditorialRiskLevel,
  EditorialRunSuccess,
  JudgeErrorCategory,
  JudgeId,
  Recommendation,
} from "@/lib/types";

const JUDGE_SHORT_LABEL: Record<JudgeId, string> = {
  "muse-spark": "Muse",
  claude: "Claude",
  gpt: "GPT",
  gemini: "Gemini",
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

const RECOMMENDATION_LABEL: Record<Recommendation, string> = {
  publish: "Publish",
  "publish-with-edits": "Publish with Edits",
  hold: "Hold",
  reject: "Reject",
};

const RECOMMENDATION_COLOR: Record<Recommendation, string> = {
  publish: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
  "publish-with-edits": "bg-sky-500/15 text-sky-300 ring-sky-500/30",
  hold: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
  reject: "bg-rose-500/15 text-rose-300 ring-rose-500/30",
};

const CONFIDENCE_LABEL: Record<Confidence, string> = { high: "High", medium: "Med", low: "Low" };
const RISK_LABEL: Record<EditorialRiskLevel, string> = { low: "Low", medium: "Med", high: "High" };

/** Turns any http(s) URL in an error message into a clickable link. */
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

interface EditorialReviewPanelProps {
  status: "idle" | "pending" | "done";
  result: EditorialMultiJudgeResponse | null;
  runError: string | null;
}

export function EditorialReviewPanel({ status, result, runError }: EditorialReviewPanelProps) {
  const successful: { id: JudgeId; result: EditorialRunSuccess["result"] }[] = result
    ? (Object.keys(result.outcomes) as JudgeId[])
        .map((id) => ({ id, outcome: result.outcomes[id] }))
        .filter((x): x is { id: JudgeId; outcome: EditorialRunSuccess } => x.outcome.ok)
        .map(({ id, outcome }) => ({ id, result: outcome.result }))
    : [];

  const recommendationCounts = successful.reduce(
    (acc, s) => {
      acc[s.result.recommendation] = (acc[s.result.recommendation] ?? 0) + 1;
      return acc;
    },
    {} as Partial<Record<Recommendation, number>>,
  );

  return (
    <div className="flex flex-col gap-5 pt-5">
      <div>
        <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-purple-300">
          <Palette className="h-3.5 w-3.5" />
          Editorial Review
        </h2>
        <p className="mt-1.5 rounded-md bg-purple-500/10 px-2.5 py-2 text-[11px] leading-snug text-purple-300/90 ring-1 ring-inset ring-purple-500/20">
          Subjective editorial signal — not a verdict. Models often favor statistically common
          patterns; editorial review exists to surface originality alongside technical quality. A
          human makes the final call.
        </p>
      </div>

      {!result && status !== "pending" && (
        <p className="text-xs text-zinc-500">Run evaluation to see editorial signal here.</p>
      )}

      {runError && (
        <p className="flex items-start gap-1.5 text-xs text-rose-400">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {linkify(runError)}
        </p>
      )}

      {result && (
        <>
          {successful.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              {(Object.entries(recommendationCounts) as [Recommendation, number][]).map(([rec, count]) => (
                <span
                  key={rec}
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ring-inset ${RECOMMENDATION_COLOR[rec]}`}
                >
                  {count} {RECOMMENDATION_LABEL[rec]}
                </span>
              ))}
            </div>
          )}

          <div className="space-y-2.5">
            {successful.map(({ id, result: r }) => (
              <div key={id} className="rounded-lg border border-purple-500/20 bg-purple-500/5 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-purple-200">{JUDGE_SHORT_LABEL[id]}</span>
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${RECOMMENDATION_COLOR[r.recommendation]}`}
                  >
                    {RECOMMENDATION_LABEL[r.recommendation]}
                  </span>
                </div>
                <p className="mt-1.5 text-xs italic leading-snug text-zinc-300">&ldquo;{r.thesis}&rdquo;</p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] text-zinc-500">
                  <span className="rounded bg-zinc-800/70 px-1.5 py-0.5">
                    Confidence: {CONFIDENCE_LABEL[r.confidence]}
                  </span>
                  <span className="rounded bg-zinc-800/70 px-1.5 py-0.5 inline-flex items-center gap-1">
                    <ShieldAlert className="h-2.5 w-2.5" />
                    Risk: {RISK_LABEL[r.editorialRisk]}
                  </span>
                </div>
                <p className="mt-1 text-[11px] leading-snug text-zinc-500">{r.recommendationReason}</p>
              </div>
            ))}

            {(Object.keys(result.outcomes) as JudgeId[])
              .map((id) => ({ id, outcome: result.outcomes[id] }))
              .filter((x) => !x.outcome.ok)
              .map(({ id, outcome }) => {
                if (outcome.ok) return null;
                return (
                  <div key={id} className="rounded-lg border border-zinc-800/70 bg-zinc-900/30 p-3">
                    <span className="text-xs font-medium text-zinc-400">{JUDGE_SHORT_LABEL[id]}</span>
                    <p className="mt-1 flex items-start gap-1 text-[11px] text-rose-400">
                      <span className="mt-0.5 shrink-0 rounded bg-rose-500/15 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-rose-300">
                        {ERROR_CATEGORY_LABEL[outcome.category]}
                      </span>
                      <span className="leading-snug">{linkify(outcome.error)}</span>
                    </p>
                  </div>
                );
              })}
          </div>

          {successful.length > 0 && (
            <div>
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                Per-dimension divergence
              </h3>
              <ul className="mt-2 space-y-1.5">
                {EDITORIAL_ACTIVE_DIMENSIONS.map((dim) => (
                  <li key={dim.id} className="flex items-center justify-between text-[11px]">
                    <span className="text-zinc-400">{editorialDimensionLabel(dim.id)}</span>
                    <span className="flex flex-wrap items-center gap-x-2 text-zinc-500">
                      {successful.map((s) => {
                        const score = s.result.dimensions.find((d) => d.dimensionId === dim.id)?.score;
                        return (
                          <span key={s.id}>
                            {JUDGE_SHORT_LABEL[s.id]} {score ?? "—"}
                          </span>
                        );
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.contested && (
            <div className="rounded-lg border border-purple-500/30 bg-purple-500/10 p-3">
              <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-purple-300">
                <MessageCircle className="h-3 w-3" />
                Aesthetically contested
              </h3>
              {!result.dissentNote ? (
                <p className="mt-1.5 text-[11px] text-zinc-500">Narration unavailable.</p>
              ) : result.dissentNote.ok ? (
                <p className="mt-1.5 text-[11px] italic leading-snug text-zinc-300">{result.dissentNote.note}</p>
              ) : (
                <p className="mt-1.5 flex items-start gap-1 text-[11px] text-rose-400">
                  <span className="mt-0.5 shrink-0 rounded bg-rose-500/15 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-rose-300">
                    {ERROR_CATEGORY_LABEL[result.dissentNote.category]}
                  </span>
                  <span className="leading-snug">Narration unavailable — {linkify(result.dissentNote.error)}</span>
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
