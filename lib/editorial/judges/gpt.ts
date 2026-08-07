import type { JudgeImageInput } from "@/lib/image-input";
import type { EditorialRunResponse } from "@/lib/types";
import { callOpenAICompatibleEditorialJudge } from "./openai-compatible";

export const GPT_MODEL = "gpt-5.6-terra";

export async function callGptEditorialJudge(image: JudgeImageInput): Promise<EditorialRunResponse> {
  return callOpenAICompatibleEditorialJudge(
    {
      apiKey: process.env.OPENAI_API_KEY,
      model: GPT_MODEL,
      judgeLabel: "GPT",
      rechargeLink: "https://platform.openai.com/settings/organization/billing",
      // Confirmed live on the technical track: gpt-5.6-terra defaults to a
      // reasoning mode incompatible with forced function tools on Chat Completions.
      reasoningEffort: "none",
    },
    image,
  );
}
