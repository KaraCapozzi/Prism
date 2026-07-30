import type { JudgeRunResponse } from "@/lib/types";
import { callOpenAICompatibleJudge } from "./openai-compatible";
import type { JudgeCallInput } from "./claude";

// Confirmed against OpenAI's live /v1/models list.
export const GPT_MODEL = "gpt-5.6-terra";

export async function callGptJudge(input: JudgeCallInput): Promise<JudgeRunResponse> {
  return callOpenAICompatibleJudge(
    {
      apiKey: process.env.OPENAI_API_KEY,
      model: GPT_MODEL,
      judgeLabel: "GPT",
      rechargeLink: "https://platform.openai.com/settings/organization/billing",
      // Confirmed live: gpt-5.6-terra defaults to a reasoning mode incompatible
      // with forced function tools on Chat Completions.
      reasoningEffort: "none",
    },
    input,
  );
}
