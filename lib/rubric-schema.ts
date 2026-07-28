import { RUBRIC_DIMENSIONS } from "./mock-data";
import type { JudgeDimensionResult, RubricDimensionId } from "./types";

/** JSON Schema property names must be valid identifiers; map each kebab-case
 * dimension id to a camelCase key for the tool-use schema. Flat score/rationale
 * pairs (rather than nested per-dimension objects) are far more reliably
 * produced by tool-calling models than deeply nested schemas. */
const DIMENSION_KEYS: Record<RubricDimensionId, string> = {
  "instruction-adherence": "instructionAdherence",
  "edit-precision": "editPrecision",
  "identity-preservation": "identityPreservation",
  "visual-quality": "visualQuality",
  "text-rendering": "textRendering",
  "safety-consent": "safetyConsent",
};

export const RUBRIC_TOOL_NAME = "submit_rubric_scores";

export function buildRubricToolSchema() {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const dim of RUBRIC_DIMENSIONS) {
    const key = DIMENSION_KEYS[dim.id];
    properties[`${key}Score`] = {
      type: "integer",
      minimum: 0,
      maximum: 100,
      description: `${dim.label} score, 0 (total failure) to 100 (flawless) — ${dim.description}`,
    };
    properties[`${key}Rationale`] = {
      type: "string",
      description: `One concise sentence on ${dim.label}, grounded in what you observe in the image.`,
    };
    required.push(`${key}Score`, `${key}Rationale`);
  }

  return {
    name: RUBRIC_TOOL_NAME,
    description:
      "Submit a 0-100 score and one-sentence rationale for each of the six rubric dimensions.",
    input_schema: {
      type: "object" as const,
      properties,
      required,
    },
  };
}

/** Narrow an unknown tool-call input down to the shape we asked for, dimension by dimension. */
export function parseRubricToolInput(input: unknown): JudgeDimensionResult[] {
  if (typeof input !== "object" || input === null) {
    throw new Error("Judge tool call returned no structured input.");
  }
  const record = input as Record<string, unknown>;

  return RUBRIC_DIMENSIONS.map((dim) => {
    const key = DIMENSION_KEYS[dim.id];
    const score = record[`${key}Score`];
    const rationale = record[`${key}Rationale`];
    if (typeof score !== "number" || Number.isNaN(score)) {
      throw new Error(`Judge response has a missing or non-numeric score for "${dim.id}".`);
    }
    if (typeof rationale !== "string" || rationale.trim() === "") {
      throw new Error(`Judge response is missing a rationale for "${dim.id}".`);
    }
    return {
      dimensionId: dim.id,
      score: Math.max(0, Math.min(100, Math.round(score))),
      rationale: rationale.trim(),
    };
  });
}
