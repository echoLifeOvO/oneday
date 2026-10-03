"""Build lazy, country/region boundary catalogs for searched places.

Overview: Natural Earth 5.1.2 ADM1 (public domain), overridden by the already
attributed geoBoundaries snapshots for CN/JP/FR/US. Detailed regions use those
same cached geoBoundaries snapshots. Run with .cache/geo-env/bin/python.
"""
import json
import hashlib
import math
import urllib.request
from pathlib import Path
from shapely.geometry import shape, mapping
from shapely.ops import unary_union, orient

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'public/data/discovery-v1'
OUT.mkdir(exist_ok=True)

def rounded(v):
    if isinstance(v, (tuple, list)): return [rounded(x) for x in v]
    if isinstance(v, dict): return {k: rounded(x) for k,x in v.items()}
    return round(v, 5) if isinstance(v, float) else v

def write(path, value):
    path.write_text(json.dumps(rounded(value), ensure_ascii=False, separators=(',',':')))

def record(ident, name, g, parent=False):
    tolerance=.006 if parent else .002
    geometry=orient(g.simplify(tolerance,preserve_topology=True),sign=1)
    return {'id':ident,'name':name,'bounds':list(g.bounds),
            'geometry':mapping(geometry),
            **({'wideGeometry':mapping(geometry.buffer(.2,resolution=3).buffer(-.08,resolution=3).simplify(.015,preserve_topology=True))} if parent else {})}

world = ROOT/'.cache/world-admin1.geojson'
if not world.exists():
    world.write_bytes(urllib.request.urlopen('https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_10m_admin_1_states_provinces.geojson', timeout=120).read())
countries={}
for f in json.loads((ROOT/'.cache/world-admin1.geojson').read_text())['features']:
    p=f['properties'];cc=p['iso_a2']
    if len(cc)!=2 or not cc.isalpha(): continue
    g=shape(f['geometry']).buffer(0)
    if g.is_empty:continue
    ident=hashlib.sha256(p['adm1_code'].encode()).hexdigest()[:12]
    countries.setdefault(cc,[]).append((ident,p['name'],g))

for cc,iso in [('CN','CHN'),('JP','JPN'),('FR','FRA'),('US','USA')]:
    countries[cc]=[(f['properties']['shapeID'],f['properties']['shapeName'],shape(f['geometry']).buffer(0))
                   for f in json.loads((ROOT/f'.cache/{iso}-ADM1.geojson').read_text())['features']]
    parents=countries[cc]
    children={pid:[] for pid,_,_ in parents}
    for f in json.loads((ROOT/f'.cache/{iso}.geojson').read_text())['features']:
        g=shape(f['geometry']).buffer(0)
        if g.is_empty:continue
        point=g.representative_point()
        parent=next((p for p in parents if p[2].covers(point)),None)
        if not parent:parent=min(parents,key=lambda p:p[2].distance(point))
        children[parent[0]].append(record(f['properties']['shapeID'],f['properties']['shapeName'],g))
    for pid,items in children.items():write(OUT/f'{cc}-{pid}.json',items)
    print(cc,'detailed regions',sum(len(x) for x in children.values()),flush=True)

for cc,parents in countries.items():
    rows=[]
    centres={ident:(g.centroid.x,g.centroid.y) for ident,_,g in parents}
    for ident,name,g in parents:
        row=record(ident,name,g,True)
        if g.area < 3:
            x,y=centres[ident]
            nearby=[other for pid,_,other in parents if math.hypot((centres[pid][0]-x)*math.cos(math.radians(y)),centres[pid][1]-y)*111 < 450]
            broad=unary_union(nearby).simplify(.02,preserve_topology=True)
            row['wideGeometry']=mapping(orient(broad.buffer(.2,resolution=3).buffer(-.08,resolution=3).simplify(.015,preserve_topology=True),sign=1))
        row['details']=f'{cc}-{ident}.json' if cc in ['CN','JP','FR','US'] else None
        rows.append(row)
    write(OUT/f'{cc}.json',rows)
write(OUT/'countries.json',sorted(countries))
print('countries',len(countries),'bytes',sum(p.stat().st_size for p in OUT.glob('*.json')))
