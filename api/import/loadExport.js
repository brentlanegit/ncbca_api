import fs from "fs";
import path from "path";
import crypto from "crypto";

export function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

export function loadExportFromFile(filePath) {
  const abs = path.resolve(filePath);
  const raw = fs.readFileSync(abs);
  const hash = sha256(raw);

  let json;
  try {
    json = JSON.parse(raw.toString("utf-8"));
  } catch (e) {
    throw new Error(`Invalid JSON: ${e.message}`);
  }

  // Minimal sanity checks (we’ll expand later if needed)
  if (!json.gameAttributes) throw new Error("Export missing gameAttributes");
  if (!Array.isArray(json.teams)) throw new Error("Export missing teams[]");
  if (!Array.isArray(json.players)) throw new Error("Export missing players[]");
  if (!Array.isArray(json.schedule)) throw new Error("Export missing schedule[]");
  if (!Array.isArray(json.games)) throw new Error("Export missing games[]");

  return { absPath: abs, raw, hash, json };
}

export function persistRawExport({ raw, hash }) {
  // stored inside repo for now; later swap to R2 without changing caller API
  const dir = path.resolve("storage/exports");
  fs.mkdirSync(dir, { recursive: true });

  const fileName = `${new Date().toISOString().replace(/[:.]/g, "-")}-${hash}.json`;
  const storageKey = path.join("storage/exports", fileName);
  fs.writeFileSync(path.resolve(storageKey), raw);

  return { storageKey, fileName };
}
