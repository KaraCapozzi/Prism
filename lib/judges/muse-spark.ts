import OpenAI from "openai";
import type { JudgeImageInput } from "@/lib/image-input";
import {
  buildRubricJsonSchema,
  buildSystemPrompt,
  buildTaskText,
  parseRubricToolInput,
  RUBRIC_TOOL_NAME,
} from "@/lib/rubric-schema";
import type { JudgeRunResponse } from "@/lib/types";
import type { JudgeCallInput } from "./claude";

export const MUSE_SPARK_MODEL = "muse-spark-1.1";
const RECHARGE_LINK = undefined; // no confirmed billing-portal URL yet

/** Meta's strict json_schema mode requires every property to be listed in
 * `required`; the rubric's genuinely-optional fields (e.g. text-rendering)
 * become nullable instead, so the judge can still omit them by returning null
 * — matching CLAUDE.md's "omit, don't zero" rule without breaking strict mode.
 * The shared parser already treats `null` the same as "absent" (see
 * readDimension in rubric-schema.ts), so no parser changes were needed. */
function toStrictSchema(schema: { type: "object"; properties: Record<string, unknown>; required: string[] }) {
  const properties: Record<string, unknown> = {};
  for (const [key, propSchema] of Object.entries(schema.properties)) {
    if (schema.required.includes(key)) {
      properties[key] = propSchema;
    } else {
      const original = propSchema as Record<string, unknown>;
      properties[key] = { ...original, type: [original.type, "null"] };
    }
  }
  return {
    type: "object" as const,
    properties,
    required: Object.keys(schema.properties),
    additionalProperties: false as const,
  };
}

function toImageUrlPart(img: JudgeImageInput): OpenAI.Chat.Completions.ChatCompletionContentPartImage {
  return {
    type: "image_url",
    image_url: { url: `data:${img.mediaType};base64,${img.bytes.toString("base64")}` },
  };
}

/** Meta Model API — public preview, US developers only, launched 2026-07-09.
 * Confirmed OpenAI-compatible at https://api.meta.ai/v1, set via META_API_BASE_URL
 * in .env.local. Degrades gracefully if that's unset or META_API_KEY is missing.
 *
 * Uses structured output (response_format: json_schema, strict) rather than
 * tool-calling — confirmed live that Muse Spark's tool_choice only accepts
 * "auto", not a forced named call, which made reliable structured output via
 * tools impractical. This path is entirely separate from openai-compatible.ts
 * (GPT's path); nothing here affects GPT. */
export async function callMuseSparkJudge(input: JudgeCallInput): Promise<JudgeRunResponse> {
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

  const { mode, promptText, after, before } = input;
  const taskText = buildTaskText(mode, promptText);
  const userContent: OpenAI.Chat.Completions.ChatCompletionContentPart[] = before
    ? [
        { type: "text", text: "BEFORE image:" },
        toImageUrlPart(before),
        { type: "text", text: "AFTER image:" },
        toImageUrlPart(after),
        { type: "text", text: taskText },
      ]
    : [toImageUrlPart(after), { type: "text", text: taskText }];

  const client = new OpenAI({ apiKey, baseURL });

  try {
    const completion = await client.chat.completions.create({
      model: MUSE_SPARK_MODEL,
      // Confirmed live: Muse Spark spends internal reasoning tokens out of this
      // same budget (seen ranging ~1300-2045 tokens per call), and 2048 wasn't
      // enough headroom — two runs got cut off mid-JSON (finish_reason: "length")
      // with reasoning alone consuming nearly the whole cap. This is a token-
      // budget mechanism issue, not a prompt problem.
      max_completion_tokens: 6144,
      messages: [
        { role: "system", content: buildSystemPrompt(mode) },
        { role: "user", content: userContent },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: RUBRIC_TOOL_NAME,
          schema: toStrictSchema(buildRubricJsonSchema(mode)),
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
      return { ok: false, category: "malformed-response", error: "Muse Spark returned an unexpected format — no structured evaluation." };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      return { ok: false, category: "malformed-response", error: "Muse Spark returned unparseable JSON." };
    }

    const results = parseRubricToolInput(parsed, mode);
    return { ok: true, modelId: MUSE_SPARK_MODEL, mode, results };
  } catch (err) {
    return mapMuseSparkError(err);
  }
}

function mapMuseSparkError(err: unknown): JudgeRunResponse {
  if (err instanceof OpenAI.APIConnectionError) {
    return { ok: false, category: "network", error: "Couldn't reach Muse Spark — network or timeout." };
  }
  if (err instanceof OpenAI.APIError) {
    if (err.status === 401 || err.status === 403) {
      return { ok: false, category: "missing-key", error: "Muse Spark key missing or invalid — check .env.local" };
    }
    if (err.status === 429) {
      if (err.code === "insufficient_quota") {
        return {
          ok: false,
          category: "out-of-credit",
          error: `Muse Spark is out of credit${RECHARGE_LINK ? ` — recharge at ${RECHARGE_LINK}` : "."}`,
        };
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
