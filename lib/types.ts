export type RubricDimensionId =
  | "visual-quality"
  | "photorealism"
  | "text-rendering"
  | "safety-consent"
  | "prompt-adherence"
  | "completeness"
  | "edit-precision"
  | "identity-preservation";

export interface RubricDimension {
  id: RubricDimensionId;
  label: string;
  description: string;
  /** Human-readable input requirement, e.g. "image only" or "before + after + instruction". */
  needs: string;
  /** Which of the three input modes (1: image only, 2: image+prompt, 3: before/after) this scores in. */
  modes: (1 | 2 | 3)[];
}

export type EvalMode = "image-only" | "image-and-prompt" | "before-after";

export type JudgeErrorCategory =
  | "missing-key"
  | "out-of-credit"
  | "rate-limited"
  | "network"
  | "safety-refusal"
  | "malformed-response"
  | "input-error"
  | "unknown";

export type JudgeId = "muse-spark" | "claude" | "gpt" | "gemini";

export type JudgeStatus = "idle" | "pending" | "complete" | "error";

export interface Judge {
  id: JudgeId;
  name: string;
  modelId: string;
  role: string;
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
  mode: EvalMode;
  results: JudgeDimensionResult[];
}

export interface JudgeRunFailure {
  ok: false;
  category: JudgeErrorCategory;
  error: string;
}

export type JudgeRunResponse = JudgeRunSuccess | JudgeRunFailure;

/** Deterministic per-dimension result across whichever judges actually scored
 * it — computed in code (median + standard deviation), never by an LLM. */
export interface ConsensusDimension {
  dimensionId: RubricDimensionId;
  consensus: number;
  dissent: number;
  contested: boolean;
  judgeScores: Partial<Record<JudgeId, number>>;
}

export interface MultiJudgeRunResponse {
  ok: true;
  mode: EvalMode;
  outcomes: Record<JudgeId, JudgeRunResponse>;
  consensus: ConsensusDimension[];
}

/** The /api/judge/run endpoint either rejects the request outright (bad input,
 * before any judge is called) or dispatches to all four judges and returns
 * their combined outcome — never a single generic failure. */
export type RunResponse = MultiJudgeRunResponse | JudgeRunFailure;
