export type RubricDimensionId =
  | "instruction-adherence"
  | "edit-precision"
  | "identity-preservation"
  | "visual-quality"
  | "text-rendering"
  | "safety-consent";

export interface RubricDimension {
  id: RubricDimensionId;
  label: string;
  description: string;
}

export type JudgeId = "muse-spark" | "claude" | "gpt" | "gemini";

export type JudgeStatus = "idle" | "pending" | "complete" | "error";

export interface Judge {
  id: JudgeId;
  name: string;
  modelId: string;
  role: string;
  status: JudgeStatus;
}

export interface DimensionScore {
  dimensionId: RubricDimensionId;
  consensus: number;
  dissent: number;
  contested: boolean;
  judgeScores: Record<JudgeId, number>;
}

export type FailureCategory =
  | "artifact-bleed"
  | "prompt-drift"
  | "edit-bleed"
  | "identity-drift"
  | "typography"
  | "safety";

export interface RootCauseFinding {
  category: FailureCategory;
  label: string;
  summary: string;
  fix: string;
}

export interface AssetMeta {
  fileName: string;
  source: "upload" | "url" | "generated";
  sourceModel: string;
  dimensions: string;
  addedAt: string;
}

export interface RunSummary {
  id: string;
  label: string;
  overallScore: number;
  status: "pass" | "warning" | "fail";
  timestamp: string;
}

/** The asset currently loaded in the hero pane, lifted to page level so the
 * evaluation engine can send it to a judge without re-reading the DOM. */
export type AssetInput =
  | { kind: "upload"; file: File; previewUrl: string; name: string }
  | { kind: "url"; url: string; name: string };

export interface JudgeDimensionResult {
  dimensionId: RubricDimensionId;
  score: number;
  rationale: string;
}

export interface JudgeRunSuccess {
  ok: true;
  modelId: string;
  results: JudgeDimensionResult[];
}

export interface JudgeRunFailure {
  ok: false;
  error: string;
}

export type JudgeRunResponse = JudgeRunSuccess | JudgeRunFailure;
