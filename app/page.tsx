"use client";

import { useEffect, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { RunContextPanel } from "@/components/panels/RunContextPanel";
import { AssetHeroPanel } from "@/components/panels/AssetHeroPanel";
import { EvaluationEnginePanel } from "@/components/panels/EvaluationEnginePanel";
import type { AssetInput, MultiJudgeRunResponse } from "@/lib/types";

export default function Home() {
  // In edit mode, `asset` doubles as the AFTER image and `beforeAsset` holds
  // the BEFORE image; single-image mode only ever touches `asset`.
  const [asset, setAsset] = useState<AssetInput | null>(null);
  const [beforeAsset, setBeforeAsset] = useState<AssetInput | null>(null);
  const [prompt, setPrompt] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [editorialEnabled, setEditorialEnabled] = useState(false);
  const [runResult, setRunResult] = useState<MultiJudgeRunResponse | null>(null);

  // Object URLs for uploaded files are only valid as long as we hold onto
  // them; revoke the previous one whenever it's replaced or the page unmounts.
  useEffect(() => {
    return () => {
      if (asset?.kind === "upload") URL.revokeObjectURL(asset.previewUrl);
    };
  }, [asset]);

  useEffect(() => {
    return () => {
      if (beforeAsset?.kind === "upload") URL.revokeObjectURL(beforeAsset.previewUrl);
    };
  }, [beforeAsset]);

  // A stale consensus from a previous image/prompt is worse than none — clear
  // it the moment any input that would change the outcome changes.
  function handleAssetChange(next: AssetInput | null) {
    setAsset((prev) => {
      if (prev?.kind === "upload") URL.revokeObjectURL(prev.previewUrl);
      return next;
    });
    setRunResult(null);
  }

  function handleBeforeAssetChange(next: AssetInput | null) {
    setBeforeAsset((prev) => {
      if (prev?.kind === "upload") URL.revokeObjectURL(prev.previewUrl);
      return next;
    });
    setRunResult(null);
  }

  function handlePromptChange(next: string) {
    setPrompt(next);
    setRunResult(null);
  }

  function handleEditModeChange(next: boolean) {
    setEditMode(next);
    setRunResult(null);
  }

  return (
    <div className="flex h-screen flex-col">
      <AppHeader />
      <main className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[320px_1fr_380px]">
        <div className="min-h-0 border-b border-zinc-800 lg:border-b-0 lg:border-r">
          <RunContextPanel />
        </div>
        <div className="min-h-0 border-b border-zinc-800 lg:border-b-0">
          <AssetHeroPanel
            asset={asset}
            onAssetChange={handleAssetChange}
            prompt={prompt}
            onPromptChange={handlePromptChange}
            editMode={editMode}
            onEditModeChange={handleEditModeChange}
            beforeAsset={beforeAsset}
            onBeforeAssetChange={handleBeforeAssetChange}
            consensus={runResult?.consensus ?? null}
            editorialEnabled={editorialEnabled}
            onEditorialEnabledChange={setEditorialEnabled}
          />
        </div>
        <div className="min-h-0">
          <EvaluationEnginePanel
            asset={asset}
            prompt={prompt}
            editMode={editMode}
            beforeAsset={beforeAsset}
            onResult={setRunResult}
            editorialEnabled={editorialEnabled}
          />
        </div>
      </main>
    </div>
  );
}
