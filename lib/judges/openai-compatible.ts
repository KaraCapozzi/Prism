import OpenAI from "openai";
import type { JudgeImageInput } from "@/lib/image-input";
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

export interface OpenAICompatibleConfig {
  apiKey: string | undefined;
  /** Undefined targets the real OpenAI API; set for OpenAI-compatible third-party endpoints. */
  baseURL?: string;
  model: string;
  /** Human name used in error messages, e.g. "GPT" or "Muse Spark". */
  judgeLabel: string;
  rechargeLink?: string;
  /** Shown alongside a missing-key message when there's a second thing to configure (e.g. a base URL). */
  notConfiguredHint?: string;
  /** Only set this for models that default to a reasoning mode incompatible with
   * forced function tools (confirmed true for gpt-5.6-terra). Sending it to a
   * model that doesn't support the param at all (confirmed true for Muse Spark)
   * is a hard 400, so it's opt-in per judge rather than universal. */
  reasoningEffort?: OpenAI.Chat.Completions.ChatCompletionReasoningEffort;
  /** Default true. Set false for models whose `tool_choice` only accepts "auto"
   * (confirmed true for Muse Spark — forcing a named function is a hard 400
   * there). When false, we fall back to "auto" and lean harder on the prompt
   * to get the tool called anyway. */
  supportsForcedToolChoice?: boolean;
}

function toImageUrlPart(img: JudgeImageInput): OpenAI.Chat.Completions.ChatCompletionContentPartImage {
  return {
    type: "image_url",
    image_url: { url: `data:${img.mediaType};base64,${img.bytes.toString("base64")}` },
  };
}

export async function callOpenAICompatibleJudge(
  config: OpenAICompatibleConfig,
  input: JudgeCallInput,
): Promise<JudgeRunResponse> {
  const {
    apiKey,
    baseURL,
    model,
    judgeLabel,
    rechargeLink,
    notConfiguredHint,
    reasoningEffort,
    supportsForcedToolChoice = true,
  } = config;
  if (!apiKey) {
    return {
      ok: false,
      category: "missing-key",
      error: `${judgeLabel} key missing or invalid — check .env.local${notConfiguredHint ? ` (${notConfiguredHint})` : ""}`,
    };
  }

  const { mode, promptText, after, before } = input;
  const taskText = supportsForcedToolChoice
    ? buildTaskText(mode, promptText)
    : `${buildTaskText(mode, promptText)}\n\nYou MUST respond by calling the ${RUBRIC_TOOL_NAME} function with your evaluation — do not reply in plain text.`;
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
      model,
      // Confirmed via a live call: current OpenAI models reject the legacy
      // `max_tokens` param and require this instead. Muse Spark accepts it fine too.
      max_completion_tokens: 2048,
      ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
      messages: [
        { role: "system", content: buildSystemPrompt(mode) },
        { role: "user", content: userContent },
      ],
      tools: [
        {
          type: "function",
          function: { name: RUBRIC_TOOL_NAME, description: RUBRIC_TOOL_DESCRIPTION, parameters: buildRubricJsonSchema(mode) },
        },
      ],
      tool_choice: supportsForcedToolChoice ? { type: "function", function: { name: RUBRIC_TOOL_NAME } } : "auto",
    });

    const choice = completion.choices[0];
    if (choice?.finish_reason === "content_filter") {
      return { ok: false, category: "safety-refusal", error: `${judgeLabel} declined to evaluate this asset (safety).` };
    }

    const toolCall = choice?.message?.tool_calls?.[0];
    if (!toolCall || toolCall.type !== "function") {
      return { ok: false, category: "malformed-response", error: `${judgeLabel} returned an unexpected format — no structured evaluation.` };
    }

    let parsedArgs: unknown;
    try {
      parsedArgs = JSON.parse(toolCall.function.arguments);
    } catch {
      return { ok: false, category: "malformed-response", error: `${judgeLabel} returned unparseable JSON.` };
    }

    const results = parseRubricToolInput(parsedArgs, mode);
    return { ok: true, modelId: model, mode, results };
  } catch (err) {
    return mapOpenAICompatibleError(err, judgeLabel, rechargeLink);
  }
}

function mapOpenAICompatibleError(err: unknown, judgeLabel: string, rechargeLink?: string): JudgeRunResponse {
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
