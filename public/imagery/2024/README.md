# EOX Sentinel-2 cloudless 2024 — overview tiles

85 unmodified image tiles, zoom levels 0–3, used for the first globe view and
coarse fallback. The whole set is packaged with the app; the browser requests
only the tiles it needs. Detailed imagery is still loaded from EOX on demand.
Most files are JPEG; EOX returns PNG no-data tiles at three polar `.jpg` URLs.

Source: https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024_3857/default/g/{z}/{y}/{x}.jpg

Sentinel-2 cloudless by EOX IT Services GmbH. Contains modified Copernicus
Sentinel data 2024. https://cloudless.eox.at/

Licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0:
https://creativecommons.org/licenses/by-nc-sa/4.0/

Retrieved 2026-10-03. Reproduce with `node scripts/prepare-overview-tiles.mjs`.
This licence applies to these imagery assets, independently of the app code.
