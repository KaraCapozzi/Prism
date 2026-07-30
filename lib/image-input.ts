export const MAX_UPLOAD_BYTES = 5_000_000; // ~5MB raw; comfortably under every judge's base64 image cap.
export const SUPPORTED_MEDIA_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

export interface JudgeImageInput {
  mediaType: string;
  bytes: Buffer;
}

export type ImageReadResult =
  | { present: false }
  | { present: true; ok: true; mediaType: string; bytes: Buffer }
  | { present: true; ok: false; message: string };

/** Reads an image from a `<fileKey>`/`<urlKey>` pair in the form data. Returns
 * `{ present: false }` when neither field was sent at all — distinct from an
 * invalid value, so callers can tell "not provided" from "provided but bad". */
export async function readImage(formData: FormData, fileKey: string, urlKey: string): Promise<ImageReadResult> {
  const file = formData.get(fileKey);
  const url = formData.get(urlKey);

  if (file instanceof File) {
    const mediaType = file.type;
    if (!SUPPORTED_MEDIA_TYPES.has(mediaType)) {
      return {
        present: true,
        ok: false,
        message: `Unsupported image type "${mediaType || "unknown"}" — use JPEG, PNG, GIF, or WEBP.`,
      };
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return { present: true, ok: false, message: "Image is too large (5MB limit)." };
    }
    const bytes = Buffer.from(await file.arrayBuffer());
    return { present: true, ok: true, mediaType, bytes };
  }

  if (typeof url === "string" && url) {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return { present: true, ok: false, message: "That's not a valid URL." };
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { present: true, ok: false, message: "Only http/https image URLs are supported." };
    }

    // Fetch it ourselves rather than handing the URL to a provider — some
    // providers' own server-side image fetchers reject perfectly ordinary hosts.
    let fetched: Response;
    try {
      fetched = await fetch(parsed, { signal: AbortSignal.timeout(15_000) });
    } catch {
      return { present: true, ok: false, message: "Couldn't reach that URL." };
    }
    if (!fetched.ok) {
      return { present: true, ok: false, message: `That URL returned HTTP ${fetched.status}.` };
    }
    const mediaType = (fetched.headers.get("content-type") ?? "").split(";")[0].trim();
    if (!SUPPORTED_MEDIA_TYPES.has(mediaType)) {
      return {
        present: true,
        ok: false,
        message: `That URL served "${mediaType || "unknown content"}", not a supported image type (JPEG, PNG, GIF, WEBP).`,
      };
    }
    const contentLength = Number(fetched.headers.get("content-length") ?? "0");
    if (contentLength > MAX_UPLOAD_BYTES) {
      return { present: true, ok: false, message: "Image is too large (5MB limit)." };
    }
    const bytes = Buffer.from(await fetched.arrayBuffer());
    if (bytes.byteLength > MAX_UPLOAD_BYTES) {
      return { present: true, ok: false, message: "Image is too large (5MB limit)." };
    }
    return { present: true, ok: true, mediaType, bytes };
  }

  return { present: false };
}
