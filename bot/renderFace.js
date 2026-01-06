import sharp from "sharp";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
// facesjs is CommonJS in some environments; require ensures we can access its exports reliably.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const facesjs = require("facesjs");

const moduleCandidates = [
  "facesjs",
  "facesjs/faceToSvgString",
  "facesjs/faceToSvgString.js",
  "facesjs/faceToSvg",
  "facesjs/faceToSvg.js",
  "facesjs/dist/faceToSvgString",
  "facesjs/dist/faceToSvgString.js",
  "facesjs/dist/faceToSvg",
  "facesjs/dist/faceToSvg.js",
];

function resolveFaceToSvgString() {
  const candidates = [facesjs];
  for (const path of moduleCandidates) {
    try {
      candidates.push(require(path));
    } catch {
      // ignore
    }
  }

  for (const candidate of candidates) {
    const fn =
      candidate?.faceToSvgString ??
      candidate?.faceToSvg ??
      candidate?.default?.faceToSvgString ??
      candidate?.default?.faceToSvg;
    if (typeof fn === "function") {
      return fn;
    }
  }

  return null;
}

function renderFaceSvg(face) {
  if (!face || typeof face !== "object") return null;
  try {
    const faceToSvgString = resolveFaceToSvgString();
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
