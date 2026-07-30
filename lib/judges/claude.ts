import Anthropic from "@anthropic-ai/sdk";
import type { JudgeImageInput } from "@/lib/image-input";
import {
  buildRubricJsonSchema,
  buildSystemPrompt,
  buildTaskText,
  parseRubricToolInput,
  RUBRIC_TOOL_DESCRIPTION,
  RUBRIC_TOOL_NAME,
} from "@/lib/rubric-schema";
import type { EvalMode, JudgeRunResponse } from "@/lib/types";

export const CLAUDE_MODEL = "claude-opus-4-8";
const RECHARGE_LINK = "https://console.anthropic.com";

function toImageBlock(img: JudgeImageInput): Anthropic.ImageBlockParam {
  return {
    type: "image",
    source: {
      type: "base64",
      media_type: img.mediaType as Anthropic.Base64ImageSource["media_type"],
      data: img.bytes.toString("base64"),
    },
  };
}

export interface JudgeCallInput {
  after: JudgeImageInput;
  before: JudgeImageInput | null;
  mode: EvalMode;
  promptText: string | null;
}

export async function callClaudeJudge(input: JudgeCallInput): Promise<JudgeRunResponse> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { ok: false, category: "missing-key", error: "Claude key missing or invalid — check .env.local" };
  }

  const { mode, promptText, after, before } = input;
  const taskText = buildTaskText(mode, promptText);
  const afterBlock = toImageBlock(after);
  const content: Anthropic.ContentBlockParam[] = before
    ? [
        { type: "text", text: "BEFORE image:" },
        toImageBlock(before),
        { type: "text", text: "AFTER image:" },
        afterBlock,
        { type: "text", text: taskText },
      ]
    : [afterBlock, { type: "text", text: taskText }];

  const client = new Anthropic({ apiKey });

  try {
    const message = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 2048,
      system: buildSystemPrompt(mode),
      tools: [{ name: RUBRIC_TOOL_NAME, description: RUBRIC_TOOL_DESCRIPTION, input_schema: buildRubricJsonSchema(mode) }],
      tool_choice: { type: "tool", name: RUBRIC_TOOL_NAME },
      messages: [{ role: "user", content }],
    });

    if (message.stop_reason === "refusal") {
      return { ok: false, category: "safety-refusal", error: "Claude declined to evaluate this asset (safety)." };
    }

    const toolUse = message.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
    );
    if (!toolUse) {
      return { ok: false, category: "malformed-response", error: "Claude returned an unexpected format — no structured evaluation." };
    }

    const results = parseRubricToolInput(toolUse.input, mode);
    return { ok: true, modelId: CLAUDE_MODEL, mode, results };
  } catch (err) {
    return mapClaudeError(err);
  }
}

function mapClaudeError(err: unknown): JudgeRunResponse {
  if (err instanceof Anthropic.APIConnectionError) {
    return { ok: false, category: "network", error: "Couldn't reach Claude — network or timeout." };
  }
  if (err instanceof Anthropic.APIError) {
    switch (err.type) {
      case "authentication_error":
      case "permission_error":
        return { ok: false, category: "missing-key", error: "Claude key missing or invalid — check .env.local" };
      case "billing_error":
        return { ok: false, category: "out-of-credit", error: `Claude is out of credit — recharge at ${RECHARGE_LINK}` };
      case "rate_limit_error":
        return { ok: false, category: "rate-limited", error: "Claude is rate-limited right now — retry shortly." };
      case "overloaded_error":
        return { ok: false, category: "rate-limited", error: "Claude is overloaded right now — retry shortly." };
      case "timeout_error":
        return { ok: false, category: "network", error: "Couldn't reach Claude — network or timeout." };
      case "not_found_error":
        return { ok: false, category: "unknown", error: `Claude model "${CLAUDE_MODEL}" was not found — verify the model id.` };
      default:
        return { ok: false, category: "unknown", error: `Claude judge failed: ${err.message}` };
    }
  }
  if (err instanceof Error && err.message.startsWith("Judge response")) {
    return { ok: false, category: "malformed-response", error: `Claude returned an unexpected format: ${err.message}` };
  }
  const message = err instanceof Error ? err.message : "Unknown error";
  return { ok: false, category: "unknown", error: `Claude judge failed: ${message}` };
}
