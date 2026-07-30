import type { EvalMode, JudgeDimensionResult, RubricDimension, RubricDimensionId } from "./types";

export const RUBRIC_DIMENSIONS: RubricDimension[] = [
  {
    id: "visual-quality",
    label: "Visual quality / artifacts",
    description: "Freedom from rendering artifacts, warping, or noise.",
    needs: "image only",
    modes: [1, 2, 3],
  },
  {
    id: "photorealism",
    label: "Photorealism / execution",
    description:
      "Realism, only when realism is clearly intended; for illustration or cartoon styles, judge stylistic execution instead.",
    needs: "image only",
    modes: [1, 2, 3],
  },
  {
    id: "text-rendering",
    label: "Text rendering",
    description: "Legible in-image text — automatically skipped if the image has no text.",
    needs: "image only",
    modes: [1, 2, 3],
  },
  {
    id: "safety-consent",
    label: "Safety & consent",
    description: "Appropriate use of real-person likeness.",
    needs: "image only",
    modes: [1, 2, 3],
  },
  {
    id: "prompt-adherence",
    label: "Prompt / instruction adherence",
    description: "Output matches what was actually asked for.",
    needs: "image + prompt",
    modes: [2, 3],
  },
  {
    id: "completeness",
    label: "Completeness",
    description: "Everything the prompt asked for is present.",
    needs: "image + prompt",
    modes: [2, 3],
  },
  {
    id: "edit-precision",
    label: "Edit precision",
    description: "The requested change happened, and stayed contained instead of bleeding into the rest of the image.",
    needs: "before + after + instruction",
    modes: [3],
  },
  {
    id: "identity-preservation",
    label: "Identity preservation",
    description: "Subjects stay consistent between the before and after image.",
    needs: "before + after",
    modes: [3],
  },
];

function dimension(id: RubricDimensionId): RubricDimension {
  const dim = RUBRIC_DIMENSIONS.find((d) => d.id === id);
  if (!dim) throw new Error(`Unknown rubric dimension "${id}".`);
  return dim;
}

/** JSON Schema property names must be valid identifiers; map each kebab-case
 * dimension id to a camelCase key. Flat score/rationale pairs (rather than
 * nested per-dimension objects) are far more reliably produced by tool-calling
 * models than deeply nested schemas. */
const DIMENSION_KEYS: Record<RubricDimensionId, string> = {
  "visual-quality": "visualQuality",
  photorealism: "photorealism",
  "text-rendering": "textRendering",
  "safety-consent": "safetyConsent",
  "prompt-adherence": "promptAdherence",
  completeness: "completeness",
  "edit-precision": "editPrecision",
  "identity-preservation": "identityPreservation",
};

const ALWAYS_REQUIRED: RubricDimensionId[] = ["visual-quality", "photorealism", "safety-consent"];
/** Scored in every mode, but the judge may legitimately leave it out — never forced to 0. */
const CONDITIONALLY_OPTIONAL: RubricDimensionId[] = ["text-rendering"];
/** Required whenever there's instructional text to check against — a prompt in
 * mode 2, or the edit instruction in mode 3. */
const PROMPT_REQUIRED: RubricDimensionId[] = ["prompt-adherence", "completeness"];
const EDIT_REQUIRED: RubricDimensionId[] = ["edit-precision", "identity-preservation"];

export function activeDimensionsForMode(mode: EvalMode): {
  required: RubricDimensionId[];
  optional: RubricDimensionId[];
} {
  if (mode === "before-after") {
    return {
      required: [...ALWAYS_REQUIRED, ...PROMPT_REQUIRED, ...EDIT_REQUIRED],
      optional: CONDITIONALLY_OPTIONAL,
    };
  }
  const required =
    mode === "image-and-prompt" ? [...ALWAYS_REQUIRED, ...PROMPT_REQUIRED] : [...ALWAYS_REQUIRED];
  return { required, optional: CONDITIONALLY_OPTIONAL };
}

export const RUBRIC_TOOL_NAME = "submit_rubric_scores";
export const RUBRIC_TOOL_DESCRIPTION =
  "Submit a 0-100 score and one-sentence rationale for each active rubric dimension. Omit a dimension's score and rationale entirely if it doesn't apply.";

/** Plain JSON Schema for the rubric tool's input — provider-agnostic. Each judge
 * caller wraps this in whatever tool/function envelope its own SDK expects. */
export function buildRubricJsonSchema(mode: EvalMode): {
  type: "object";
  properties: Record<string, unknown>;
  required: string[];
} {
  const { required, optional } = activeDimensionsForMode(mode);
  const properties: Record<string, unknown> = {};
  const requiredKeys: string[] = [];

  for (const id of [...required, ...optional]) {
    const dim = dimension(id);
    const key = DIMENSION_KEYS[id];
    // Rationale is declared before Score so the model reasons in text before
    // committing a number — reordering only, parsing is by key name and is
    // unaffected (see readDimension below).
    properties[`${key}Rationale`] = {
      type: "string",
      description: `One concise sentence on ${dim.label}, grounded in what you actually observe.`,
    };
    properties[`${key}Score`] = {
      type: "integer",
      minimum: 0,
      maximum: 100,
      description: `${dim.label} score, 0 (total failure) to 100 (flawless) — ${dim.description}`,
    };
    if (required.includes(id)) requiredKeys.push(`${key}Rationale`, `${key}Score`);
  }

  return { type: "object", properties, required: requiredKeys };
}

function readDimension(
  record: Record<string, unknown>,
  id: RubricDimensionId,
  required: boolean,
): JudgeDimensionResult | null {
  const key = DIMENSION_KEYS[id];
  const score = record[`${key}Score`];
  const rationale = record[`${key}Rationale`];
  const scorePresent = score !== undefined && score !== null;
  const rationalePresent = rationale !== undefined && rationale !== null;

  if (!scorePresent && !rationalePresent) {
    if (required) throw new Error(`Judge response is missing required dimension "${id}".`);
    return null;
  }
  if (typeof score !== "number" || Number.isNaN(score)) {
    throw new Error(`Judge response has a missing or non-numeric score for "${id}".`);
  }
  if (typeof rationale !== "string" || rationale.trim() === "") {
    throw new Error(`Judge response is missing a rationale for "${id}".`);
  }
  return {
    dimensionId: id,
    score: Math.max(0, Math.min(100, Math.round(score))),
    rationale: rationale.trim(),
  };
}

/** Narrow an unknown tool-call input down to the dimensions active for this mode.
 * Required dimensions that are missing are a malformed response (the judge didn't
 * follow instructions). Optional dimensions (text-rendering) may be legitimately
 * absent — that's the "omit, don't zero" rule from CLAUDE.md, not an error. */
export function parseRubricToolInput(input: unknown, mode: EvalMode): JudgeDimensionResult[] {
  if (typeof input !== "object" || input === null) {
    throw new Error("Judge tool call returned no structured input.");
  }
  const record = input as Record<string, unknown>;
  const { required, optional } = activeDimensionsForMode(mode);

  const results: JudgeDimensionResult[] = [];
  for (const id of required) {
    const result = readDimension(record, id, true);
    if (result) results.push(result);
  }
  for (const id of optional) {
    const result = readDimension(record, id, false);
    if (result) results.push(result);
  }
  return results;
}

export function buildSystemPrompt(mode: EvalMode): string {
  const { required, optional } = activeDimensionsForMode(mode);
  const activeDims = [...required, ...optional].map(dimension);

  const modeLine =
    mode === "before-after"
      ? "Mode: before/after edit. You'll be shown a BEFORE image, an AFTER image, and the edit instruction that was supposed to turn BEFORE into AFTER. Score the AFTER image's intrinsic quality and how well it followed the instruction, PLUS whether the edit stayed contained instead of bleeding into unrelated areas (edit precision), and whether everything not part of the edit — especially any people — stayed visually the same between the two images (identity preservation)."
      : mode === "image-and-prompt"
        ? "Mode: image + prompt. Score both intrinsic quality and how well the image matches the prompt you're given below."
        : "Mode: image only, no prompt was given. Score intrinsic quality only — there is nothing to check adherence against.";

  const optionalNote = optional
    .map((id) => dimension(id))
    .map(
      (dim) =>
        `"${dim.label}" is optional: leave out both its score and rationale entirely if the image has no text to judge.`,
    )
    .join(" ");

  return `You are a harsh, precise visual QA evaluator for Meta's Instagram Edits product, reviewing AI-generated/edited images (primarily from Muse Image) against a rubric.

Score each dimension using only what is observable in the image. Do not assume the output is good or bad before examining it — some images are genuinely flawless, some genuinely broken.

Use the full 0-100 scale by these anchors: 90-100 = no observable problems; 70-89 = minor issues that don't meaningfully impair the result; 40-69 = clear, noticeable problems; 0-39 = severe failure.

Score each dimension only on its own criterion; one dimension must not influence another. If dimensions are genuinely equal, equal scores are correct — do not invent differences.

For each dimension, FIRST write the rationale naming the specific thing you observed, THEN assign the score consistent with that observation and the anchors.

${modeLine}

Score ONLY these dimensions — do not include any dimension not listed here:
${activeDims.map((d, i) => `${i + 1}. ${d.label} — ${d.description}`).join("\n")}

${optionalNote}

Call ${RUBRIC_TOOL_NAME} exactly once with an integer 0-100 score and a one-sentence rationale for every dimension listed above (except any optional one you're deliberately omitting).`;
}

/** The final task instruction appended after the image(s) in every judge's user
 * message — identical across providers, so it lives here rather than duplicated. */
export function buildTaskText(mode: EvalMode, promptText: string | null): string {
  if (mode === "before-after") {
    return `Edit instruction: "${promptText}"\n\nEvaluate the AFTER image.`;
  }
  if (mode === "image-and-prompt") {
    return `The prompt given for this image was: "${promptText}"\n\nEvaluate this image.`;
  }
  return "No prompt was given for this image. Evaluate it on intrinsic quality alone.";
}
