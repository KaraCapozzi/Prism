import { RUBRIC_DIMENSIONS } from "./rubric-schema";
import type { ConsensusDimension, JudgeId, JudgeRunResponse, RubricDimensionId } from "./types";

const CONTESTED_THRESHOLD = 15;

function median(nums: number[]): number {
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Population standard deviation — we're measuring the spread of the judges we
 * actually have, not estimating a wider population from a sample. */
function stdDev(nums: number[]): number {
  if (nums.length < 2) return 0;
  const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
  const variance = nums.reduce((a, b) => a + (b - mean) ** 2, 0) / nums.length;
  return Math.sqrt(variance);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Deterministic consensus: median score and standard-deviation dissent, computed
 * per dimension over whichever judges actually scored it. A dimension a judge
 * legitimately omitted (or that judge errored entirely) just isn't in its results —
 * this never zeros anything out, matching the "omit, don't zero" rule. */
export function computeConsensus(
  outcomes: Partial<Record<JudgeId, JudgeRunResponse>>,
): ConsensusDimension[] {
  const byDimension = new Map<RubricDimensionId, Partial<Record<JudgeId, number>>>();

  for (const judgeId of Object.keys(outcomes) as JudgeId[]) {
    const outcome = outcomes[judgeId];
    if (!outcome || !outcome.ok) continue;
    for (const r of outcome.results) {
      const bucket = byDimension.get(r.dimensionId) ?? {};
      bucket[judgeId] = r.score;
      byDimension.set(r.dimensionId, bucket);
    }
  }

  const dims: ConsensusDimension[] = [];
  for (const dim of RUBRIC_DIMENSIONS) {
    const judgeScores = byDimension.get(dim.id);
    if (!judgeScores) continue;
    const scores = Object.values(judgeScores) as number[];
    const dissent = stdDev(scores);
    dims.push({
      dimensionId: dim.id,
      consensus: round1(median(scores)),
      dissent: round1(dissent),
      contested: dissent > CONTESTED_THRESHOLD,
      judgeScores,
    });
  }
  return dims;
}
