import jsQR from 'jsqr';

/**
 * Robust multi-pass QR code decoder from an image File or Blob.
 * Performs multiple crop and scale passes so that full desktop screenshots,
 * camera photos, and downloaded QR images are all reliably decoded.
 */
export async function decodeQRFromImage(file) {
  return new Promise((resolve) => {
    if (!file) return resolve(null);

    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          if (!ctx) return resolve(null);

          const origW = img.naturalWidth || img.width;
          const origH = img.naturalHeight || img.height;

          const scanRegion = (w, h, sx = 0, sy = 0, sw = origW, sh = origH) => {
            canvas.width = Math.max(1, Math.floor(w));
            canvas.height = Math.max(1, Math.floor(h));
            ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
            const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const result = jsQR(imgData.data, canvas.width, canvas.height, {
              inversionAttempts: 'attemptBoth',
            });
            return result ? result.data : null;
          };

          // Pass 1: Full image
          let code = scanRegion(origW, origH);
          if (code) return resolve(code);

          // Pass 2: Center crop 50% (where modal passes sit in desktop screenshots)
          code = scanRegion(
            origW * 0.5,
            origH * 0.5,
            origW * 0.25,
            origH * 0.2,
            origW * 0.5,
            origH * 0.6
          );
          if (code) return resolve(code);

          // Pass 3: Center crop 35% (tight modal QR area)
          code = scanRegion(
            origW * 0.35,
            origH * 0.45,
            origW * 0.32,
            origH * 0.25,
            origW * 0.36,
            origH * 0.5
          );
          if (code) return resolve(code);

          // Pass 4: Center crop 75%
          code = scanRegion(
            origW * 0.75,
            origH * 0.75,
            origW * 0.125,
            origH * 0.125,
            origW * 0.75,
            origH * 0.75
          );
          if (code) return resolve(code);

          // Pass 5: Scaled down if large
          if (origW > 1000 || origH > 1000) {
            const scale = 800 / Math.max(origW, origH);
            code = scanRegion(origW * scale, origH * scale);
            if (code) return resolve(code);
          }

          resolve(null);
        } catch (err) {
          console.error('QR decode error:', err);
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = reader.result;
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}
