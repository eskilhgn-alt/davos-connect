/**
 * Client-side image re-encode to strip EXIF and cap dimensions.
 * Re-encoding through a canvas naturally drops all EXIF metadata.
 */

export interface EncodeOptions {
  maxDim?: number;      // max width/height (px)
  quality?: number;     // 0..1
  mimeType?: string;    // output MIME
}

const DEFAULTS: Required<EncodeOptions> = {
  maxDim: 2000,
  quality: 0.9,
  mimeType: 'image/jpeg',
};

export async function reencodeImage(file: Blob, opts: EncodeOptions = {}): Promise<Blob> {
  const cfg = { ...DEFAULTS, ...opts };
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      const scale = Math.min(1, cfg.maxDim / Math.max(width, height));
      width = Math.round(width * scale);
      height = Math.round(height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('canvas ctx'));
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => blob ? resolve(blob) : reject(new Error('encode failed')),
        cfg.mimeType,
        cfg.quality,
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('load failed'));
    };
    img.src = url;
  });
}
