"""
Slice ptolus_city_map.jpg into overlapping tiles for text extraction.
Outputs tiles to /tmp/ptolus_tiles/ and prints a manifest.
"""
import json, os
from PIL import Image

IMG_PATH  = "Sources/ptolus_city_map.jpg"
OUT_DIR   = "/tmp/ptolus_tiles"
TILE_W    = 1500
TILE_H    = 1000
STRIDE_X  = 1000   # 500px horizontal overlap
STRIDE_Y  = 700    # 300px vertical overlap

os.makedirs(OUT_DIR, exist_ok=True)

img = Image.open(IMG_PATH)
W, H = img.size  # 5976 x 3960

manifest = []
idx = 0

y0 = 0
while y0 < H:
    y1 = min(y0 + TILE_H, H)
    x0 = 0
    while x0 < W:
        x1 = min(x0 + TILE_W, W)
        tile = img.crop((x0, y0, x1, y1))
        fname = f"tile_{idx:03d}_x{x0}_y{y0}.jpg"
        tile.save(os.path.join(OUT_DIR, fname), quality=92)
        manifest.append({"idx": idx, "file": fname, "x0": x0, "y0": y0, "x1": x1, "y1": y1})
        idx += 1
        if x1 == W:
            break
        x0 += STRIDE_X
    if y1 == H:
        break
    y0 += STRIDE_Y

with open(os.path.join(OUT_DIR, "manifest.json"), "w") as f:
    json.dump(manifest, f, indent=2)

print(f"Generated {idx} tiles → {OUT_DIR}")
for t in manifest:
    print(f"  {t['file']}  origin=({t['x0']},{t['y0']})")
