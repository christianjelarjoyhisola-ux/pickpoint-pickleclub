import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

await sharp(path.join(root, "public/pickpoint-wordmark-v3.png"))
  .resize({ width: 520, withoutEnlargement: true })
  .png({ compressionLevel: 9, palette: true, quality: 94 })
  .toFile(path.join(root, "public/pickpoint-wordmark-loader-v1.png"));

console.log("Generated public/pickpoint-wordmark-loader-v1.png");
