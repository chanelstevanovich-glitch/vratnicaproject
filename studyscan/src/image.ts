/** Downscale photos in the browser before upload: faster, cheaper, and plenty for reading text. */

export interface PreparedImage {
  /** For the AI: base64 JPEG without the data: prefix. */
  data: string;
  mediaType: "image/jpeg";
  /** Small preview stored with the lesson. */
  thumb: string;
}

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    // Fallback for browsers that can't decode via createImageBitmap
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

function render(src: ImageBitmap | HTMLImageElement, maxSide: number, quality: number): string {
  const w = "naturalWidth" in src ? src.naturalWidth : src.width;
  const h = "naturalHeight" in src ? src.naturalHeight : src.height;
  const scale = Math.min(1, maxSide / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available in this browser.");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", quality);
}

export async function prepareImage(file: File): Promise<PreparedImage> {
  const bmp = await loadBitmap(file);
  const full = render(bmp, 1600, 0.85);
  const thumb = render(bmp, 420, 0.7);
  if ("close" in bmp) bmp.close();
  return { data: full.slice(full.indexOf(",") + 1), mediaType: "image/jpeg", thumb };
}
