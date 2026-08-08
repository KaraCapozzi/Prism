"use client";

import { ChevronDown, ChevronRight, Download, Star, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { RECOMMENDATION_LABEL } from "@/lib/decision";
import {
  GOLDEN_DATASET_UPDATED_EVENT,
  clearGoldenDataset,
  deleteGoldenDatasetEntry,
  exportGoldenDatasetAsJson,
  listGoldenDatasetEntries,
  type GoldenDatasetEntry,
} from "@/lib/golden-dataset";
import type { Recommendation } from "@/lib/types";

const RECOMMENDATION_COLOR: Record<Recommendation, string> = {
  publish: "text-emerald-300",
  "publish-with-edits": "text-sky-300",
  hold: "text-amber-300",
  reject: "text-rose-300",
};

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function GoldenDatasetPanel() {
  const [entries, setEntries] = useState<GoldenDatasetEntry[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    function refresh() {
      setEntries(listGoldenDatasetEntries());
    }
    refresh();
    window.addEventListener(GOLDEN_DATASET_UPDATED_EVENT, refresh);
    return () => window.removeEventListener(GOLDEN_DATASET_UPDATED_EVENT, refresh);
  }, []);

  function handleDelete(id: string) {
    if (!window.confirm("Delete this golden dataset entry?")) return;
    deleteGoldenDatasetEntry(id);
    if (expandedId === id) setExpandedId(null);
  }

  function handleClearAll() {
    if (!window.confirm(`Delete all ${entries.length} golden dataset entries? This can't be undone.`)) return;
    clearGoldenDataset();
    setExpandedId(null);
  }

  return (
    <section className="flex-1">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
          <Star className="h-3.5 w-3.5" />
          Golden dataset ({entries.length})
        </h2>
        {entries.length > 0 && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={exportGoldenDatasetAsJson}
              title="Export all as JSON"
              className="rounded-md p-1 text-zinc-500 hover:bg-zinc-800/70 hover:text-zinc-300"
            >
              <Download className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={handleClearAll}
              title="Clear all"
              className="rounded-md p-1 text-zinc-500 hover:bg-rose-500/15 hover:text-rose-400"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      {entries.length === 0 ? (
        <p className="mt-2 text-[11px] text-zinc-600">
          Saved editorial decisions appear here. Nothing saved yet.
        </p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {entries.map((entry) => {
            const expanded = expandedId === entry.id;
            return (
              <li
                key={entry.id}
                className="rounded-md border border-zinc-800/70 bg-zinc-900/30 px-2.5 py-2"
              >
                <button
                  type="button"
                  onClick={() => setExpandedId(expanded ? null : entry.id)}
                  className="flex w-full items-center justify-between gap-2 text-left"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    {expanded ? (
                      <ChevronDown className="h-3 w-3 shrink-0 text-zinc-600" />
                    ) : (
                      <ChevronRight className="h-3 w-3 shrink-0 text-zinc-600" />
                    )}
                    {entry.asset.thumbnailDataUrl && (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={entry.asset.thumbnailDataUrl}
                        alt=""
                        className="h-6 w-6 shrink-0 rounded object-cover"
                      />
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-zinc-300">{entry.asset.name}</p>
                      <p className="text-[10px] text-zinc-600">{formatTime(entry.timestamp)}</p>
                    </div>
                  </div>
                  <span className={`shrink-0 text-[11px] font-medium ${RECOMMENDATION_COLOR[entry.human.decision]}`}>
                    {RECOMMENDATION_LABEL[entry.human.decision]}
                  </span>
                </button>

                {expanded && (
                  <div className="mt-2.5 space-y-2.5 border-t border-zinc-800 pt-2.5 text-[11px]">
                    <div>
                      <p className="font-medium text-zinc-400">Human decision</p>
                      <p className="mt-0.5 leading-snug text-zinc-500">{entry.human.reason}</p>
                    </div>

                    {entry.technical && (
                      <div>
                        <p className="font-medium text-zinc-400">
                          Technical — {entry.technical.overallScore ?? "—"}/100 ·{" "}
                          {entry.technical.contested ? "contested" : "clean"}
                        </p>
                        <ul className="mt-1 space-y-0.5">
                          {entry.technical.consensus.map((d) => (
                            <li key={d.dimensionId} className="flex justify-between text-zinc-500">
                              <span>{d.dimensionId}</span>
                              <span className="font-mono">{d.consensus}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {entry.editorial ? (
                      <div>
                        <p className="font-medium text-zinc-400">
                          Editorial — {entry.editorial.contested ? "contested" : "agreed"}
                        </p>
                        <ul className="mt-1 space-y-1">
                          {Object.entries(entry.editorial.outcomes).map(([judgeId, outcome]) =>
                            outcome.ok ? (
                              <li key={judgeId} className="text-zinc-500">
                                <span className="text-zinc-400">{judgeId}:</span> &ldquo;{outcome.result.thesis}
                                &rdquo; →{" "}
                                <span className={RECOMMENDATION_COLOR[outcome.result.recommendation]}>
                                  {RECOMMENDATION_LABEL[outcome.result.recommendation]}
                                </span>
                              </li>
                            ) : null,
                          )}
                        </ul>
                      </div>
                    ) : (
                      <p className="text-zinc-600">Editorial Review wasn&apos;t run.</p>
                    )}

                    {entry.learningSignal && (
                      <div>
                        <p className="font-medium text-zinc-400">Learning signal</p>
                        <p className="mt-0.5 text-zinc-500">
                          {entry.learningSignal.tags.length > 0
                            ? entry.learningSignal.tags.join(", ")
                            : "no tags selected"}
                          {entry.learningSignal.otherText ? ` — ${entry.learningSignal.otherText}` : ""}
                        </p>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => handleDelete(entry.id)}
                      className="inline-flex items-center gap-1 text-[11px] text-rose-400 hover:text-rose-300"
                    >
                      <Trash2 className="h-3 w-3" />
                      Delete
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
