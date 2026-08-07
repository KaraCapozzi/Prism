import { NextResponse } from "next/server";
import { isEditorialContested } from "@/lib/editorial/contested";
import { narrateEditorialDissent } from "@/lib/editorial/dissent";
import { callClaudeEditorialJudge } from "@/lib/editorial/judges/claude";
import { callGeminiEditorialJudge } from "@/lib/editorial/judges/gemini";
import { callGptEditorialJudge } from "@/lib/editorial/judges/gpt";
import { callMuseSparkEditorialJudge } from "@/lib/editorial/judges/muse-spark";
import { readImage, type JudgeImageInput } from "@/lib/image-input";
import type { EditorialMultiJudgeResponse, EditorialRunResponse, JudgeId, JudgeRunFailure } from "@/lib/types";

export const runtime = "nodejs";

// This is a completely separate route from /api/judge/run — separate prompts,
// separate schema, separate scoring philosophy. See CLAUDE.md's architectural
// law: the two tracks never share a code path that could blend their outputs.
//
// TODO(spend-guard): once a spend-tracking feature exists, meter these calls
// too — an opt-in editorial run costs roughly $0.20 on top of the technical run.

function errorAll(message: string, status: number) {
  const body: JudgeRunFailure = { ok: false, category: "input-error", error: message };
  return NextResponse.json(body, { status });
}

export async function POST(request: Request) {
  let image: JudgeImageInput;
  try {
    const formData = await request.formData();
    const after = await readImage(formData, "file", "url");
    if (!after.present) {
      return errorAll("No image provided — attach a file or a url field.", 400);
    }
    if (!after.ok) {
      return errorAll(after.message, 400);
    }
    image = { mediaType: after.mediaType, bytes: after.bytes };
  } catch {
    return errorAll("Couldn't read the image.", 400);
  }

  const [claude, gpt, gemini, museSpark] = await Promise.all([
    callClaudeEditorialJudge(image),
    callGptEditorialJudge(image),
    callGeminiEditorialJudge(image),
    callMuseSparkEditorialJudge(image),
  ]);

  const outcomes: Record<JudgeId, EditorialRunResponse> = {
    claude,
    gpt,
    gemini,
    "muse-spark": museSpark,
  };

  const contested = isEditorialContested(outcomes);
  const dissentNote = contested ? await narrateEditorialDissent(outcomes) : null;

  const body: EditorialMultiJudgeResponse = { ok: true, outcomes, contested, dissentNote };
  return NextResponse.json(body);
}
