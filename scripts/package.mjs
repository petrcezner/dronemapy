// Zips the contents of extension/dist into a Chrome Web Store upload:
// manifest.json sits at the zip root, dev/OS artifacts excluded.
// Usage: npm run package
import { execFileSync } from "node:child_process";
import { readFileSync, rmSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "extension", "dist");

const manifestPath = path.join(dist, "manifest.json");
if (!existsSync(manifestPath)) {
  console.error("extension/dist/manifest.json not found — run `npm run build` first.");
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const zipName = `dronemapy-v${manifest.version}.zip`;
const zipPath = path.join(root, zipName);
rmSync(zipPath, { force: true });

execFileSync(
  "zip",
  ["-r", zipPath, ".", "-x", ".*", "-x", "*/.*", "-x", "*.map", "-x", ".vite/*"],
  { cwd: dist, stdio: "inherit" }
);

const listing = execFileSync("unzip", ["-l", zipPath], { encoding: "utf8" });
if (!/\smanifest\.json$/m.test(listing)) {
  console.error("Sanity check failed: manifest.json is not at the zip root.");
  process.exit(1);
}
console.log(`\nCreated ${zipName} (${manifest.name} v${manifest.version})`);
