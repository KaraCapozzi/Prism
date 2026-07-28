import { AppHeader } from "@/components/AppHeader";
import { RunContextPanel } from "@/components/panels/RunContextPanel";
import { AssetHeroPanel } from "@/components/panels/AssetHeroPanel";
import { EvaluationEnginePanel } from "@/components/panels/EvaluationEnginePanel";

export default function Home() {
  return (
    <div className="flex h-screen flex-col">
      <AppHeader />
      <main className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[320px_1fr_380px]">
        <div className="min-h-0 border-b border-zinc-800 lg:border-b-0 lg:border-r">
          <RunContextPanel />
        </div>
        <div className="min-h-0 border-b border-zinc-800 lg:border-b-0">
          <AssetHeroPanel />
        </div>
        <div className="min-h-0">
          <EvaluationEnginePanel />
        </div>
      </main>
    </div>
  );
}
