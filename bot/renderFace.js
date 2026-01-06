import { Resvg } from "@resvg/resvg-js";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
// facesjs is CommonJS in Node; require ensures we access its named exports.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { faceToSvgString } = require("facesjs");

function renderFaceSvg(face) {
  if (!face || typeof face !== "object") return null;
  try {
    return faceToSvgString(face);
  } catch (err) {
    console.warn("Face SVG render failed:", err);
    return null;
  }
}

function parseMaybeJson(value) {
  if (!value) return null;
  if (typeof value === "object") return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    try {
      return JSON.parse(trimmed);
    } catch {
      return null;
    }
  }
  return null;
}

function svgToPngBuffer(svgString, width = 256) {
  const resvg = new Resvg(svgString, { fitTo: { mode: "width", value: width } });
  const pngData = resvg.render().asPng();
  return Buffer.from(pngData);
}

export async function renderFacePngAttachment(face) {
  const faceObj = parseMaybeJson(face);
  const svg = renderFaceSvg(faceObj);
  if (!svg) return null;

  try {
    const buffer = svgToPngBuffer(svg, 256);
    return { attachment: buffer, name: "face.png" };
  } catch (err) {
    console.warn("Face render failed, skipping thumbnail:", err);
    return null;
  }
}
