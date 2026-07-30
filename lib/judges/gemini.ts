import { ApiError, createPartFromBase64, FunctionCallingConfigMode, GoogleGenAI, type Part } from "@google/genai";
import {
  buildRubricJsonSchema,
  buildSystemPrompt,
  buildTaskText,
  parseRubricToolInput,
  RUBRIC_TOOL_DESCRIPTION,
  RUBRIC_TOOL_NAME,
} from "@/lib/rubric-schema";
import type { JudgeRunResponse } from "@/lib/types";
import type { JudgeCallInput } from "./claude";

// CLAUDE.md lists "gemini-3.1-pro", but the live ListModels endpoint only
// serves this as "gemini-3.1-pro-preview" — confirmed by a real API call.
export const GEMINI_MODEL = "gemini-3.1-pro-preview";

const SAFETY_FINISH_REASONS = new Set(["SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST", "SPII", "IMAGE_SAFETY"]);

export async function callGeminiJudge(input: JudgeCallInput): Promise<JudgeRunResponse> {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    return { ok: false, category: "missing-key", error: "Gemini key missing or invalid — check .env.local" };
  }

  const { mode, promptText, after, before } = input;
  // Forced tool-calling (mode ANY) measurably collapses this model's scores to a
  // narrow, near-identical range across every dimension regardless of image
  // content — confirmed live: the same image scored 70/70/70/70 under ANY but
  // genuinely differentiated (e.g. 38/38/70, matching real defects) under AUTO.
  // AUTO trades a small chance of no tool call at all for scores that actually
  // reflect the image; that trade is worth it, and a missed call still degrades
  // gracefully via the malformed-response path below.
  const taskText = `${buildTaskText(mode, promptText)}\n\nYou MUST call ${RUBRIC_TOOL_NAME} — do not reply in plain text.`;
  const afterPart = createPartFromBase64(after.bytes.toString("base64"), after.mediaType);
  const contents: (string | Part)[] = before
    ? [
        "BEFORE image:",
        createPartFromBase64(before.bytes.toString("base64"), before.mediaType),
        "AFTER image:",
        afterPart,
        taskText,
      ]
    : [afterPart, taskText];

  const ai = new GoogleGenAI({ apiKey });

  try {
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents,
      config: {
        systemInstruction: buildSystemPrompt(mode),
        tools: [
          {
            functionDeclarations: [
              { name: RUBRIC_TOOL_NAME, description: RUBRIC_TOOL_DESCRIPTION, parametersJsonSchema: buildRubricJsonSchema(mode) },
            ],
          },
        ],
        // allowedFunctionNames is only valid alongside mode ANY — the API 400s
        // if it's set under AUTO, so it's omitted here.
        toolConfig: {
          functionCallingConfig: { mode: FunctionCallingConfigMode.AUTO },
        },
      },
    });

    const finishReason = response.candidates?.[0]?.finishReason;
    if (finishReason && SAFETY_FINISH_REASONS.has(finishReason)) {
      return { ok: false, category: "safety-refusal", error: "Gemini declined to evaluate this asset (safety)." };
    }
    if (finishReason === "MALFORMED_FUNCTION_CALL") {
      return { ok: false, category: "malformed-response", error: "Gemini returned an unexpected format — no structured evaluation." };
    }

    const call = response.functionCalls?.[0];
    if (!call?.args) {
      return { ok: false, category: "malformed-response", error: "Gemini returned an unexpected format — no structured evaluation." };
    }

    const results = parseRubricToolInput(call.args, mode);
    return { ok: true, modelId: GEMINI_MODEL, mode, results };
  } catch (err) {
    return mapGeminiError(err);
  }
}

function mapGeminiError(err: unknown): JudgeRunResponse {
  if (err instanceof ApiError) {
    if (err.status === 401 || err.status === 403) {
      return { ok: false, category: "missing-key", error: "Gemini key missing or invalid — check .env.local" };
    }
    if (err.status === 429) {
      const quotaLike = /quota|billing|credit/i.test(err.message);
      return quotaLike
        ? {
            ok: false,
            category: "out-of-credit",
            error: "Gemini is out of credit — recharge at https://aistudio.google.com",
          }
        : { ok: false, category: "rate-limited", error: "Gemini is rate-limited right now — retry shortly." };
    }
    if (err.status === 404) {
      return { ok: false, category: "unknown", error: `Gemini model "${GEMINI_MODEL}" was not found — verify the model id.` };
    }
    if (err.status >= 500) {
      return { ok: false, category: "network", error: "Couldn't reach Gemini — network or timeout." };
    }
    return { ok: false, category: "unknown", error: `Gemini judge failed: ${err.message}` };
  }
  if (err instanceof Error && err.message.startsWith("Judge response")) {
    return { ok: false, category: "malformed-response", error: `Gemini returned an unexpected format: ${err.message}` };
  }
  const message = err instanceof Error ? err.message : "Unknown error";
  return { ok: false, category: "unknown", error: `Gemini judge failed: ${message}` };
}
