import { ApiError, createPartFromBase64, FunctionCallingConfigMode, GoogleGenAI, type Part } from "@google/genai";
import type { JudgeImageInput } from "@/lib/image-input";
import {
  buildEditorialJsonSchema,
  EDITORIAL_SYSTEM_PROMPT,
  EDITORIAL_TOOL_DESCRIPTION,
  EDITORIAL_TOOL_NAME,
  parseEditorialToolInput,
} from "@/lib/editorial/schema";
import type { EditorialRunResponse } from "@/lib/types";

// Same id confirmed live against the real ListModels endpoint on the technical track.
export const GEMINI_MODEL = "gemini-3.1-pro-preview";

const SAFETY_FINISH_REASONS = new Set(["SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST", "SPII", "IMAGE_SAFETY"]);

/** Same lesson applied as the technical track: forced tool-calling (mode ANY)
 * measurably collapsed Gemini's scores there, so this uses AUTO + an explicit
 * "you must call the tool" instruction instead. Whether that's enough for this
 * heavier, 17-field editorial schema is exactly what the mandatory flattening
 * test below checks — it is NOT assumed to carry over. */
export async function callGeminiEditorialJudge(image: JudgeImageInput): Promise<EditorialRunResponse> {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    return { ok: false, category: "missing-key", error: "Gemini key missing or invalid — check .env.local" };
  }

  const part = createPartFromBase64(image.bytes.toString("base64"), image.mediaType);
  const taskText = `Give this image an editorial review. You MUST call ${EDITORIAL_TOOL_NAME} — do not reply in plain text.`;
  const contents: (string | Part)[] = [part, taskText];

  const ai = new GoogleGenAI({ apiKey });

  try {
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents,
      config: {
        systemInstruction: EDITORIAL_SYSTEM_PROMPT,
        tools: [
          {
            functionDeclarations: [
              { name: EDITORIAL_TOOL_NAME, description: EDITORIAL_TOOL_DESCRIPTION, parametersJsonSchema: buildEditorialJsonSchema() },
            ],
          },
        ],
        toolConfig: { functionCallingConfig: { mode: FunctionCallingConfigMode.AUTO } },
      },
    });

    const finishReason = response.candidates?.[0]?.finishReason;
    if (finishReason && SAFETY_FINISH_REASONS.has(finishReason)) {
      return { ok: false, category: "safety-refusal", error: "Gemini declined to evaluate this asset (safety)." };
    }
    if (finishReason === "MALFORMED_FUNCTION_CALL") {
      return { ok: false, category: "malformed-response", error: "Gemini returned an unexpected format — no structured editorial review." };
    }

    const call = response.functionCalls?.[0];
    if (!call?.args) {
      return { ok: false, category: "malformed-response", error: "Gemini returned an unexpected format — no structured editorial review." };
    }

    const result = parseEditorialToolInput(call.args);
    return { ok: true, modelId: GEMINI_MODEL, result };
  } catch (err) {
    return mapGeminiError(err);
  }
}

function mapGeminiError(err: unknown): EditorialRunResponse {
  if (err instanceof ApiError) {
    if (err.status === 401 || err.status === 403) {
      return { ok: false, category: "missing-key", error: "Gemini key missing or invalid — check .env.local" };
    }
    if (err.status === 429) {
      const quotaLike = /quota|billing|credit/i.test(err.message);
      return quotaLike
        ? { ok: false, category: "out-of-credit", error: "Gemini is out of credit — recharge at https://aistudio.google.com" }
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
  if (err instanceof Error && /fetch failed|ECONNRESET|ETIMEDOUT|network/i.test(err.message)) {
    return { ok: false, category: "network", error: "Couldn't reach Gemini — network or timeout." };
  }
  const message = err instanceof Error ? err.message : "Unknown error";
  return { ok: false, category: "unknown", error: `Gemini judge failed: ${message}` };
}
