import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { RUBRIC_DIMENSIONS } from "@/lib/mock-data";
import { buildRubricToolSchema, parseRubricToolInput, RUBRIC_TOOL_NAME } from "@/lib/rubric-schema";
import type { JudgeRunResponse } from "@/lib/types";

export const runtime = "nodejs";

const CLAUDE_MODEL = "claude-opus-4-8";
const MAX_UPLOAD_BYTES = 5_000_000; // ~5MB raw; Anthropic's base64 image cap is ~5MB post-encoding.
const SUPPORTED_MEDIA_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

const SYSTEM_PROMPT = `You are a harsh, precise visual QA evaluator for Meta's Instagram Edits product, reviewing AI-generated/edited images (primarily from Muse Image) against a strict six-dimension rubric. Do not default to high scores — most real outputs have at least one weak dimension. Score only what you can actually see in the image.

Rubric:
${RUBRIC_DIMENSIONS.map((d, i) => `${i + 1}. ${d.label} — ${d.description}`).join("\n")}

Call ${RUBRIC_TOOL_NAME} exactly once with an integer 0-100 score and a one-sentence rationale for every dimension.`;

function errorResponse(message: string, status: number) {
  const body: JudgeRunResponse = { ok: false, error: message };
  return NextResponse.json(body, { status });
}

export async function POST(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return errorResponse(
      "Claude judge is not configured — ANTHROPIC_API_KEY is missing on the server.",
      503,
    );
  }

  let imageBlock: Anthropic.ImageBlockParam;
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const url = formData.get("url");

    let mediaType: string;
    let bytes: Buffer;

    if (file instanceof File) {
      mediaType = file.type;
      if (!SUPPORTED_MEDIA_TYPES.has(mediaType)) {
        return errorResponse(
          `Unsupported image type "${mediaType || "unknown"}" for Claude vision — use JPEG, PNG, GIF, or WEBP.`,
          400,
        );
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        return errorResponse("Image is too large for Claude vision (5MB limit).", 400);
      }
      bytes = Buffer.from(await file.arrayBuffer());
    } else if (typeof url === "string" && url) {
      let parsed: URL;
      try {
        parsed = new URL(url);
      } catch {
        return errorResponse("That's not a valid URL.", 400);
      }
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return errorResponse("Only http/https image URLs are supported.", 400);
      }

      // Fetch it ourselves rather than handing the URL to Anthropic — their
      // server-side image fetcher rejects some perfectly ordinary hosts.
      let fetched: Response;
      try {
        fetched = await fetch(parsed, { signal: AbortSignal.timeout(15_000) });
      } catch {
        return errorResponse("Couldn't reach that URL.", 400);
      }
      if (!fetched.ok) {
        return errorResponse(`That URL returned HTTP ${fetched.status}.`, 400);
      }
      mediaType = (fetched.headers.get("content-type") ?? "").split(";")[0].trim();
      if (!SUPPORTED_MEDIA_TYPES.has(mediaType)) {
        return errorResponse(
          `That URL served "${mediaType || "unknown content"}", not a supported image type (JPEG, PNG, GIF, WEBP).`,
          400,
        );
      }
      const contentLength = Number(fetched.headers.get("content-length") ?? "0");
      if (contentLength > MAX_UPLOAD_BYTES) {
        return errorResponse("Image is too large for Claude vision (5MB limit).", 400);
      }
      bytes = Buffer.from(await fetched.arrayBuffer());
      if (bytes.byteLength > MAX_UPLOAD_BYTES) {
        return errorResponse("Image is too large for Claude vision (5MB limit).", 400);
      }
    } else {
      return errorResponse("No image provided — attach a file or a url field.", 400);
    }

    imageBlock = {
      type: "image",
      source: {
        type: "base64",
        media_type: mediaType as Anthropic.Base64ImageSource["media_type"],
        data: bytes.toString("base64"),
      },
    };
  } catch {
    return errorResponse("Couldn't read the image.", 400);
  }

  const client = new Anthropic({ apiKey });

  try {
    const message = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      tools: [buildRubricToolSchema()],
      tool_choice: { type: "tool", name: RUBRIC_TOOL_NAME },
      messages: [
        {
          role: "user",
          content: [
            imageBlock,
            { type: "text", text: "Evaluate this image against the six rubric dimensions." },
          ],
        },
      ],
    });

    const toolUse = message.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
    );
    if (!toolUse) {
      return errorResponse("Claude didn't return a structured evaluation.", 502);
    }

    const results = parseRubricToolInput(toolUse.input);
    const body: JudgeRunResponse = { ok: true, modelId: CLAUDE_MODEL, results };
    return NextResponse.json(body);
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      if (err.status === 401) {
        return errorResponse("Claude judge rejected the API key.", 502);
      }
      if (err.status === 404) {
        return errorResponse(`Claude model "${CLAUDE_MODEL}" was not found — verify the model id.`, 502);
      }
      if (err.status === 429) {
        return errorResponse("Claude judge is rate-limited right now — try again shortly.", 502);
      }
      return errorResponse(`Claude judge failed: ${err.message}`, 502);
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    return errorResponse(`Claude judge failed: ${message}`, 502);
  }
}
