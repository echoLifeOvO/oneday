"""Dissolve overlapping discovery areas and build soft, uniform polygon fills.
No raster editing. Uses the existing attributed geoBoundaries geometry.
"""
import json
from pathlib import Path
from shapely.geometry import shape, mapping
from shapely.ops import unary_union
ROOT = Path(__file__).resolve().parent.parent
for name, radius, tolerance in [('wide', .65, .07), ('near', .065, .006), ('local', .012, .0008)]:
    source = 'regions.geojson' if name == 'local' else f'glow-{name}.geojson'
    features = json.loads((ROOT / 'public/data' / source).read_text())['features']
    groups = []
    for f in features:
        geometry = shape(f['geometry']).buffer(0)
        ids = {f['properties']['id']}
        if name != 'local':
            # Adjacent provinces remain distinct; overlapping discovery areas
            # dissolve, so several places do not make the same area brighter.
            matches = [g for g in groups if g[1].intersection(geometry).area > min(g[1].area, geometry.area) * .01]
            for g in matches:
                ids.update(g[0]); geometry = geometry.union(g[1]); groups.remove(g)
        groups.append((ids, geometry))
    output = []
    for index, (ids, geometry) in enumerate(groups):
        group = f'{name}-{index}'
        smooth = geometry.buffer(radius * .5, resolution=3).buffer(-radius * .5, resolution=3).simplify(tolerance, preserve_topology=True)
        shapes = [smooth] + [smooth.buffer(radius * i / 4, resolution=3).simplify(tolerance * .4, preserve_topology=True) for i in range(1, 5)]
        for band, g in enumerate(shapes):
            if band: g = g.difference(shapes[band-1])
            alpha = [.62, .43, .25, .11, .035][band]
            fid = f'{group}-{band}'
            output.append({'type':'Feature','id':fid,'properties':{'id':fid,'group':group,'placeIds':sorted(ids),'alpha':alpha},'geometry':mapping(g)})
    destination=ROOT/'public/data'/f'glow-{name}-soft.geojson'
    def rounded(v):
        if isinstance(v, (list, tuple)): return [rounded(x) for x in v]
        if isinstance(v, dict): return {k:rounded(x) for k,x in v.items()}
        return round(v, 5) if isinstance(v, float) else v
    destination.write_text(json.dumps(rounded({'type':'FeatureCollection','features':output}),separators=(',',':')))
    print(name, len(groups), 'groups',destination.stat().st_size,'bytes')
