"use client";

import { AlertTriangle, CheckCircle2, Eye, EyeOff, Star, UserCheck } from "lucide-react";
import { useState } from "react";
import {
  DECISION_OPTIONS,
  LEARNING_SIGNAL_TAGS,
  RECOMMENDATION_LABEL,
  confidenceRouting,
  humanDivergesFromEditorial,
  isCalibrationGap,
  recommendationDistribution,
  recommendationPlurality,
  scoreDelta,
} from "@/lib/decision";
import { hasRecommendationSplit } from "@/lib/editorial/contested";
import {
  assetToThumbnail,
  saveGoldenDatasetEntry,
  type GoldenDatasetEntry,
} from "@/lib/golden-dataset";
import type {
  AssetInput,
  EditorialMultiJudgeResponse,
  EditorialRunSuccess,
  MultiJudgeRunResponse,
  Recommendation,
} from "@/lib/types";
import type { LearningSignalTag } from "@/lib/decision";

const RECOMMENDATION_COLOR: Record<Recommendation, string> = {
  publish: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
  "publish-with-edits": "bg-sky-500/15 text-sky-300 ring-sky-500/30",
  hold: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
  reject: "bg-rose-500/15 text-rose-300 ring-rose-500/30",
};

function mean(nums: number[]): number {
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

interface EditorialDecisionPanelProps {
  asset: AssetInput | null;
  technicalResult: MultiJudgeRunResponse | null;
  editorialEnabled: boolean;
  editorialResult: EditorialMultiJudgeResponse | null;
  decideBlind: boolean;
  onDecideBlindChange: (next: boolean) => void;
  submitted: boolean;
  onSubmittedChange: (next: boolean) => void;
}

export function EditorialDecisionPanel({
  asset,
  technicalResult,
  editorialEnabled,
  editorialResult,
  decideBlind,
  onDecideBlindChange,
  submitted,
  onSubmittedChange,
}: EditorialDecisionPanelProps) {
  const [humanScore, setHumanScore] = useState("");
  const [humanDecision, setHumanDecision] = useState<Recommendation | null>(null);
  const [humanReason, setHumanReason] = useState("");
  const [learningTags, setLearningTags] = useState<LearningSignalTag[]>([]);
  const [learningOtherText, setLearningOtherText] = useState("");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);

  if (!technicalResult) {
    return (
      <div className="pt-5">
        <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-cyan-300">
          <UserCheck className="h-3.5 w-3.5" />
          Editorial Decision
        </h2>
        <p className="mt-2 text-xs text-zinc-500">
          Run an evaluation to unlock the human decision stage.
        </p>
      </div>
    );
  }

  const tr = technicalResult;
  const technicalContested = tr.consensus.some((d) => d.contested);
  const editorialSuccessful = editorialResult
    ? (Object.values(editorialResult.outcomes).filter((o): o is EditorialRunSuccess => o.ok))
    : [];
  const editorialRan = editorialEnabled && editorialResult !== null;
  const editorialSplit = editorialRan && hasRecommendationSplit(editorialSuccessful);
  const routing = confidenceRouting(technicalContested, editorialRan, editorialSplit);

  const distribution = recommendationDistribution(editorialResult?.outcomes ?? null);
  const plurality = recommendationPlurality(distribution);
  const distributionEntries = Object.entries(distribution) as [Recommendation, number][];

  const technicalOverallScore = tr.consensus.length > 0 ? Math.round(mean(tr.consensus.map((d) => d.consensus))) : null;
  const humanScoreNum = humanScore.trim() === "" ? null : Number(humanScore);
  const humanScoreValid = humanScoreNum !== null && Number.isFinite(humanScoreNum) && humanScoreNum >= 0 && humanScoreNum <= 100;

  const canSubmit = humanScoreValid && humanDecision !== null && humanReason.trim().length > 0;
  const revealed = !decideBlind || submitted;
  const diverges =
    submitted && humanDecision !== null ? humanDivergesFromEditorial(humanDecision, distribution) : false;
  const delta =
    submitted && humanScoreValid && technicalOverallScore !== null
      ? scoreDelta(humanScoreNum, technicalOverallScore)
      : null;
  const calibrationGap =
    submitted && humanScoreValid && technicalOverallScore !== null
      ? isCalibrationGap(humanScoreNum, technicalOverallScore)
      : false;
  // Learning signal spans both axes of disagreement — a verdict split from the
  // editorial plurality, or a numeric calibration gap against the technical score.
  const showLearningSignal = diverges || calibrationGap;

  function handleSubmit() {
    if (!canSubmit) return;
    onSubmittedChange(true);
  }

  function toggleLearningTag(tag: LearningSignalTag) {
    setLearningTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  }

  async function handleSaveGolden() {
    if (!submitted || !humanDecision || !humanScoreValid) return;
    setSaveStatus("saving");
    setSaveError(null);

    const src = asset ? (asset.kind === "upload" ? asset.previewUrl : asset.url) : null;
    const thumbnailDataUrl = src ? await assetToThumbnail(src) : null;

    const entry: Omit<GoldenDatasetEntry, "id" | "timestamp"> = {
      asset: {
        name: asset?.name ?? "unknown",
        sourceUrl: asset?.kind === "url" ? asset.url : null,
        thumbnailDataUrl,
      },
      technical: {
        mode: tr.mode,
        overallScore: technicalOverallScore,
        contested: technicalContested,
        consensus: tr.consensus,
      },
      editorial: editorialRan
        ? {
            outcomes: editorialResult!.outcomes,
            recommendationDistribution: distribution,
            contested: editorialResult!.contested,
          }
        : null,
      human: { score: humanScoreNum, decision: humanDecision, reason: humanReason.trim() },
      learningSignal: showLearningSignal
        ? { tags: learningTags, otherText: learningOtherText.trim() || null }
        : null,
    };

    const result = saveGoldenDatasetEntry(entry);
    if (result.ok) {
      setSaveStatus("saved");
    } else {
      setSaveStatus("error");
      setSaveError(result.error);
    }
  }

  return (
    <div className="flex flex-col gap-4 pt-5">
      <div>
        <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-cyan-300">
          <UserCheck className="h-3.5 w-3.5" />
          Editorial Decision
        </h2>
        <p className="mt-1.5 text-[11px] leading-snug text-zinc-500">
          AI evaluation informs this call; it doesn&apos;t make it. Compared primarily against the
          Editorial Review recommendations, with technical results as supporting context.
        </p>
      </div>

      <div
        className={`rounded-md px-2.5 py-2 text-[11px] leading-snug ring-1 ring-inset ${
          routing === "required"
            ? "bg-amber-500/10 text-amber-300 ring-amber-500/30"
            : "bg-emerald-500/10 text-emerald-300 ring-emerald-500/30"
        }`}
      >
        {routing === "required"
          ? "Contested — editorial decision required."
          : "High confidence — editorial decision optional."}
        <span className="ml-1 text-zinc-500">
          ({technicalContested ? "technical contested" : "technical clean"}
          {editorialRan ? `, editorial ${editorialSplit ? "split" : "agrees"}` : ", editorial not run"})
        </span>
      </div>

      {!submitted && (
        <button
          type="button"
          onClick={() => onDecideBlindChange(!decideBlind)}
          className="inline-flex w-fit items-center gap-1.5 rounded-md border border-zinc-700 bg-zinc-900/50 px-2.5 py-1.5 text-[11px] font-medium text-zinc-300 hover:border-zinc-600"
        >
          {decideBlind ? <EyeOff className="h-3.5 w-3.5 text-cyan-400" /> : <Eye className="h-3.5 w-3.5" />}
          Decide blind: {decideBlind ? "On" : "Off"}
        </button>
      )}

      {!revealed && (
        <div className="flex items-center gap-2 rounded-lg border border-cyan-500/20 bg-cyan-500/5 px-3 py-2.5 text-[11px] text-cyan-300/80">
          <EyeOff className="h-3.5 w-3.5 shrink-0" />
          AI evaluation hidden until you decide — the panels above are collapsed while blind mode is on.
        </div>
      )}

      <fieldset disabled={submitted} className="flex flex-col gap-2 disabled:opacity-60">
        <label className="flex items-center gap-2 text-[11px] text-zinc-400">
          Your score (0–100, required)
          <input
            type="number"
            min={0}
            max={100}
            value={humanScore}
            onChange={(e) => setHumanScore(e.target.value)}
            placeholder="—"
            className="w-16 rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-cyan-500 focus:outline-none"
          />
        </label>
        <div className="flex flex-wrap gap-1.5">
          {DECISION_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setHumanDecision(option)}
              className={`rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ring-inset transition-colors ${
                humanDecision === option
                  ? RECOMMENDATION_COLOR[option]
                  : "text-zinc-500 ring-zinc-700 hover:text-zinc-300"
              }`}
            >
              {RECOMMENDATION_LABEL[option]}
            </button>
          ))}
        </div>
        <textarea
          value={humanReason}
          onChange={(e) => setHumanReason(e.target.value)}
          placeholder="Why? (required)"
          rows={2}
          className="w-full resize-none rounded-md border border-zinc-700 bg-zinc-950 px-2.5 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-cyan-500 focus:outline-none"
        />
      </fieldset>

      {!submitted ? (
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="inline-flex w-fit items-center gap-1.5 rounded-md bg-cyan-500/15 px-2.5 py-1.5 text-xs font-medium text-cyan-300 ring-1 ring-inset ring-cyan-500/30 hover:bg-cyan-500/25 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-cyan-500/15"
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
          Submit decision
        </button>
      ) : (
        <div className="flex flex-col gap-3 rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-3">
          <p className="flex items-center gap-1.5 text-[11px] font-medium text-cyan-300">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Decision recorded
          </p>

          {technicalOverallScore !== null && (
            <p className="text-[11px] leading-relaxed">
              <span className="text-zinc-400">Your score: </span>
              <span className="font-mono font-semibold text-zinc-200">{humanScoreNum}</span>
              <span className="text-zinc-400"> · Technical consensus: </span>
              <span className="font-mono font-semibold text-zinc-200">{technicalOverallScore}</span>
              {delta !== null && (
                <span className="text-zinc-500">
                  {" "}
                  · Δ {delta > 0 ? "+" : ""}
                  {delta}
                </span>
              )}
              {calibrationGap && (
                <span className="ml-1.5 inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-300 ring-1 ring-inset ring-amber-500/30">
                  <AlertTriangle className="h-2.5 w-2.5" />
                  Calibration gap
                </span>
              )}
            </p>
          )}

          {editorialRan ? (
            <div className="text-[11px] leading-relaxed">
              <p className="text-zinc-400">
                Editorial AI:{" "}
                {distributionEntries.length === 0
                  ? "no successful judges"
                  : distributionEntries
                      .map(([rec, count]) => `${count} ${RECOMMENDATION_LABEL[rec]}`)
                      .join(" · ")}
              </p>
              <p className="mt-1 flex items-center gap-1.5">
                <span className="text-zinc-400">Human:</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${RECOMMENDATION_COLOR[humanDecision!]}`}
                >
                  {RECOMMENDATION_LABEL[humanDecision!]}
                </span>
                {diverges && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-300 ring-1 ring-inset ring-amber-500/30">
                    <AlertTriangle className="h-2.5 w-2.5" />
                    Diverges from editorial plurality ({plurality.map((r) => RECOMMENDATION_LABEL[r]).join(" / ")})
                  </span>
                )}
              </p>
            </div>
          ) : (
            <p className="text-[11px] text-zinc-500">
              Editorial Review wasn&apos;t run for this asset — compared to technical only.
            </p>
          )}

          <p className="text-[11px] text-zinc-500">
            Technical: {technicalContested ? "contested" : "clean"} ·{" "}
            {tr.consensus.filter((d) => d.contested).length} dimension(s) flagged
          </p>

          {showLearningSignal && (
            <div className="border-t border-cyan-500/20 pt-2.5">
              <p className="text-[11px] font-medium text-zinc-300">
                Why did the AI diverge? (optional — spans both tracks)
              </p>
              <p className="mt-0.5 text-[10px] text-zinc-500">
                {diverges && calibrationGap
                  ? "Verdict split from editorial + a calibration gap vs. technical."
                  : diverges
                    ? "Verdict split from the editorial plurality."
                    : "Calibration gap vs. the technical consensus score."}
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {LEARNING_SIGNAL_TAGS.map((tag) => (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => toggleLearningTag(tag.id)}
                    className={`rounded-full px-2 py-1 text-[10px] font-medium ring-1 ring-inset transition-colors ${
                      learningTags.includes(tag.id)
                        ? "bg-cyan-500/15 text-cyan-300 ring-cyan-500/30"
                        : "text-zinc-500 ring-zinc-700 hover:text-zinc-300"
                    }`}
                  >
                    {tag.label}
                  </button>
                ))}
              </div>
              {learningTags.includes("other") && (
                <input
                  type="text"
                  value={learningOtherText}
                  onChange={(e) => setLearningOtherText(e.target.value)}
                  placeholder="Say more…"
                  className="mt-1.5 w-full rounded-md border border-zinc-700 bg-zinc-950 px-2.5 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-cyan-500 focus:outline-none"
                />
              )}
            </div>
          )}

          <div className="flex items-center gap-2 border-t border-cyan-500/20 pt-2.5">
            <button
              type="button"
              onClick={handleSaveGolden}
              disabled={saveStatus === "saving" || saveStatus === "saved"}
              className="inline-flex items-center gap-1.5 rounded-md bg-zinc-800/70 px-2.5 py-1.5 text-[11px] font-medium text-zinc-300 ring-1 ring-inset ring-zinc-700 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Star className="h-3 w-3" />
              {saveStatus === "saved" ? "Saved to Golden Dataset" : "Save to Golden Dataset"}
            </button>
            {saveStatus === "error" && saveError && (
              <span className="text-[11px] text-rose-400">{saveError}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
