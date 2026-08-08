// Golden Dataset — localStorage-only persistence for saved Editorial Decision runs.
// No database in v1 (see CLAUDE.md). Each entry snapshots technical + editorial +
// human fields together; never a blended score.

import type { ConsensusDimension, EditorialRunResponse, EvalMode, JudgeId, Recommendation } from "@/lib/types";
import type { LearningSignalTag } from "@/lib/decision";

const STORAGE_KEY = "prism:golden-dataset";
export const GOLDEN_DATASET_UPDATED_EVENT = "prism:golden-dataset-updated";

export interface GoldenDatasetAssetRef {
  name: string;
  /** Present only for url-kind assets — an uploaded file's URL is a local blob URL
   * that won't survive a reload, so we don't persist it as a "source". */
  sourceUrl: string | null;
  /** Best-effort downscaled preview. Null if generation failed (e.g. a cross-origin
   * URL that taints the canvas) — the entry is still saved, just without a thumbnail. */
  thumbnailDataUrl: string | null;
}

export interface GoldenDatasetTechnicalSnapshot {
  mode: EvalMode;
  overallScore: number | null;
  contested: boolean;
  consensus: ConsensusDimension[];
}

export interface GoldenDatasetEditorialSnapshot {
  outcomes: Record<JudgeId, EditorialRunResponse>;
  recommendationDistribution: Partial<Record<Recommendation, number>>;
  contested: boolean;
}

export interface GoldenDatasetHumanDecision {
  /** 0-100, the human's own rating — compared against the technical consensus
   * overall score to surface a model-vs-human calibration gap. */
  score: number;
  decision: Recommendation;
  reason: string;
}

export interface GoldenDatasetLearningSignal {
  tags: LearningSignalTag[];
  otherText: string | null;
}

// TODO(multi-reviewer): out of scope for v1 (single-user, no auth). `human` is a
// single decision per entry — adjudicating disagreements across multiple reviewers,
// or escalating to a senior editor, is a future extension of this shape, not this one.
export interface GoldenDatasetEntry {
  id: string;
  timestamp: string;
  asset: GoldenDatasetAssetRef;
  technical: GoldenDatasetTechnicalSnapshot | null;
  editorial: GoldenDatasetEditorialSnapshot | null;
  human: GoldenDatasetHumanDecision;
  /** null when the human agreed with the editorial panel — nothing to explain. */
  learningSignal: GoldenDatasetLearningSignal | null;
}

function isBrowser() {
  return typeof window !== "undefined";
}

export function listGoldenDatasetEntries(): GoldenDatasetEntry[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as GoldenDatasetEntry[];
    return [...parsed].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  } catch {
    return [];
  }
}

export function saveGoldenDatasetEntry(
  entry: Omit<GoldenDatasetEntry, "id" | "timestamp">,
): { ok: true; entry: GoldenDatasetEntry } | { ok: false; error: string } {
  if (!isBrowser()) return { ok: false, error: "Local storage isn't available in this environment." };
  try {
    const full: GoldenDatasetEntry = {
      ...entry,
      id: `gd_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      timestamp: new Date().toISOString(),
    };
    const existing = listGoldenDatasetEntries();
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([full, ...existing]));
    window.dispatchEvent(new Event(GOLDEN_DATASET_UPDATED_EVENT));
    return { ok: true, entry: full };
  } catch {
    return { ok: false, error: "Couldn't save — local storage is full or unavailable." };
  }
}

export function deleteGoldenDatasetEntry(id: string): void {
  if (!isBrowser()) return;
  const remaining = listGoldenDatasetEntries().filter((e) => e.id !== id);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(remaining));
  window.dispatchEvent(new Event(GOLDEN_DATASET_UPDATED_EVENT));
}

export function clearGoldenDataset(): void {
  if (!isBrowser()) return;
  window.localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new Event(GOLDEN_DATASET_UPDATED_EVENT));
}

export function exportGoldenDatasetAsJson(): void {
  if (!isBrowser()) return;
  const entries = listGoldenDatasetEntries();
  const blob = new Blob([JSON.stringify(entries, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `prism-golden-dataset-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Best-effort downscaled thumbnail from an already-loadable image src (blob: or
 * http(s):). Resolves null rather than throwing — a cross-origin URL without CORS
 * headers taints the canvas, which is a normal case here, not a bug. */
export async function assetToThumbnail(src: string, maxDim = 240): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.6));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}
