import { RUBRIC_DIMENSIONS } from "./rubric-schema";
import type { AssetMeta, Judge, RunSummary } from "./types";

export { RUBRIC_DIMENSIONS };

export const JUDGES: Judge[] = [
  {
    id: "muse-spark",
    name: "Muse Spark 1.1",
    modelId: "muse-spark-1.1",
    role: "Meta-native evaluator",
  },
  {
    id: "claude",
    name: "Claude Opus 4.8",
    modelId: "claude-opus-4-8",
    role: "Nuanced, calibrated rationales",
  },
  {
    id: "gpt",
    name: "GPT-5.6 Terra",
    modelId: "gpt-5.6-terra",
    role: "Instruction-following reasoning",
  },
  {
    id: "gemini",
    name: "Gemini 3.1 Pro",
    modelId: "gemini-3.1-pro-preview",
    role: "Fine visual-detail",
  },
];

export const MOCK_ASSET: AssetMeta = {
  fileName: "edits_muse_export_014.png",
  source: "upload",
  sourceModel: "Muse Image",
  dimensions: "1080 × 1350",
  addedAt: "2026-07-27T14:32:00Z",
};

export const MOCK_RUN_HISTORY: RunSummary[] = [
  {
    id: "run-014",
    label: "edits_muse_export_014.png",
    overallScore: 76,
    status: "warning",
    timestamp: "2026-07-27T14:32:00Z",
  },
  {
    id: "run-013",
    label: "edits_muse_export_013.png",
    overallScore: 94,
    status: "pass",
    timestamp: "2026-07-27T11:08:00Z",
  },
  {
    id: "run-012",
    label: "muse_video_frame_09.png",
    overallScore: 38,
    status: "fail",
    timestamp: "2026-07-26T19:47:00Z",
  },
  {
    id: "run-011",
    label: "edits_muse_export_011.png",
    overallScore: 86,
    status: "pass",
    timestamp: "2026-07-26T16:02:00Z",
  },
];
