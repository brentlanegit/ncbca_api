import sharp from "sharp";

function safeColor(value, fallback) {
  if (typeof value === "string" && value.trim()) return value;
  return fallback;
}

function renderFaceSvg(face) {
  if (!face || typeof face !== "object") return null;

  const skin = safeColor(face.skinColor, "#f2c9a0");
  const hair = safeColor(face.hairColor, "#2f1b0c");
  const eye = safeColor(face.eyeColor, "#2e2e2e");
  const beard = safeColor(face.beardColor ?? face.hairColor, hair);

  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
      <rect width="200" height="200" rx="20" fill="#f7f7f7" />
      <circle cx="100" cy="110" r="60" fill="${skin}" />
      <rect x="45" y="40" width="110" height="45" rx="20" fill="${hair}" />
      <circle cx="78" cy="105" r="8" fill="${eye}" />
      <circle cx="122" cy="105" r="8" fill="${eye}" />
      <rect x="70" y="140" width="60" height="10" rx="5" fill="#a05a2c" />
      <rect x="65" y="150" width="70" height="12" rx="6" fill="${beard}" opacity="0.4" />
    </svg>
  `;
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
