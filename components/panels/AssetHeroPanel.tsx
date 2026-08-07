"use client";

import {
  AlertCircle,
  ArrowLeftRight,
  Link2,
  Palette,
  Sparkles,
  UploadCloud,
  X,
} from "lucide-react";
import {
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
} from "react";
import { CompactAssetSlot } from "@/components/CompactAssetSlot";
import { RUBRIC_DIMENSIONS } from "@/lib/mock-data";
import type { AssetInput, ConsensusDimension } from "@/lib/types";

type InputMode = "upload" | "url" | "generate";

interface AssetHeroPanelProps {
  asset: AssetInput | null;
  onAssetChange: (next: AssetInput | null) => void;
  prompt: string;
  onPromptChange: (next: string) => void;
  editMode: boolean;
  onEditModeChange: (next: boolean) => void;
  beforeAsset: AssetInput | null;
  onBeforeAssetChange: (next: AssetInput | null) => void;
  consensus: ConsensusDimension[] | null;
  editorialEnabled: boolean;
  onEditorialEnabledChange: (next: boolean) => void;
}

const INPUT_MODES: { mode: InputMode; label: string; icon: typeof UploadCloud }[] = [
  { mode: "upload", label: "Upload", icon: UploadCloud },
  { mode: "url", label: "Paste URL", icon: Link2 },
  { mode: "generate", label: "Generate", icon: Sparkles },
];

function labelFor(id: string) {
  return RUBRIC_DIMENSIONS.find((d) => d.id === id)?.label ?? id;
}

export function AssetHeroPanel({
  asset,
  onAssetChange,
  prompt,
  onPromptChange,
  editMode,
  onEditModeChange,
  beforeAsset,
  onBeforeAssetChange,
  consensus,
  editorialEnabled,
  onEditorialEnabledChange,
}: AssetHeroPanelProps) {
  const contestedDimensions = consensus?.filter((d) => d.contested) ?? [];

  const [mode, setMode] = useState<InputMode>("upload");
  const [urlDraft, setUrlDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function loadFile(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("That file isn't an image. Try PNG, JPG, or WEBP.");
      return;
    }
    setError(null);
    onAssetChange({
      kind: "upload",
      file,
      previewUrl: URL.createObjectURL(file),
      name: file.name,
    });
  }

  function handleFileInputChange(e: ChangeEvent<HTMLInputElement>) {
    loadFile(e.target.files?.[0]);
    e.target.value = "";
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    loadFile(e.dataTransfer.files?.[0]);
  }

  function handleUrlSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const url = urlDraft.trim();
    if (!url) return;
    setError(null);
    onAssetChange({ kind: "url", url, name: url });
  }

  function handleImageError() {
    const wasUrl = asset?.kind === "url";
    onAssetChange(null);
    setError(
      wasUrl
        ? "Couldn't load an image from that URL."
        : "That file couldn't be read as an image.",
    );
  }

  function clearAsset() {
    onAssetChange(null);
    setUrlDraft("");
    setError(null);
  }

  return (
    <div className="flex h-full flex-col p-4">
      <div className="flex shrink-0 items-center justify-between">
        <div className="inline-flex items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-900/50 p-1">
          {INPUT_MODES.map(({ mode: m, label, icon: Icon }) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m);
                setError(null);
              }}
              className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                mode === m
                  ? "bg-indigo-500/15 text-indigo-300 ring-1 ring-inset ring-indigo-500/30"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => onEditModeChange(!editMode)}
            className={`ml-1 inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
              editMode
                ? "bg-indigo-500/15 text-indigo-300 ring-1 ring-inset ring-indigo-500/30"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            <ArrowLeftRight className="h-3.5 w-3.5" />
            Edit mode
          </button>
          <button
            type="button"
            onClick={() => onEditorialEnabledChange(!editorialEnabled)}
            className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
              editorialEnabled
                ? "bg-purple-500/15 text-purple-300 ring-1 ring-inset ring-purple-500/30"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
            title="Interpretive review — separate from the technical panel, judges are expected to disagree"
          >
            <Palette className="h-3.5 w-3.5" />
            Editorial Review
          </button>
        </div>
        <span className="rounded-full bg-zinc-900 px-2 py-0.5 text-[11px] font-medium tracking-wide text-zinc-500 ring-1 ring-inset ring-zinc-800">
          {consensus ? "Live consensus" : asset ? "Ready to evaluate" : "No asset loaded"}
        </span>
      </div>

      <div className="mt-3 shrink-0">
        <label className="mb-1 flex items-center justify-between text-[11px] font-medium text-zinc-500">
          <span>
            {editMode ? "Edit instruction" : "Prompt (optional)"}
            {editMode && <span className="text-rose-400"> *</span>}
          </span>
          <span className="text-zinc-600">
            {editMode
              ? "required — activates edit precision + identity preservation"
              : prompt.trim()
                ? "scoring adherence + completeness too"
                : "blank = intrinsic quality only"}
          </span>
        </label>
        <input
          type="text"
          value={prompt}
          onChange={(e) => onPromptChange(e.target.value)}
          placeholder={
            editMode
              ? 'What was the edit supposed to do? e.g. "remove the person in the background"'
              : 'What was this image supposed to do? e.g. "add a birthday hat on the dog"'
          }
          className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-2.5 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none"
        />
      </div>

      <div className="mt-3 flex flex-1 gap-3 overflow-hidden">
        {editMode && (
          <CompactAssetSlot label="Before" asset={beforeAsset} onAssetChange={onBeforeAssetChange} />
        )}
        <div
          className="relative flex flex-1 items-center justify-center overflow-hidden rounded-xl border border-zinc-800 bg-gradient-to-br from-zinc-900 via-zinc-950 to-zinc-900"
          onDragOver={(e) => {
            if (mode !== "upload" || asset) return;
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={mode === "upload" && !asset ? handleDrop : undefined}
        >
          <div className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:linear-gradient(to_right,#71717a_1px,transparent_1px),linear-gradient(to_bottom,#71717a_1px,transparent_1px)] [background-size:24px_24px]" />

          {asset ? (
            <div className="relative inline-block max-h-full max-w-full">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={asset.kind === "upload" ? asset.previewUrl : asset.url}
                alt={asset.name}
                onError={handleImageError}
                className="max-h-[calc(100vh-16rem)] max-w-full rounded-lg object-contain shadow-2xl shadow-black/40"
              />

              <button
                type="button"
                onClick={clearAsset}
                className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-zinc-950/80 px-2 py-1 text-[11px] font-medium text-zinc-300 ring-1 ring-inset ring-zinc-700 backdrop-blur hover:text-white"
              >
                <X className="h-3 w-3" />
                Replace
              </button>

              <div className="absolute bottom-2 left-2 max-w-[80%] truncate rounded-md bg-zinc-950/80 px-2 py-1 font-mono text-[11px] text-zinc-400 backdrop-blur">
                {editMode && <span className="text-indigo-300">AFTER · </span>}
                {asset.name} · {asset.kind === "upload" ? "uploaded" : "pasted URL"}
              </div>
            </div>
          ) : mode === "upload" ? (
            <div
              onClick={() => fileInputRef.current?.click()}
              className={`relative flex aspect-[4/5] max-h-full w-auto cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-10 text-center transition-colors ${
                isDragging
                  ? "border-indigo-400 bg-indigo-500/10"
                  : "border-zinc-700/70 bg-zinc-900/40 hover:border-zinc-600"
              }`}
            >
              <UploadCloud
                className={`h-8 w-8 ${isDragging ? "text-indigo-400" : "text-zinc-600"}`}
                strokeWidth={1.5}
              />
              <p className="text-xs text-zinc-400">
                Drag &amp; drop an image, or click to browse
              </p>
              <p className="text-[11px] text-zinc-600">PNG, JPG, WEBP</p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileInputChange}
              />
            </div>
          ) : mode === "url" ? (
            <form
              onSubmit={handleUrlSubmit}
              className="relative flex aspect-[4/5] max-h-full w-full max-w-sm flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-zinc-700/70 bg-zinc-900/40 px-8 text-center"
            >
              <Link2 className="h-8 w-8 text-zinc-600" strokeWidth={1.5} />
              <p className="text-xs text-zinc-400">Paste a direct image URL</p>
              <div className="flex w-full items-center gap-2">
                <input
                  type="text"
                  inputMode="url"
                  value={urlDraft}
                  onChange={(e) => setUrlDraft(e.target.value)}
                  placeholder="https://example.com/image.png"
                  className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-2.5 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none"
                />
                <button
                  type="submit"
                  className="shrink-0 rounded-md bg-indigo-500/15 px-2.5 py-1.5 text-xs font-medium text-indigo-300 ring-1 ring-inset ring-indigo-500/30 hover:bg-indigo-500/25"
                >
                  Load
                </button>
              </div>
            </form>
          ) : (
            <div className="relative flex aspect-[4/5] max-h-full w-auto flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-zinc-800 bg-zinc-900/20 px-10 text-center">
              <Sparkles className="h-8 w-8 text-zinc-700" strokeWidth={1.5} />
              <p className="text-xs text-zinc-500">On-demand generation</p>
              <p className="text-[11px] text-zinc-600">
                gpt-image-2 / Nano Banana Pro — arrives in milestone 6
              </p>
            </div>
          )}
        </div>
      </div>

      {error && (
        <p className="mt-2 flex shrink-0 items-center gap-1.5 text-xs text-rose-400">
          <AlertCircle className="h-3.5 w-3.5" />
          {error}
        </p>
      )}

      {contestedDimensions.length > 0 && (
        <div className="mt-4 flex shrink-0 flex-wrap items-center gap-2">
          {contestedDimensions.map((d) => (
            <span
              key={d.dimensionId}
              className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-400 ring-1 ring-inset ring-amber-500/30"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
              Contested — {labelFor(d.dimensionId)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
