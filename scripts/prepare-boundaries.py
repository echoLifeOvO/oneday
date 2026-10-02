"""Download pinned geoBoundaries snapshots and extract the prototype's real regions.

Raw downloads stay in .cache. This is a deliberately bounded sample, not a
complete global gazetteer. Preserve each dataset's upstream license/attribution.
"""
import json
import pathlib
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
CACHE = ROOT / ".cache"
CACHE.mkdir(exist_ok=True)
SOURCES = {
    "CHN": ("ADM3", "OpenStreetMap / Lee Beryman", "ODbL 1.0"),
    "JPN": ("ADM2", "OpenStreetMap / Wambacher", "CC BY-SA 2.0"),
    "FRA": ("ADM2", "IGN-F", "Etalab Open License 2.0"),
    "USA": ("ADM2", "US Census Bureau", "Public domain; see upstream metadata"),
}
TARGETS = [
    ("dali", "CHN", "Dali City", "大理市", "Dali", "云南", "中国", 100.25, 25.68, "大理 云南 dali yunnan"),
    ("xihu", "CHN", "Xihu District", "西湖区", "Xihu", "浙江 · 杭州", "中国", 120.10, 30.25, "杭州 西湖 浙江 hangzhou xihu"),
    ("xuanwu", "CHN", "Xuanwu District", "玄武区", "Xuanwu", "江苏 · 南京", "中国", 118.83, 32.06, "南京 玄武 江苏 nanjing xuanwu"),
    ("kunshan", "CHN", "Kunshan City", "昆山市", "Kunshan", "江苏 · 苏州", "中国", 120.98, 31.38, "昆山 苏州 江苏 kunshan suzhou"),
    ("yangshuo", "CHN", "Yangshuo County", "阳朔县", "Yangshuo", "广西 · 桂林", "中国", 110.49, 24.78, "阳朔 桂林 广西 yangshuo guilin"),
    ("kamakura", "JPN", "Kamakura", "镰仓市", "Kamakura", "神奈川县", "日本", 139.54, 35.32, "镰仓 鎌倉 日本 kamakura japan"),
    ("kyoto", "JPN", "Kyoto", "京都市", "Kyoto", "京都府", "日本", 135.77, 35.01, "京都 日本 kyoto japan"),
    ("shibuya", "JPN", "Shibuya", "涩谷区", "Shibuya", "东京都", "日本", 139.70, 35.66, "涩谷 渋谷 东京 日本 shibuya tokyo japan"),
    ("paris", "FRA", "Paris", "巴黎", "Paris", "法兰西岛", "法国", 2.35, 48.86, "巴黎 法国 paris france"),
    ("san-francisco", "USA", "San Francisco", "旧金山", "San Francisco", "加利福尼亚州", "美国", -122.43, 37.77, "旧金山 三藩市 美国 san francisco california usa"),
]

def positions(geometry):
    def walk(a):
        if isinstance(a[0], (int, float)):
            yield a
        else:
            for c in a:
                yield from walk(c)
    return list(walk(geometry["coordinates"]))

def bbox(feature):
    p = positions(feature["geometry"])
    return [min(x[0] for x in p), min(x[1] for x in p), max(x[0] for x in p), max(x[1] for x in p)]

collections = {}
source_records = []
for iso, (level, author, license_name) in SOURCES.items():
    url = f"https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/gbOpen/{iso}/{level}/geoBoundaries-{iso}-{level}_simplified.geojson"
    file = CACHE / f"{iso}.geojson"
    if not file.exists():
        file.write_bytes(urllib.request.urlopen(url, timeout=120).read())
    collections[iso] = json.loads(file.read_text())["features"]
    source_records.append({"country": iso, "level": level, "url": url, "author": author, "license": license_name})

features, places = [], []
for ident, iso, source_name, name, en, region, country, lng, lat, aliases in TARGETS:
    candidates = [f for f in collections[iso] if (f["properties"].get("shapeName") or "").removesuffix(" County") == source_name.removesuffix(" County")]
    if not candidates:
        raise ValueError(f"No real boundary found: {iso}/{source_name}")
    chosen = min(candidates, key=lambda f: ((bbox(f)[0]+bbox(f)[2])/2-lng)**2 + ((bbox(f)[1]+bbox(f)[3])/2-lat)**2)
    bounds = bbox(chosen)
    places.append({"id": ident, "name": name, "englishName": en, "region": region, "country": country, "countryCode": iso, "center": [lng,lat], "bounds": bounds, "aliases": aliases, "sourceShapeId": chosen["properties"]["shapeID"]})
    features.append({"type": "Feature", "id": ident, "properties": {"id": ident, "name": name, "sourceName": chosen["properties"]["shapeName"]}, "geometry": chosen["geometry"]})
(ROOT/"public/data/regions.geojson").write_text(json.dumps({"type": "FeatureCollection", "features": features}, ensure_ascii=False, separators=(",",":")))
(ROOT/"lib/places.json").write_text(json.dumps(places, ensure_ascii=False, indent=2))
(ROOT/"public/data/sources.json").write_text(json.dumps(source_records, ensure_ascii=False, indent=2))
print(f"Prepared {len(places)} real region boundaries; {(ROOT/'public/data/regions.geojson').stat().st_size:,} bytes")
