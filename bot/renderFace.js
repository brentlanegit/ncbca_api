import sharp from "sharp";
import facesjs from "facesjs";

function renderFaceSvg(face) {
  if (!face || typeof face !== "object") return null;
  try {
    const faceToSvgString =
      facesjs?.faceToSvgString ??
      facesjs?.default?.faceToSvgString ??
      facesjs?.faceToSvg ??
      facesjs?.default?.faceToSvg;
    if (typeof faceToSvgString !== "function") {
      throw new Error("facesjs export faceToSvgString not found");
    }
    return faceToSvgString(face);
  } catch (err) {
    console.warn("Face SVG render failed:", err);
    return null;
  }
}

export async function renderFacePngAttachment(face) {
  const svg = renderFaceSvg(face);
  if (!svg) return null;

  try {
    const buffer = await sharp(Buffer.from(svg)).png().toBuffer();
    return { attachment: buffer, name: "face.png" };
  } catch (err) {
    console.warn("Face render failed, skipping thumbnail:", err);
    return null;
  }
}
