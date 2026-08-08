import { CONTESTED_THRESHOLD, stdDev } from "@/lib/consensus";
import { EDITORIAL_ACTIVE_DIMENSIONS } from "@/lib/editorial/schema";
import type { EditorialRunResponse, EditorialRunSuccess, JudgeId } from "@/lib/types";

/** A split between publish-leaning (publish / publish-with-edits) and hold/reject
 * recommendations. Factored out so the confidence-routing logic (lib/decision.ts)
 * can key off recommendation disagreement specifically, without pulling in the
 * dimension-variance check below. */
export function hasRecommendationSplit(successful: EditorialRunSuccess[]): boolean {
  const recommendations = new Set(successful.map((o) => o.result.recommendation));
  const hasPublishLeaning = recommendations.has("publish") || recommendations.has("publish-with-edits");
  const hasHoldOrReject = recommendations.has("hold") || recommendations.has("reject");
  return hasPublishLeaning && hasHoldOrReject;
}

/** "Aesthetically Contested" per CLAUDE.md: high score variance on any dimension,
 * OR a split between publish-leaning and hold/reject recommendations — a proxy
 * for "highly diverging theses" that doesn't require an extra LLM call just to
 * decide whether disagreement is worth narrating. This never produces a median;
 * it only decides whether to invoke the narrator. */
export function isEditorialContested(outcomes: Record<JudgeId, EditorialRunResponse>): boolean {
  const successful = Object.values(outcomes).filter((o): o is EditorialRunSuccess => o.ok);
  if (successful.length < 2) return false;

  const hasHighVariance = EDITORIAL_ACTIVE_DIMENSIONS.some((dim) => {
    const scores = successful
      .map((o) => o.result.dimensions.find((d) => d.dimensionId === dim.id)?.score)
      .filter((s): s is number => s !== undefined);
    return scores.length >= 2 && stdDev(scores) > CONTESTED_THRESHOLD;
  });
  if (hasHighVariance) return true;

  return hasRecommendationSplit(successful);
}
