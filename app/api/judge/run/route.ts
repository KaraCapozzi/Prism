import { NextResponse } from "next/server";
import { computeConsensus, scoresAreFlat } from "@/lib/consensus";
import { readImage, type JudgeImageInput } from "@/lib/image-input";
import { analyzeRootCause, narrateDissent } from "@/lib/insights";
import { callClaudeJudge } from "@/lib/judges/claude";
import { callGeminiJudge } from "@/lib/judges/gemini";
import { callGptJudge } from "@/lib/judges/gpt";
import { callMuseSparkJudge } from "@/lib/judges/muse-spark";
import type {
  DissentNote,
  EvalMode,
  JudgeId,
  JudgeRunFailure,
  JudgeRunResponse,
  MultiJudgeRunResponse,
} from "@/lib/types";

const GEMINI_FLATTENING_REASON = "known limitation — forced-mode flattening";

export const runtime = "nodejs";

function errorAll(message: string, status: number) {
  const body: JudgeRunFailure = { ok: false, category: "input-error", error: message };
  return NextResponse.json(body, { status });
}

export async function POST(request: Request) {
  let afterImage: JudgeImageInput;
  let beforeImage: JudgeImageInput | null = null;
  let mode: EvalMode;
  let promptText: string | null;

  try {
    const formData = await request.formData();
    const promptField = formData.get("prompt");
    promptText = typeof promptField === "string" && promptField.trim() ? promptField.trim() : null;

    const after = await readImage(formData, "file", "url");
    if (!after.present) {
      return errorAll("No image provided — attach a file or a url field.", 400);
    }
    if (!after.ok) {
      return errorAll(after.message, 400);
    }
    afterImage = { mediaType: after.mediaType, bytes: after.bytes };

    const before = await readImage(formData, "beforeFile", "beforeUrl");
    if (before.present) {
      if (!before.ok) {
        return errorAll(`Before image: ${before.message}`, 400);
      }
      if (!promptText) {
        return errorAll("Edit instruction is required when a before image is provided.", 400);
      }
      beforeImage = { mediaType: before.mediaType, bytes: before.bytes };
      mode = "before-after";
    } else {
      mode = promptText ? "image-and-prompt" : "image-only";
    }
  } catch {
    return errorAll("Couldn't read the image.", 400);
  }

  const callInput = { after: afterImage, before: beforeImage, mode, promptText };

  const [claude, gpt, gemini, museSpark] = await Promise.all([
    callClaudeJudge(callInput),
    callGptJudge(callInput),
    callGeminiJudge(callInput),
    callMuseSparkJudge(callInput),
  ]);

  const outcomes: Record<JudgeId, JudgeRunResponse> = {
    claude,
    gpt,
    gemini,
    "muse-spark": museSpark,
  };

  // Gemini's forced-mode flattening only shows up in before-after (8-dimension)
  // mode — single-image mode and the other three judges are never touched here.
  // A flat run is still shown to the user (see UI), just kept out of the median
  // math so it can't drag the consensus toward a number nobody actually judged.
  let excludedFromConsensus: Partial<Record<JudgeId, string>> | undefined;
  const consensusInput: Partial<Record<JudgeId, JudgeRunResponse>> = { ...outcomes };
  if (mode === "before-after" && gemini.ok && scoresAreFlat(gemini.results)) {
    excludedFromConsensus = { gemini: GEMINI_FLATTENING_REASON };
    delete consensusInput.gemini;
  }

  const consensus = computeConsensus(consensusInput);

  const contestedDimensions = consensus.filter((d) => d.contested);
  const dissentNotes: DissentNote[] = await Promise.all(
    contestedDimensions.map(async (d) => ({
      dimensionId: d.dimensionId,
      result: await narrateDissent(d.dimensionId, outcomes),
    })),
  );

  const rootCause = await analyzeRootCause(consensus, outcomes);

  const body: MultiJudgeRunResponse = {
    ok: true,
    mode,
    outcomes,
    consensus,
    ...(excludedFromConsensus ? { excludedFromConsensus } : {}),
    dissentNotes,
    rootCause,
  };
  return NextResponse.json(body);
}
