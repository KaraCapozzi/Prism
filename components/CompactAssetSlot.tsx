"use client";

import { AlertCircle, Link2, UploadCloud, X } from "lucide-react";
import { useRef, useState, type ChangeEvent, type DragEvent, type FormEvent } from "react";
import type { AssetInput } from "@/lib/types";

type InputMode = "upload" | "url";

interface CompactAssetSlotProps {
  label: string;
  asset: AssetInput | null;
  onAssetChange: (next: AssetInput | null) => void;
}

export function CompactAssetSlot({ label, asset, onAssetChange }: CompactAssetSlotProps) {
  const [mode, setMode] = useState<InputMode>("upload");
  const [urlDraft, setUrlDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function loadFile(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Not an image.");
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
    setError(wasUrl ? "Couldn't load that URL." : "Couldn't read that file.");
  }

  function clearAsset() {
    onAssetChange(null);
    setUrlDraft("");
    setError(null);
  }

  return (
    <div className="flex h-full w-40 shrink-0 flex-col">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
          {label}
        </span>
        {!asset && (
          <div className="flex gap-0.5">
            <button
              type="button"
              onClick={() => setMode("upload")}
              className={`rounded p-1 ${mode === "upload" ? "bg-indigo-500/20 text-indigo-300" : "text-zinc-600 hover:text-zinc-400"}`}
              aria-label="Upload"
            >
              <UploadCloud className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={() => setMode("url")}
              className={`rounded p-1 ${mode === "url" ? "bg-indigo-500/20 text-indigo-300" : "text-zinc-600 hover:text-zinc-400"}`}
              aria-label="Paste URL"
            >
              <Link2 className="h-3 w-3" />
            </button>
          </div>
        )}
      </div>

      <div
        className="relative flex-1 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/40"
        onDragOver={(e) => {
          if (mode !== "upload" || asset) return;
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={mode === "upload" && !asset ? handleDrop : undefined}
      >
        {asset ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={asset.kind === "upload" ? asset.previewUrl : asset.url}
              alt={asset.name}
              onError={handleImageError}
              className="h-full w-full object-cover"
            />
            <button
              type="button"
              onClick={clearAsset}
              className="absolute right-1 top-1 rounded-full bg-zinc-950/80 p-1 text-zinc-300 ring-1 ring-inset ring-zinc-700 hover:text-white"
            >
              <X className="h-2.5 w-2.5" />
            </button>
          </>
        ) : mode === "upload" ? (
          <div
            onClick={() => fileInputRef.current?.click()}
            className={`flex h-full cursor-pointer flex-col items-center justify-center gap-1 border border-dashed px-2 text-center transition-colors ${
              isDragging ? "border-indigo-400 bg-indigo-500/10" : "border-zinc-700/70 hover:border-zinc-600"
            }`}
          >
            <UploadCloud
              className={`h-4 w-4 ${isDragging ? "text-indigo-400" : "text-zinc-600"}`}
              strokeWidth={1.5}
            />
            <p className="text-[10px] leading-snug text-zinc-500">Click or drop</p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileInputChange}
            />
          </div>
        ) : (
          <form
            onSubmit={handleUrlSubmit}
            className="flex h-full flex-col items-center justify-center gap-1.5 border border-dashed border-zinc-700/70 px-2 text-center"
          >
            <Link2 className="h-4 w-4 text-zinc-600" strokeWidth={1.5} />
            <input
              type="text"
              inputMode="url"
              value={urlDraft}
              onChange={(e) => setUrlDraft(e.target.value)}
              placeholder="image URL"
              className="w-full rounded border border-zinc-700 bg-zinc-950 px-1.5 py-1 text-[10px] text-zinc-200 placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none"
            />
            <button
              type="submit"
              className="rounded bg-indigo-500/15 px-2 py-0.5 text-[10px] font-medium text-indigo-300 ring-1 ring-inset ring-indigo-500/30 hover:bg-indigo-500/25"
            >
              Load
            </button>
          </form>
        )}
      </div>

      {error && (
        <p className="mt-1 flex items-center gap-1 text-[10px] text-rose-400">
          <AlertCircle className="h-2.5 w-2.5 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}
