import { NextResponse } from "next/server";
import { computeConsensus } from "@/lib/consensus";
import { readImage, type JudgeImageInput } from "@/lib/image-input";
import { callClaudeJudge } from "@/lib/judges/claude";
import { callGeminiJudge } from "@/lib/judges/gemini";
import { callGptJudge } from "@/lib/judges/gpt";
import { callMuseSparkJudge } from "@/lib/judges/muse-spark";
import type { EvalMode, JudgeId, JudgeRunFailure, JudgeRunResponse, MultiJudgeRunResponse } from "@/lib/types";

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

  const consensus = computeConsensus(outcomes);
  const body: MultiJudgeRunResponse = { ok: true, mode, outcomes, consensus };
  return NextResponse.json(body);
}
