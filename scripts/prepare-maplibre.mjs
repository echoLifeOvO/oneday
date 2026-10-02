import { copyFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";

// MapLibre 6 loads an ESM worker relative to its entry. Preserve that pair
// outside the Next.js bundler so development and Vercel use the same URLs.
const require = createRequire(import.meta.url);
const dist = dirname(require.resolve("maplibre-gl/dist/maplibre-gl.mjs"));
const destination = new URL("../public/vendor/maplibre/", import.meta.url);
await mkdir(destination, { recursive: true });
for (const file of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
  await copyFile(resolve(dist, file), new URL(file, destination));
}
