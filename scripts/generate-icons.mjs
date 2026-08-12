// Renders the SVG masters in store-assets/ to the PNG sizes required by
// the extension manifest and the Chrome Web Store listing.
// Usage: node scripts/generate-icons.mjs
import { fileURLToPath } from "node:url";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const iconSvg = path.join(root, "store-assets", "icon.svg");
const promoSvg = path.join(root, "store-assets", "promo-tile.svg");

const jobs = [
  { src: iconSvg, w: 16, h: 16, out: "extension/assets/icons/icon16.png" },
  { src: iconSvg, w: 48, h: 48, out: "extension/assets/icons/icon48.png" },
  { src: iconSvg, w: 128, h: 128, out: "extension/assets/icons/icon128.png" },
  { src: promoSvg, w: 440, h: 280, out: "store-assets/promo-tile-440x280.png" },
];

for (const { src, w, h, out } of jobs) {
  const dest = path.join(root, out);
  await sharp(src, { density: 300 })
    .resize(w, h)
    .png()
    .toFile(dest);
  console.log(`wrote ${out} (${w}x${h})`);
}
