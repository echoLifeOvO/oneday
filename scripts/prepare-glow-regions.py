"""Create zoom-dependent discovery areas from the cached real boundaries.

Requires shapely. Run prepare-boundaries.py first. These broader shapes are
discovery glows, not claims that every covered district has a diary.
"""
import json
import math
import urllib.request
from pathlib import Path
from shapely.geometry import shape, mapping, Point
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parent.parent
places = json.loads((ROOT / "lib/places.json").read_text())
countries = {}
parents = {}
source_records = []
for country in {p["countryCode"] for p in places}:
    features = json.loads((ROOT / f".cache/{country}.geojson").read_text())["features"]
    countries[country] = [shape(f["geometry"]).buffer(0) for f in features]

    base = f"https://media.githubusercontent.com/media/wmgeolab/geoBoundaries/9469f09/releaseData/gbOpen/{country}/ADM1/geoBoundaries-{country}-ADM1"
    for suffix, name in [("_simplified.geojson", f"{country}-ADM1.geojson"), ("-metaData.json", f"{country}-ADM1-metadata.json")]:
        path = ROOT / ".cache" / name
        if not path.exists():
            path.write_bytes(urllib.request.urlopen(base + suffix, timeout=60).read())
    parents[country] = [shape(f["geometry"]).buffer(0) for f in json.loads((ROOT / f".cache/{country}-ADM1.geojson").read_text())["features"]]
    metadata = json.loads((ROOT / f".cache/{country}-ADM1-metadata.json").read_text())
    source_records.append({"country": country, "level": "ADM1", "purpose": "Overview discovery glow; not diary coverage", "url": base + "_simplified.geojson", "author": metadata["boundarySource"], "license": metadata["boundaryLicense"], "metadata": metadata})

def distance(a, b):
    lat = math.radians((a[1] + b[1]) / 2)
    return math.hypot((a[0] - b[0]) * math.cos(lat), a[1] - b[1]) * 111

for level, radius, tolerance in [("wide", 340, .035), ("near", 85, .008)]:
    output = []
    for place in places:
        selected = []
        if level == "wide":
            point = Point(place["center"])
            parent = min(parents[place["countryCode"]], key=lambda g: g.distance(point))
            selected = [parent]
            if parent.area < 3:
                selected += [g for g in parents[place["countryCode"]] if distance(place["center"], (g.centroid.x, g.centroid.y)) < 200]
        else:
            for geometry in countries[place["countryCode"]]:
                c = geometry.centroid
                if distance(place["center"], (c.x, c.y)) < radius:
                    selected.append(geometry)
        geometry = unary_union(selected).simplify(tolerance, preserve_topology=True)
        output.append({"type": "Feature", "id": place["id"], "properties": {"id": place["id"]}, "geometry": mapping(geometry)})
    path = ROOT / f"public/data/glow-{level}.geojson"
    path.write_text(json.dumps({"type": "FeatureCollection", "features": output}, separators=(",", ":")))
    print(path.name, path.stat().st_size, "bytes")

(ROOT / "public/data/glow-sources.json").write_text(json.dumps(source_records, ensure_ascii=False, indent=2))

sources_path = ROOT / "public/data/sources.json"
existing = json.loads(sources_path.read_text())
existing = [record for record in existing if record.get("level") != "ADM1"]
existing.extend({k: v for k, v in record.items() if k != "metadata"} for record in source_records)
sources_path.write_text(json.dumps(existing, ensure_ascii=False, indent=2))
