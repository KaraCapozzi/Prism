import OpenAI from "openai";
import type { JudgeImageInput } from "@/lib/image-input";
import {
  buildEditorialJsonSchema,
  EDITORIAL_SYSTEM_PROMPT,
  EDITORIAL_TOOL_DESCRIPTION,
  EDITORIAL_TOOL_NAME,
  parseEditorialToolInput,
} from "@/lib/editorial/schema";
import type { EditorialRunResponse } from "@/lib/types";

export interface OpenAICompatibleEditorialConfig {
  apiKey: string | undefined;
  /** Undefined targets the real OpenAI API; set for OpenAI-compatible third-party endpoints. */
  baseURL?: string;
  model: string;
  /** Human name used in error messages, e.g. "GPT" or "Muse Spark". */
  judgeLabel: string;
  rechargeLink?: string;
  /** Shown alongside a missing-key message when there's a second thing to configure (e.g. a base URL). */
  notConfiguredHint?: string;
  /** Set only for models confirmed to default into a reasoning mode incompatible
   * with forced function tools on Chat Completions (confirmed true for gpt-5.6-terra). */
  reasoningEffort?: OpenAI.Chat.Completions.ChatCompletionReasoningEffort;
  /** Default true. Set false for models whose tool_choice only accepts "auto"
   * (confirmed true for Muse Spark). */
  supportsForcedToolChoice?: boolean;
  /** The editorial call is heavier than the technical one (thesis + 5 dimensions
   * + 2 meta-signals + recommendation, ~17 fields) — reasoning models can burn
   * through a lot of budget before ever emitting the structured output. */
  maxCompletionTokens?: number;
}

function toImageUrlPart(img: JudgeImageInput): OpenAI.Chat.Completions.ChatCompletionContentPartImage {
  return {
    type: "image_url",
    image_url: { url: `data:${img.mediaType};base64,${img.bytes.toString("base64")}` },
  };
}

export async function callOpenAICompatibleEditorialJudge(
  config: OpenAICompatibleEditorialConfig,
  image: JudgeImageInput,
): Promise<EditorialRunResponse> {
  const {
    apiKey,
    baseURL,
    model,
    judgeLabel,
    rechargeLink,
    notConfiguredHint,
    reasoningEffort,
    supportsForcedToolChoice = true,
    maxCompletionTokens = 4096,
  } = config;

  if (!apiKey) {
    return {
      ok: false,
      category: "missing-key",
      error: `${judgeLabel} key missing or invalid — check .env.local${notConfiguredHint ? ` (${notConfiguredHint})` : ""}`,
    };
  }

  const client = new OpenAI({ apiKey, baseURL });

  try {
    const completion = await client.chat.completions.create({
      model,
      max_completion_tokens: maxCompletionTokens,
      ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
      messages: [
        { role: "system", content: EDITORIAL_SYSTEM_PROMPT },
        {
          role: "user",
          content: supportsForcedToolChoice
            ? [toImageUrlPart(image), { type: "text", text: "Give this image an editorial review." }]
            : [
                toImageUrlPart(image),
                {
                  type: "text",
                  text: `Give this image an editorial review. You MUST call ${EDITORIAL_TOOL_NAME} — do not reply in plain text.`,
                },
              ],
        },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: EDITORIAL_TOOL_NAME,
            description: EDITORIAL_TOOL_DESCRIPTION,
            parameters: buildEditorialJsonSchema(),
          },
        },
      ],
      tool_choice: supportsForcedToolChoice ? { type: "function", function: { name: EDITORIAL_TOOL_NAME } } : "auto",
    });

    const choice = completion.choices[0];
    if (choice?.finish_reason === "content_filter") {
      return { ok: false, category: "safety-refusal", error: `${judgeLabel} declined to evaluate this asset (safety).` };
    }

    const toolCall = choice?.message?.tool_calls?.[0];
    if (!toolCall || toolCall.type !== "function") {
      return { ok: false, category: "malformed-response", error: `${judgeLabel} returned an unexpected format — no structured editorial review.` };
    }

    let parsedArgs: unknown;
    try {
      parsedArgs = JSON.parse(toolCall.function.arguments);
    } catch {
      return { ok: false, category: "malformed-response", error: `${judgeLabel} returned unparseable JSON.` };
    }

    const result = parseEditorialToolInput(parsedArgs);
    return { ok: true, modelId: model, result };
  } catch (err) {
    return mapOpenAICompatibleEditorialError(err, judgeLabel, rechargeLink);
  }
}

function mapOpenAICompatibleEditorialError(err: unknown, judgeLabel: string, rechargeLink?: string): EditorialRunResponse {
  if (err instanceof OpenAI.APIConnectionError) {
    return { ok: false, category: "network", error: `Couldn't reach ${judgeLabel} — network or timeout.` };
  }
  if (err instanceof OpenAI.APIError) {
    if (err.status === 401 || err.status === 403) {
      return { ok: false, category: "missing-key", error: `${judgeLabel} key missing or invalid — check .env.local` };
    }
    if (err.status === 429) {
      if (err.code === "insufficient_quota") {
        return {
          ok: false,
          category: "out-of-credit",
          error: `${judgeLabel} is out of credit${rechargeLink ? ` — recharge at ${rechargeLink}` : "."}`,
        };
      }
      return { ok: false, category: "rate-limited", error: `${judgeLabel} is rate-limited right now — retry shortly.` };
    }
    if (err.status === 404) {
      return { ok: false, category: "unknown", error: `${judgeLabel} model was not found — verify the model id.` };
    }
    return { ok: false, category: "unknown", error: `${judgeLabel} judge failed: ${err.message}` };
  }
  if (err instanceof Error && err.message.startsWith("Judge response")) {
    return { ok: false, category: "malformed-response", error: `${judgeLabel} returned an unexpected format: ${err.message}` };
  }
  const message = err instanceof Error ? err.message : "Unknown error";
  return { ok: false, category: "unknown", error: `${judgeLabel} judge failed: ${message}` };
}
