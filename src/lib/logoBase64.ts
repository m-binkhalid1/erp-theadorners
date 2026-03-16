/**
 * Converts an image URL to a base64 data URI.
 * This is critical for html2pdf.js which uses html2canvas internally —
 * relative image paths often fail when rendering to canvas/PDF.
 */
export async function imageToBase64(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Could not get canvas context"));
        return;
      }
      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    img.src = url;
  });
}

// Cache the logo base64 so we only convert once
let cachedLogoBase64: string | null = null;

export async function getLogoBase64(): Promise<string> {
  if (cachedLogoBase64) return cachedLogoBase64;
  try {
    cachedLogoBase64 = await imageToBase64("/images/adorners-logo.png");
    return cachedLogoBase64;
  } catch (err) {
    console.warn("Failed to convert logo to base64, falling back to URL", err);
    return "/images/adorners-logo.png";
  }
}
