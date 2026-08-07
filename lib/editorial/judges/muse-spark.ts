import OpenAI from "openai";
import type { JudgeImageInput } from "@/lib/image-input";
import {
  buildEditorialJsonSchema,
  EDITORIAL_SYSTEM_PROMPT,
  EDITORIAL_TOOL_NAME,
  parseEditorialToolInput,
} from "@/lib/editorial/schema";
import type { EditorialRunResponse } from "@/lib/types";

export const MUSE_SPARK_MODEL = "muse-spark-1.1";

function toImageUrlPart(img: JudgeImageInput): OpenAI.Chat.Completions.ChatCompletionContentPartImage {
  return {
    type: "image_url",
    image_url: { url: `data:${img.mediaType};base64,${img.bytes.toString("base64")}` },
  };
}

/** Same lessons applied as the technical track's Muse caller: structured output
 * (response_format json_schema, strict) instead of tool-calling — Muse Spark's
 * tool_choice only accepts "auto" — and a generous token budget, since its
 * internal reasoning tokens come out of the same completion-token cap and this
 * editorial schema (thesis + 5 dimensions + 2 meta-signals + recommendation,
 * ~17 fields) is heavier than the technical one that already needed 6144. */
export async function callMuseSparkEditorialJudge(image: JudgeImageInput): Promise<EditorialRunResponse> {
  const apiKey = process.env.META_API_KEY;
  const baseURL = process.env.META_API_BASE_URL;
  if (!baseURL) {
    return {
      ok: false,
      category: "missing-key",
      error: "Muse Spark base URL not configured — set META_API_BASE_URL in .env.local (see CLAUDE.md).",
    };
  }
  if (!apiKey) {
    return {
      ok: false,
      category: "missing-key",
      error: "Muse Spark key missing or invalid — check .env.local (Meta Model API, US-developer preview)",
    };
  }

  const client = new OpenAI({ apiKey, baseURL });
  const schema = buildEditorialJsonSchema();

  try {
    const completion = await client.chat.completions.create({
      model: MUSE_SPARK_MODEL,
      max_completion_tokens: 10240,
      messages: [
        { role: "system", content: EDITORIAL_SYSTEM_PROMPT },
        {
          role: "user",
          content: [toImageUrlPart(image), { type: "text", text: "Give this image an editorial review." }],
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: EDITORIAL_TOOL_NAME,
          schema: { ...schema, additionalProperties: false },
          strict: true,
        },
      },
    });

    const choice = completion.choices[0];
    if (choice?.finish_reason === "content_filter") {
      return { ok: false, category: "safety-refusal", error: "Muse Spark declined to evaluate this asset (safety)." };
    }

    const content = choice?.message?.content;
    if (!content) {
      return { ok: false, category: "malformed-response", error: "Muse Spark returned an unexpected format — no structured editorial review." };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      return { ok: false, category: "malformed-response", error: "Muse Spark returned unparseable JSON." };
    }

    const result = parseEditorialToolInput(parsed);
    return { ok: true, modelId: MUSE_SPARK_MODEL, result };
  } catch (err) {
    return mapMuseSparkError(err);
  }
}

function mapMuseSparkError(err: unknown): EditorialRunResponse {
  if (err instanceof OpenAI.APIConnectionError) {
    return { ok: false, category: "network", error: "Couldn't reach Muse Spark — network or timeout." };
  }
  if (err instanceof OpenAI.APIError) {
    if (err.status === 401 || err.status === 403) {
      return { ok: false, category: "missing-key", error: "Muse Spark key missing or invalid — check .env.local" };
    }
    if (err.status === 429) {
      if (err.code === "insufficient_quota") {
        return { ok: false, category: "out-of-credit", error: "Muse Spark is out of credit." };
      }
      return { ok: false, category: "rate-limited", error: "Muse Spark is rate-limited right now — retry shortly." };
    }
    if (err.status === 404) {
      return { ok: false, category: "unknown", error: `Muse Spark model "${MUSE_SPARK_MODEL}" was not found — verify the model id.` };
    }
    return { ok: false, category: "unknown", error: `Muse Spark judge failed: ${err.message}` };
  }
  if (err instanceof Error && err.message.startsWith("Judge response")) {
    return { ok: false, category: "malformed-response", error: `Muse Spark returned an unexpected format: ${err.message}` };
  }
  const message = err instanceof Error ? err.message : "Unknown error";
  return { ok: false, category: "unknown", error: `Muse Spark judge failed: ${message}` };
}
