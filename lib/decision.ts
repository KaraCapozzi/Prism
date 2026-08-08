// Editorial Decision + Learning Loop — sits ABOVE both the Technical and Editorial
// tracks (not part of either). AI evaluation informs the human's decision; it never
// makes it. No blended human+AI score anywhere — see CLAUDE.md's architectural law.

import { CONTESTED_THRESHOLD } from "@/lib/consensus";
import type { EditorialRunResponse, EditorialRunSuccess, JudgeId, Recommendation } from "@/lib/types";

export type LearningSignalTag =
  | "originality-undervalued"
  | "context-specific-campaign"
  | "creative-intent-misunderstood"
  | "prompt-ambiguity"
  | "technical-false-positive"
  | "other";

export const LEARNING_SIGNAL_TAGS: { id: LearningSignalTag; label: string }[] = [
  { id: "originality-undervalued", label: "Originality undervalued" },
  { id: "context-specific-campaign", label: "Context-specific campaign" },
  { id: "creative-intent-misunderstood", label: "Creative intent misunderstood" },
  { id: "prompt-ambiguity", label: "Prompt ambiguity" },
  { id: "technical-false-positive", label: "Technical false positive" },
  { id: "other", label: "Other" },
];

export const DECISION_OPTIONS: Recommendation[] = ["publish", "publish-with-edits", "hold", "reject"];

export const RECOMMENDATION_LABEL: Record<Recommendation, string> = {
  publish: "Publish",
  "publish-with-edits": "Publish with Edits",
  hold: "Hold",
  reject: "Reject",
};

/** Tally of successful editorial judges' recommendations — the honest signal is the
 * distribution itself. Never collapsed into a single "agreement %". */
export function recommendationDistribution(
  outcomes: Record<JudgeId, EditorialRunResponse> | null,
): Partial<Record<Recommendation, number>> {
  if (!outcomes) return {};
  const successful = Object.values(outcomes).filter((o): o is EditorialRunSuccess => o.ok);
  return successful.reduce(
    (acc, o) => {
      acc[o.result.recommendation] = (acc[o.result.recommendation] ?? 0) + 1;
      return acc;
    },
    {} as Partial<Record<Recommendation, number>>,
  );
}

/** The recommendation(s) tied for the most votes. A set, not a single value — ties are
 * real and shouldn't be silently broken. */
export function recommendationPlurality(distribution: Partial<Record<Recommendation, number>>): Recommendation[] {
  const entries = Object.entries(distribution) as [Recommendation, number][];
  if (entries.length === 0) return [];
  const max = Math.max(...entries.map(([, count]) => count));
  return entries.filter(([, count]) => count === max).map(([rec]) => rec);
}

/** Human diverges from the editorial panel when their decision isn't among the
 * plurality recommendation(s). Drives whether the Learning Signal taxonomy renders. */
export function humanDivergesFromEditorial(
  humanDecision: Recommendation,
  distribution: Partial<Record<Recommendation, number>>,
): boolean {
  const plurality = recommendationPlurality(distribution);
  if (plurality.length === 0) return false;
  return !plurality.includes(humanDecision);
}

/** Human score (0-100) minus the technical consensus overall score. Positive means
 * the human rated it higher than the model panel did. */
export function scoreDelta(humanScore: number, technicalOverallScore: number): number {
  return humanScore - technicalOverallScore;
}

/** Same >15 spread threshold the technical/editorial tracks already use for
 * "contested" — applied here to human-vs-model score disagreement instead of
 * judge-vs-judge disagreement. A calibration gap, not a verdict, so it's judged
 * against the technical score (editorial deliberately has no single score to
 * diff against — see CLAUDE.md's no-blended-score law). */
export function isCalibrationGap(humanScore: number, technicalOverallScore: number): boolean {
  return Math.abs(scoreDelta(humanScore, technicalOverallScore)) > CONTESTED_THRESHOLD;
}

export type RoutingStatus = "optional" | "required";

/** Confidence-gated routing: at scale you can't put a human on every asset — only
 * route genuinely ambiguous ones. Technical CONTESTED (>15pt spread on any dimension)
 * OR editorial recommendations SPLIT (publish-leaning vs. hold/reject) triggers
 * "required". Plain editorial dimension variance (isEditorialContested's other check)
 * is a separate concern — that's what drives the dissent narrator, not routing. */
export function confidenceRouting(
  technicalContested: boolean,
  editorialRan: boolean,
  editorialRecommendationSplit: boolean,
): RoutingStatus {
  if (technicalContested) return "required";
  if (editorialRan && editorialRecommendationSplit) return "required";
  return "optional";
}
