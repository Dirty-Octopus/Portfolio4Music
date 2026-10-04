"""Trace the supplied white wordmark into extrusion-ready vector outlines.

This does not redraw the logo: contours come from its neutral white pixels.
Run manually with Python, Pillow, numpy and contourpy; no build-time dependency.
"""
from pathlib import Path
import json
import numpy as np
from PIL import Image
import contourpy

ROOT = Path(__file__).resolve().parents[1]
size = 700
source = Image.open(ROOT / 'public/art/dirty-octopus-logo.jpg').convert('RGB').resize((size, size), Image.Resampling.LANCZOS)
pixels = np.asarray(source).astype(float)
mask = ((pixels.min(axis=2) > 207) & (pixels.max(axis=2) - pixels.min(axis=2) < 35)).astype(float)
mask[:round(size * .16)] = 0
mask[round(size * .85):] = 0
mask[:, :round(size * .045)] = 0
mask[:, round(size * .955):] = 0

def simplify(points, epsilon=.7):
    if len(points) < 3: return points
    a, b = points[0], points[-1]
    v = b - a
    if np.linalg.norm(v) < 1e-8:
        distance = np.linalg.norm(points - a, axis=1)
    else:
        distance = np.abs(v[0] * (points[:, 1] - a[1]) - v[1] * (points[:, 0] - a[0])) / np.linalg.norm(v)
    index = np.argmax(distance)
    if distance[index] <= epsilon: return np.array([a, b])
    return np.concatenate((simplify(points[:index+1], epsilon)[:-1], simplify(points[index:], epsilon)))

def area(points):
    return abs(np.sum(points[:-1,0] * points[1:,1] - points[1:,0] * points[:-1,1])) / 2

outlines, offsets = contourpy.contour_generator(z=mask, fill_type='OuterOffset').filled(.5, 1.5)
polygons = []
for outline, offset in zip(outlines, offsets):
    rings = [outline[offset[i]:offset[i+1]] for i in range(len(offset)-1)]
    bounds = np.ptp(rings[0], axis=0)
    # Discard isolated horizontal glitch bars, preserving every tall glyph.
    if area(rings[0]) < 85 or bounds[1] / max(bounds[0], 1) < .12: continue
    polygons.append([simplify(ring).round(2).tolist() for ring in rings if area(ring) > 7])
points = np.array([p for polygon in polygons for ring in polygon for p in ring])
bounds = [float(points[:,0].min()), float(points[:,1].min()), float(points[:,0].max()), float(points[:,1].max())]
(ROOT / 'src/metal-logo-geometry.json').write_text(json.dumps({'bounds':bounds, 'polygons':polygons}, separators=(',', ':')) + '\n')
x,y,x2,y2 = bounds
paths = [' '.join('M' + ' L'.join(f'{px},{py}' for px,py in ring) + ' Z' for ring in polygon) for polygon in polygons]
svg = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{x-20} {y-20} {x2-x+40} {y2-y+40}"><g fill="#d5e1eb" fill-rule="evenodd">' + ''.join(f'<path d="{path}"/>' for path in paths) + '</g></svg>\n'
(ROOT / 'public/art/dirty-octopus-metal.svg').write_text(svg)
print(f'{len(polygons)} shapes, {sum(len(ring) for polygon in polygons for ring in polygon)} vertices; bounds {bounds}')
