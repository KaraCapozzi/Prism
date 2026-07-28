"use client";

import {
  AlertCircle,
  Link2,
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
import { MOCK_DIMENSION_SCORES, RUBRIC_DIMENSIONS } from "@/lib/mock-data";

type InputMode = "upload" | "url" | "generate";

interface LoadedAsset {
  src: string;
  name: string;
  source: "upload" | "url";
  isObjectUrl: boolean;
}

const INPUT_MODES: { mode: InputMode; label: string; icon: typeof UploadCloud }[] = [
  { mode: "upload", label: "Upload", icon: UploadCloud },
  { mode: "url", label: "Paste URL", icon: Link2 },
  { mode: "generate", label: "Generate", icon: Sparkles },
];

const ANNOTATIONS = [
  { dimensionId: "edit-precision" as const, top: "38%", left: "62%" },
  { dimensionId: "text-rendering" as const, top: "78%", left: "24%" },
];

function labelFor(id: string) {
  return RUBRIC_DIMENSIONS.find((d) => d.id === id)?.label ?? id;
}

export function AssetHeroPanel() {
  const contestedScores = MOCK_DIMENSION_SCORES.filter((d) => d.contested);

  const [mode, setMode] = useState<InputMode>("upload");
  const [asset, setAsset] = useState<LoadedAsset | null>(null);
  const [urlDraft, setUrlDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function replaceAsset(next: LoadedAsset) {
    setAsset((prev) => {
      if (prev?.isObjectUrl) URL.revokeObjectURL(prev.src);
      return next;
    });
    setError(null);
  }

  function loadFile(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("That file isn't an image. Try PNG, JPG, or WEBP.");
      return;
    }
    replaceAsset({
      src: URL.createObjectURL(file),
      name: file.name,
      source: "upload",
      isObjectUrl: true,
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
    replaceAsset({ src: url, name: url, source: "url", isObjectUrl: false });
  }

  function handleImageError() {
    setAsset((prev) => {
      if (prev?.isObjectUrl) URL.revokeObjectURL(prev.src);
      return null;
    });
    setError(
      asset?.source === "url"
        ? "Couldn't load an image from that URL."
        : "That file couldn't be read as an image.",
    );
  }

  function clearAsset() {
    setAsset((prev) => {
      if (prev?.isObjectUrl) URL.revokeObjectURL(prev.src);
      return null;
    });
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
        </div>
        <span className="rounded-full bg-zinc-900 px-2 py-0.5 text-[11px] font-medium tracking-wide text-zinc-500 ring-1 ring-inset ring-zinc-800">
          Mock evaluation data
        </span>
      </div>

      <div
        className="relative mt-4 flex flex-1 items-center justify-center overflow-hidden rounded-xl border border-zinc-800 bg-gradient-to-br from-zinc-900 via-zinc-950 to-zinc-900"
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
              src={asset.src}
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

            <div className="absolute bottom-2 left-2 rounded-md bg-zinc-950/80 px-2 py-1 font-mono text-[11px] text-zinc-400 backdrop-blur">
              {asset.name} · {asset.source === "upload" ? "uploaded" : "pasted URL"}
            </div>

            {ANNOTATIONS.map((a) => (
              <div
                key={a.dimensionId}
                className="absolute -translate-x-1/2 -translate-y-1/2"
                style={{ top: a.top, left: a.left }}
              >
                <span className="relative flex h-3 w-3">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400/60" />
                  <span className="relative inline-flex h-3 w-3 rounded-full bg-amber-400 ring-2 ring-zinc-950" />
                </span>
              </div>
            ))}
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

      {error && (
        <p className="mt-2 flex shrink-0 items-center gap-1.5 text-xs text-rose-400">
          <AlertCircle className="h-3.5 w-3.5" />
          {error}
        </p>
      )}

      <div className="mt-4 flex shrink-0 flex-wrap items-center gap-2">
        {contestedScores.map((d) => (
          <span
            key={d.dimensionId}
            className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-400 ring-1 ring-inset ring-amber-500/30"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
            Contested — {labelFor(d.dimensionId)}
          </span>
        ))}
      </div>
    </div>
  );
}
