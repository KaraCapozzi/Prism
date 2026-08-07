import Anthropic from "@anthropic-ai/sdk";
import { editorialDimensionLabel } from "@/lib/editorial/schema";
import type { DissentNarrationResult, EditorialRunResponse, EditorialRunSuccess, JudgeErrorCategory, JudgeId } from "@/lib/types";

const SONNET_MODEL = "claude-sonnet-5";
const RECHARGE_LINK = "https://console.anthropic.com";

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

const RECOMMENDATION_LABEL: Record<string, string> = {
  publish: "Publish",
  "publish-with-edits": "Publish with Edits",
  hold: "Hold",
  reject: "Reject",
};

/** Maps WHERE and WHY the editorial judges' creative reads diverged — thesis,
 * per-dimension scores, and recommendation — grounded in their own stated
 * rationales. Never declares a winner: editorial disagreement is the intended
 * output of this track, not a defect to resolve. Sonnet narrates only; it is
 * never an editorial judge itself (it would be grading its own panel). */
export async function narrateEditorialDissent(
  outcomes: Record<JudgeId, EditorialRunResponse>,
): Promise<DissentNarrationResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { ok: false, category: "missing-key", error: "Claude key missing or invalid — check .env.local" };
  }

  const successful = (Object.keys(outcomes) as JudgeId[])
    .map((id) => ({ id, outcome: outcomes[id] }))
    .filter((x): x is { id: JudgeId; outcome: EditorialRunSuccess } => x.outcome.ok);

  if (successful.length < 2) {
    return { ok: false, category: "unknown", error: "Not enough judge data to narrate dissent." };
  }

  const judgeBlock = successful
    .map(({ id, outcome }) => {
      const r = outcome.result;
      const dims = r.dimensions.map((d) => `${editorialDimensionLabel(d.dimensionId)} ${d.score} ("${d.rationale}")`).join("; ");
      return `${JUDGE_LABEL[id]}\nThesis: "${r.thesis}"\nDimensions: ${dims}\nRecommendation: ${RECOMMENDATION_LABEL[r.recommendation]} ("${r.recommendationReason}")`;
    })
    .join("\n\n");

  const system = `You narrate creative disagreements between AI editorial judges for a quality console. You're given each judge's Editorial Thesis, per-dimension scores and rationales, and Recommendation for the same image. Write EXACTLY 2-3 plain sentences mapping WHERE the judges' creative readings diverge (e.g. one read intentional satire, another read generic/algorithmic output) and WHY, grounded in their own stated theses and rationales. Never declare which judge is "right" and never suggest a combined or averaged verdict — editorial disagreement is expected and valuable here, not a defect to resolve. You only map the divergence.`;

  const user = `Judges' editorial reviews:\n\n${judgeBlock}\n\nMap the divergence now.`;

  const client = new Anthropic({ apiKey });
  try {
    const message = await client.messages.create({
      model: SONNET_MODEL,
      max_tokens: 400,
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
