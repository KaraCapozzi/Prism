"use client";

import { useEffect, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { RunContextPanel } from "@/components/panels/RunContextPanel";
import { AssetHeroPanel } from "@/components/panels/AssetHeroPanel";
import { EvaluationEnginePanel } from "@/components/panels/EvaluationEnginePanel";
import type { AssetInput } from "@/lib/types";

export default function Home() {
  const [asset, setAsset] = useState<AssetInput | null>(null);

  // The object URL for an uploaded file is only valid as long as we hold onto
  // it; revoke the previous one whenever it's replaced or the page unmounts.
  useEffect(() => {
    return () => {
      if (asset?.kind === "upload") URL.revokeObjectURL(asset.previewUrl);
    };
  }, [asset]);

  function handleAssetChange(next: AssetInput | null) {
    setAsset((prev) => {
      if (prev?.kind === "upload") URL.revokeObjectURL(prev.previewUrl);
      return next;
    });
  }

  return (
    <div className="flex h-screen flex-col">
      <AppHeader />
      <main className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[320px_1fr_380px]">
        <div className="min-h-0 border-b border-zinc-800 lg:border-b-0 lg:border-r">
          <RunContextPanel />
        </div>
        <div className="min-h-0 border-b border-zinc-800 lg:border-b-0">
          <AssetHeroPanel asset={asset} onAssetChange={handleAssetChange} />
        </div>
        <div className="min-h-0">
          <EvaluationEnginePanel asset={asset} />
        </div>
      </main>
    </div>
  );
}
