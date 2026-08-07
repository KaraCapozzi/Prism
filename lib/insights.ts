import Anthropic from "@anthropic-ai/sdk";
import { RUBRIC_DIMENSIONS } from "@/lib/rubric-schema";
import { repairLeakedToolFields } from "@/lib/tool-repair";
import type {
  ConsensusDimension,
  DissentNarrationResult,
  FailureCategory,
  JudgeErrorCategory,
  JudgeId,
  JudgeRunResponse,
  RootCauseResult,
  RubricDimensionId,
} from "@/lib/types";

const SONNET_MODEL = "claude-sonnet-5";
const RECHARGE_LINK = "https://console.anthropic.com";
const FLAWLESS_THRESHOLD = 90; // matches the "90-100 = no observable problems" anchor in the rubric prompt

function dimensionLabel(id: RubricDimensionId): string {
  return RUBRIC_DIMENSIONS.find((d) => d.id === id)?.label ?? id;
}

const JUDGE_LABEL: Record<JudgeId, string> = {
  "muse-spark": "Muse Spark",
  claude: "Claude",
  gpt: "GPT",
  gemini: "Gemini",
};

function mapSonnetError(err: unknown): { category: JudgeErrorCategory; error: string } {
  if (err instanceof Anthropic.APIConnectionError) {
    return { category: "network", error: "Couldn't reach Claude Sonnet — network or timeout." };
  }
  if (err instanceof Anthropic.APIError) {
    switch (err.type) {
      case "authentication_error":
      case "permission_error":
        return { category: "missing-key", error: "Claude key missing or invalid — check .env.local" };
      case "billing_error":
        return { category: "out-of-credit", error: `Claude is out of credit — recharge at ${RECHARGE_LINK}` };
      case "rate_limit_error":
        return { category: "rate-limited", error: "Claude Sonnet is rate-limited right now — retry shortly." };
      case "overloaded_error":
        return { category: "rate-limited", error: "Claude Sonnet is overloaded right now — retry shortly." };
      case "timeout_error":
        return { category: "network", error: "Couldn't reach Claude Sonnet — network or timeout." };
      case "not_found_error":
        return { category: "unknown", error: `Claude Sonnet model "${SONNET_MODEL}" was not found — verify the model id.` };
      default:
        return { category: "unknown", error: `Claude Sonnet failed: ${err.message}` };
    }
  }
  const message = err instanceof Error ? err.message : "Unknown error";
  return { category: "unknown", error: `Claude Sonnet failed: ${message}` };
}

interface JudgeScoreRationale {
  judgeId: JudgeId;
  score: number;
  rationale: string;
}

function collectJudgeScoreRationales(
  dimensionId: RubricDimensionId,
  outcomes: Record<JudgeId, JudgeRunResponse>,
): JudgeScoreRationale[] {
  const out: JudgeScoreRationale[] = [];
  for (const judgeId of Object.keys(outcomes) as JudgeId[]) {
    const outcome = outcomes[judgeId];
    if (!outcome.ok) continue;
    const result = outcome.results.find((r) => r.dimensionId === dimensionId);
    if (result) out.push({ judgeId, score: result.score, rationale: result.rationale });
  }
  return out;
}

/** Narrates a single contested dimension: where the judges diverged, and which
 * view their own rationales better support. Never computes or changes a score —
 * the consensus math is already final by the time this runs. */
export async function narrateDissent(
  dimensionId: RubricDimensionId,
  outcomes: Record<JudgeId, JudgeRunResponse>,
): Promise<DissentNarrationResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { ok: false, category: "missing-key", error: "Claude key missing or invalid — check .env.local" };
  }

  const scores = collectJudgeScoreRationales(dimensionId, outcomes);
  if (scores.length < 2) {
    return { ok: false, category: "unknown", error: "Not enough judge data to narrate dissent." };
  }

  const label = dimensionLabel(dimensionId);
  const judgeLines = scores.map((s) => `${JUDGE_LABEL[s.judgeId]}: ${s.score}/100 — "${s.rationale}"`).join("\n");

  const system = `You narrate disagreements between AI image judges for a quality console. You're given one rubric dimension and every judge's score and one-sentence rationale for it. Write EXACTLY 1-2 plain sentences covering: what the judges apparently disagreed about (what different things they each noticed or weighed), and which view the evidence in their own rationales better supports. Never state or imply what the "correct" score should have been — you only narrate the disagreement, you don't compute or change a score.`;

  const user = `Dimension: ${label}\n\nJudge scores and rationales:\n${judgeLines}\n\nWrite the dissent note now.`;

  const client = new Anthropic({ apiKey });
  try {
    const message = await client.messages.create({
      model: SONNET_MODEL,
      max_tokens: 300,
      system,
      messages: [{ role: "user", content: user }],
    });

    if (message.stop_reason === "refusal") {
      return { ok: false, category: "safety-refusal", error: "Claude Sonnet declined to narrate this dimension (safety)." };
    }

    const textBlock = message.content.find((b): b is Anthropic.TextBlock => b.type === "text");
    if (!textBlock || !textBlock.text.trim()) {
      return { ok: false, category: "malformed-response", error: "Claude Sonnet returned no narration text." };
    }
    return { ok: true, note: textBlock.text.trim() };
  } catch (err) {
    const mapped = mapSonnetError(err);
    return { ok: false, ...mapped };
  }
}

const DIMENSION_TO_CATEGORY: Partial<Record<RubricDimensionId, FailureCategory>> = {
  "visual-quality": "artifact-bleed",
  photorealism: "artifact-bleed",
  "text-rendering": "typography",
  "safety-consent": "safety",
  "prompt-adherence": "prompt-drift",
  completeness: "prompt-drift",
  "edit-precision": "edit-bleed",
  "identity-preservation": "identity-drift",
};

const CATEGORY_LABEL: Record<FailureCategory, string> = {
  "artifact-bleed": "Artifact bleed",
  "prompt-drift": "Prompt drift (omission)",
  "edit-bleed": "Edit bleed",
  "identity-drift": "Identity drift",
  typography: "Typography",
  safety: "Safety",
};

const ROOT_CAUSE_TOOL_NAME = "submit_root_cause";
const ROOT_CAUSE_FIELDS = ["category", "label", "summary", "fix"] as const;

/** Names the single dominant failure category (from whichever categories this
 * run's active dimensions actually map to) plus one concrete fix. Returns null
 * when every dimension is already in the "no observable problems" band — not
 * every run has a failure worth diagnosing. */
export async function analyzeRootCause(
  consensus: ConsensusDimension[],
  outcomes: Record<JudgeId, JudgeRunResponse>,
): Promise<RootCauseResult | null> {
  if (consensus.length === 0) return null;
  if (consensus.every((d) => d.consensus >= FLAWLESS_THRESHOLD)) return null;

  const availableCategories = Array.from(
    new Set(
      consensus
        .map((d) => DIMENSION_TO_CATEGORY[d.dimensionId])
        .filter((c): c is FailureCategory => c !== undefined),
    ),
  );
  if (availableCategories.length === 0) return null;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { ok: false, category: "missing-key", error: "Claude key missing or invalid — check .env.local" };
  }

  const dimensionBlock = consensus
    .map((d) => {
      const label = dimensionLabel(d.dimensionId);
      const rationales = collectJudgeScoreRationales(d.dimensionId, outcomes)
        .map((s) => `    ${JUDGE_LABEL[s.judgeId]} (${s.score}): "${s.rationale}"`)
        .join("\n");
      return `${label} — consensus ${d.consensus}${d.contested ? " (CONTESTED)" : ""}\n${rationales}`;
    })
    .join("\n\n");

  const system = `You are a root-cause analyst for an AI image-evaluation console. Given the consensus scores and every judge's rationale for each dimension of one image, name the SINGLE dominant failure category best explaining the pattern of lower scores, and ONE concrete, specific fix — a prompt-level or edit-level instruction someone could actually apply next time. Only choose from the categories you're given; they're the ones that apply to this run's active dimensions. Ground your summary in the judges' actual rationales, not a generic guess. Call ${ROOT_CAUSE_TOOL_NAME} exactly once.`;

  const user = `Per-dimension consensus and judge rationales:\n\n${dimensionBlock}\n\nAvailable categories: ${availableCategories
    .map((c) => `${c} (${CATEGORY_LABEL[c]})`)
    .join(", ")}`;

  const client = new Anthropic({ apiKey });
  try {
    const message = await client.messages.create({
      model: SONNET_MODEL,
      max_tokens: 500,
      system,
      tools: [
        {
          name: ROOT_CAUSE_TOOL_NAME,
          description: "Submit the dominant root-cause category, a short label, a summary, and one concrete fix.",
          input_schema: {
            type: "object",
            properties: {
              category: {
                type: "string",
                enum: availableCategories,
                description: "The single dominant failure category.",
              },
              label: { type: "string", description: 'Short human label, e.g. "Edit bleed".' },
              summary: {
                type: "string",
                description: "1-2 sentences on what went wrong and why this category, grounded in the judges' rationales.",
              },
              fix: { type: "string", description: "ONE concrete, specific fix — a prompt-level or edit-level instruction." },
            },
            required: ["category", "label", "summary", "fix"],
          },
        },
      ],
      tool_choice: { type: "tool", name: ROOT_CAUSE_TOOL_NAME },
      messages: [{ role: "user", content: user }],
    });

    if (message.stop_reason === "refusal") {
      return { ok: false, category: "safety-refusal", error: "Claude Sonnet declined to analyze this asset (safety)." };
    }

    const toolUse = message.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (!toolUse) {
      return { ok: false, category: "malformed-response", error: "Claude Sonnet returned an unexpected format — no root-cause finding." };
    }

    const input = repairLeakedToolFields(toolUse.input as Record<string, unknown>, ROOT_CAUSE_FIELDS);
    const { category, label, summary, fix } = input;
    if (
      typeof category !== "string" ||
      !availableCategories.includes(category as FailureCategory) ||
      typeof label !== "string" ||
      typeof summary !== "string" ||
      typeof fix !== "string"
    ) {
      return { ok: false, category: "malformed-response", error: "Claude Sonnet returned an incomplete root-cause finding." };
    }

    return { ok: true, finding: { category: category as FailureCategory, label, summary, fix } };
  } catch (err) {
    const mapped = mapSonnetError(err);
    return { ok: false, ...mapped };
  }
}
