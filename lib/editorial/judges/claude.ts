import Anthropic from "@anthropic-ai/sdk";
import type { JudgeImageInput } from "@/lib/image-input";
import {
  buildEditorialJsonSchema,
  EDITORIAL_SYSTEM_PROMPT,
  EDITORIAL_TOOL_DESCRIPTION,
  EDITORIAL_TOOL_NAME,
  parseEditorialToolInput,
} from "@/lib/editorial/schema";
import type { EditorialRunResponse } from "@/lib/types";

export const CLAUDE_MODEL = "claude-opus-4-8";
const RECHARGE_LINK = "https://console.anthropic.com";

export async function callClaudeEditorialJudge(image: JudgeImageInput): Promise<EditorialRunResponse> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { ok: false, category: "missing-key", error: "Claude key missing or invalid — check .env.local" };
  }

  const imageBlock: Anthropic.ImageBlockParam = {
    type: "image",
    source: {
      type: "base64",
      media_type: image.mediaType as Anthropic.Base64ImageSource["media_type"],
      data: image.bytes.toString("base64"),
    },
  };

  const client = new Anthropic({ apiKey });

  try {
    const message = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 3072,
      system: EDITORIAL_SYSTEM_PROMPT,
      tools: [
        {
          name: EDITORIAL_TOOL_NAME,
          description: EDITORIAL_TOOL_DESCRIPTION,
          input_schema: buildEditorialJsonSchema(),
        },
      ],
      tool_choice: { type: "tool", name: EDITORIAL_TOOL_NAME },
      messages: [
        {
          role: "user",
          content: [imageBlock, { type: "text", text: "Give this image an editorial review." }],
        },
      ],
    });

    if (message.stop_reason === "refusal") {
      return { ok: false, category: "safety-refusal", error: "Claude declined to evaluate this asset (safety)." };
    }

    const toolUse = message.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (!toolUse) {
      return { ok: false, category: "malformed-response", error: "Claude returned an unexpected format — no structured editorial review." };
    }

    const result = parseEditorialToolInput(toolUse.input);
    return { ok: true, modelId: CLAUDE_MODEL, result };
  } catch (err) {
    return mapClaudeError(err);
  }
}

function mapClaudeError(err: unknown): EditorialRunResponse {
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
