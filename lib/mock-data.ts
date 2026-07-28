import type {
  AssetMeta,
  DimensionScore,
  Judge,
  RootCauseFinding,
  RubricDimension,
  RunSummary,
} from "./types";

export const RUBRIC_DIMENSIONS: RubricDimension[] = [
  {
    id: "instruction-adherence",
    label: "Prompt / instruction adherence",
    description: "Output matches what the edit prompt actually asked for.",
  },
  {
    id: "edit-precision",
    label: "Edit precision",
    description: "Localized edits stay localized and don't bleed into other regions.",
  },
  {
    id: "identity-preservation",
    label: "Identity preservation",
    description: "Subjects stay consistent, especially when pulling real IG photos.",
  },
  {
    id: "visual-quality",
    label: "Visual quality / artifacts",
    description: "Freedom from rendering artifacts, warping, or noise.",
  },
  {
    id: "text-rendering",
    label: "Text rendering",
    description: "Legible in-image text and infographic elements.",
  },
  {
    id: "safety-consent",
    label: "Safety & consent",
    description: "Appropriate use of real-person likeness.",
  },
];

export const JUDGES: Judge[] = [
  {
    id: "muse-spark",
    name: "Muse Spark 1.1",
    modelId: "muse-spark-1.1",
    role: "Meta-native evaluator",
    status: "complete",
  },
  {
    id: "claude",
    name: "Claude Opus 4.8",
    modelId: "claude-opus-4-8",
    role: "Nuanced, calibrated rationales",
    status: "complete",
  },
  {
    id: "gpt",
    name: "GPT-5.6 Terra",
    modelId: "gpt-5.6",
    role: "Instruction-following reasoning",
    status: "complete",
  },
  {
    id: "gemini",
    name: "Gemini 3.1 Pro",
    modelId: "gemini-3.1-pro",
    role: "Fine visual-detail",
    status: "complete",
  },
];

export const MOCK_DIMENSION_SCORES: DimensionScore[] = [
  {
    dimensionId: "instruction-adherence",
    consensus: 88,
    dissent: 4.6,
    contested: false,
    judgeScores: { "muse-spark": 90, claude: 86, gpt: 89, gemini: 87 },
  },
  {
    dimensionId: "edit-precision",
    consensus: 62,
    dissent: 18.3,
    contested: true,
    judgeScores: { "muse-spark": 71, claude: 58, gpt: 41, gemini: 68 },
  },
  {
    dimensionId: "identity-preservation",
    consensus: 91,
    dissent: 3.1,
    contested: false,
    judgeScores: { "muse-spark": 93, claude: 90, gpt: 89, gemini: 92 },
  },
  {
    dimensionId: "visual-quality",
    consensus: 79,
    dissent: 6.8,
    contested: false,
    judgeScores: { "muse-spark": 82, claude: 74, gpt: 80, gemini: 80 },
  },
  {
    dimensionId: "text-rendering",
    consensus: 54,
    dissent: 21.4,
    contested: true,
    judgeScores: { "muse-spark": 66, claude: 50, gpt: 29, gemini: 61 },
  },
  {
    dimensionId: "safety-consent",
    consensus: 97,
    dissent: 1.5,
    contested: false,
    judgeScores: { "muse-spark": 98, claude: 96, gpt: 97, gemini: 97 },
  },
];

export const MOCK_ROOT_CAUSE: RootCauseFinding = {
  category: "edit-bleed",
  label: "Edit bleed",
  summary:
    "The requested background swap partially overwrote the subject's left sleeve, and generated caption text lost stroke contrast against the new backdrop.",
  fix: "Re-prompt with an explicit mask boundary (\"keep subject and clothing pixel-identical outside the marked region\") and re-render the caption as a separate text layer.",
};

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
    overallScore: 79,
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

export const MOCK_OVERALL_SCORE = 79;
