import { repairLeakedToolFields } from "@/lib/tool-repair";
import type {
  Confidence,
  EditorialDimension,
  EditorialDimensionId,
  EditorialDimensionScore,
  EditorialJudgeResult,
  EditorialRiskLevel,
  Recommendation,
} from "@/lib/types";

export const EDITORIAL_DIMENSIONS: EditorialDimension[] = [
  {
    id: "creative-intent",
    label: "Creative Intent",
    description: "A clear artistic point of view, versus merely satisfying a raw prompt.",
  },
  {
    id: "editorial-effectiveness",
    label: "Editorial Effectiveness",
    description: "Successfully communicates that intent to the audience.",
  },
  {
    id: "audience-resonance",
    label: "Audience Resonance",
    description:
      "Enough curiosity, emotion, novelty, or clarity to stand out in a feed of exceptional creator content — editorial instinct, not engagement metrics.",
  },
  {
    id: "execution-quality",
    label: "Execution Quality",
    description: "Framing, balance, light/color cohesion, finish; intentional style vs. accidental rendering.",
  },
  {
    id: "distinctiveness",
    label: "Distinctiveness vs. Algorithmic Generic",
    description: "Premium creator-tier work vs. statistically common AI-generated patterns.",
  },
  // TODO(video): wire up video input + multimodal audio-visual sync so this can
  // actually be scored. Until then it's always N/A — never evaluate motion on a
  // still image, since the thing being judged simply isn't present.
  {
    id: "motion-cohesion",
    label: "Motion & Temporal Cohesion",
    description: "Video only — temporal/motion coherence across frames. N/A for stills.",
  },
];

// The only dimensions Prism can actually judge today — image input only, no video yet.
export const EDITORIAL_ACTIVE_DIMENSIONS = EDITORIAL_DIMENSIONS.filter((d) => d.id !== "motion-cohesion");

function editorialDimension(id: EditorialDimensionId): EditorialDimension {
  const dim = EDITORIAL_DIMENSIONS.find((d) => d.id === id);
  if (!dim) throw new Error(`Unknown editorial dimension "${id}".`);
  return dim;
}

export function editorialDimensionLabel(id: EditorialDimensionId): string {
  return editorialDimension(id).label;
}

const DIMENSION_KEYS: Record<EditorialDimensionId, string> = {
  "creative-intent": "creativeIntent",
  "editorial-effectiveness": "editorialEffectiveness",
  "audience-resonance": "audienceResonance",
  "execution-quality": "executionQuality",
  distinctiveness: "distinctiveness",
  "motion-cohesion": "motionCohesion",
};

export const EDITORIAL_TOOL_NAME = "submit_editorial_review";
export const EDITORIAL_TOOL_DESCRIPTION =
  "Submit the editorial thesis, per-dimension scores and rationales, confidence, editorial risk, and recommendation.";

const META_FIELDS = [
  "confidence",
  "confidenceReason",
  "editorialRisk",
  "editorialRiskReason",
  "recommendation",
  "recommendationReason",
] as const;

/** Full ordered field list — used both to build the schema (order matters for
 * generation quality: rationale before score, thesis before everything) and to
 * drive the leaked-tool-field repair pass. */
export const EDITORIAL_FIELD_ORDER: string[] = [
  "thesis",
  ...EDITORIAL_ACTIVE_DIMENSIONS.flatMap((d) => {
    const key = DIMENSION_KEYS[d.id];
    return [`${key}Rationale`, `${key}Score`];
  }),
  ...META_FIELDS,
];

/** Plain JSON Schema for the editorial tool's input — provider-agnostic, same
 * shape convention as the technical rubric schema (rationale-before-score per
 * dimension). Every field is required; there's no "omit if inapplicable" here
 * since motion is simply never included for image input. */
export function buildEditorialJsonSchema(): {
  type: "object";
  properties: Record<string, unknown>;
  required: string[];
} {
  const properties: Record<string, unknown> = {
    thesis: {
      type: "string",
      description:
        "One sentence: what is this piece trying to communicate or achieve? Grounded only in observable visual evidence — do not manufacture artistic meaning. If there is no clear intent, say so plainly.",
    },
  };

  for (const dim of EDITORIAL_ACTIVE_DIMENSIONS) {
    const key = DIMENSION_KEYS[dim.id];
    properties[`${key}Rationale`] = {
      type: "string",
      description: `One sentence citing specific visual evidence for ${dim.label}.`,
    };
    properties[`${key}Score`] = {
      type: "integer",
      minimum: 0,
      maximum: 100,
      description: `${dim.label} score, 0-100 — ${dim.description}`,
    };
  }

  properties.confidence = {
    type: "string",
    enum: ["high", "medium", "low"],
    description: "How confident you are in this assessment overall.",
  };
  properties.confidenceReason = { type: "string", description: "One sentence reason for the confidence level." };
  properties.editorialRisk = {
    type: "string",
    enum: ["low", "medium", "high"],
    description: "Publishing risk — derivative or culturally misaligned — separate from safety/content filters.",
  };
  properties.editorialRiskReason = { type: "string", description: "One sentence reason for the risk level." };
  properties.recommendation = {
    type: "string",
    enum: ["publish", "publish-with-edits", "hold", "reject"],
    description: "Your opinion on whether to publish this — not a ruling.",
  };
  properties.recommendationReason = { type: "string", description: "One sentence strategic justification." };

  return { type: "object", properties, required: [...EDITORIAL_FIELD_ORDER] };
}

/** Verbatim anti-invention guard, per spec — do not paraphrase. */
const ANTI_INVENTION_GUARD =
  'Do not manufacture artistic meaning. Base the thesis only on what is visually present. If the piece has no clear intent, say so plainly — "a generic corporate lifestyle layout with no discernible point of view" is a legitimate and valuable thesis, not a failure to find depth.';

/** Verbatim anti-bias guard, per spec — do not paraphrase. */
const ANTI_BIAS_GUARD =
  "Do not converge toward other judges — evaluate independently. Models often favor statistically common patterns; editorial review exists to surface originality alongside technical quality. If multiple interpretations are reasonable, state them explicitly.";

export const EDITORIAL_SYSTEM_PROMPT = `You are an experienced Creative Director and Editorial Reviewer for a major content platform. You are NOT verifying technical correctness or prompt adherence — a separate technical review already covers that. You are judging creative and editorial value: would you, as an editor, choose to publish this? Technical quality asks "Is it correct?" Editorial quality asks "Would I publish this?"

${ANTI_BIAS_GUARD}

Reason from specific visual evidence before scoring. Reward originality and intentional execution — do not reward an image just for being technically flawless, and do not penalize unconventional choices that appear intentional and well executed. State when a judgment is culturally or contextually dependent.

First, write an Editorial Thesis: one sentence answering "What is this piece trying to communicate or achieve?"

${ANTI_INVENTION_GUARD}

Then score these dimensions, 0-100, using these comparative anchors against top-tier curated creator content: 90-100 = indistinguishable from premium creator work; 70-89 = strong, with minor generic tells; 40-69 = competent but generic; 0-39 = overly generic, uninspired, or amateur.

${EDITORIAL_ACTIVE_DIMENSIONS.map((d, i) => `${i + 1}. ${d.label} — ${d.description}`).join("\n")}

For each dimension, write the rationale citing specific visual evidence FIRST, then assign the score consistent with that evidence.

Then provide:
- Confidence: High, Medium, or Low, with a one-sentence reason. You may effectively abstain via Low confidence when intent is ambiguous — surface that, don't hide it.
- Editorial Risk: Low, Medium, or High, with a one-sentence reason — this is PUBLISHING risk (e.g. derivative, culturally misaligned), separate from safety/content filters.
- Recommendation: exactly one of Publish, Publish with Edits, Hold, or Reject, with a one-sentence strategic justification. This is your opinion, not a ruling.

Call ${EDITORIAL_TOOL_NAME} exactly once with all of the above, in this order: thesis, then each dimension's rationale immediately followed by its score, then confidence, editorial risk, and recommendation.`;

const VALID_CONFIDENCE = new Set<Confidence>(["high", "medium", "low"]);
const VALID_RISK = new Set<EditorialRiskLevel>(["low", "medium", "high"]);
const VALID_RECOMMENDATION = new Set<Recommendation>(["publish", "publish-with-edits", "hold", "reject"]);

/** Narrow an unknown tool-call input into a full EditorialJudgeResult. Every
 * field is required (unlike the technical rubric, nothing here is legitimately
 * omittable for image input), so any missing or malformed field is a real
 * malformed-response — after first trying the leaked-tool-field repair pass. */
export function parseEditorialToolInput(rawInput: unknown): EditorialJudgeResult {
  if (typeof rawInput !== "object" || rawInput === null) {
    throw new Error("Judge response is missing structured input.");
  }
  const record = repairLeakedToolFields(rawInput as Record<string, unknown>, EDITORIAL_FIELD_ORDER);

  function str(key: string): string {
    const v = record[key];
    if (typeof v !== "string" || !v.trim()) {
      throw new Error(`Judge response is missing "${key}".`);
    }
    return v.trim();
  }

  const thesis = str("thesis");

  const dimensions: EditorialDimensionScore[] = EDITORIAL_ACTIVE_DIMENSIONS.map((dim) => {
    const key = DIMENSION_KEYS[dim.id];
    const score = record[`${key}Score`];
    if (typeof score !== "number" || Number.isNaN(score)) {
      throw new Error(`Judge response has a missing or non-numeric score for "${dim.id}".`);
    }
    const rationale = str(`${key}Rationale`);
    return { dimensionId: dim.id, score: Math.max(0, Math.min(100, Math.round(score))), rationale };
  });

  const confidence = str("confidence");
  if (!VALID_CONFIDENCE.has(confidence as Confidence)) {
    throw new Error(`Judge response has an invalid confidence value "${confidence}".`);
  }
  const confidenceReason = str("confidenceReason");

  const editorialRisk = str("editorialRisk");
  if (!VALID_RISK.has(editorialRisk as EditorialRiskLevel)) {
    throw new Error(`Judge response has an invalid editorialRisk value "${editorialRisk}".`);
  }
  const editorialRiskReason = str("editorialRiskReason");

  const recommendation = str("recommendation");
  if (!VALID_RECOMMENDATION.has(recommendation as Recommendation)) {
    throw new Error(`Judge response has an invalid recommendation value "${recommendation}".`);
  }
  const recommendationReason = str("recommendationReason");

  return {
    thesis,
    dimensions,
    confidence: confidence as Confidence,
    confidenceReason,
    editorialRisk: editorialRisk as EditorialRiskLevel,
    editorialRiskReason,
    recommendation: recommendation as Recommendation,
    recommendationReason,
  };
}

// TODO(reference-exemplar): pairwise scoring against an optional user-uploaded
// reference/exemplar image — let a judge compare the asset against a chosen
// "this is the bar" image rather than an abstract "premium creator work" anchor.
