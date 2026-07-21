# Ptolus City Map

Interactive map of the city of Ptolus. Hosted at **https://ptolus.ab-absurdo.net/map/**.

Pan and zoom the city map, search for districts, gates, and landmarks by name, and click any result to fly to it with a highlighted marker.

## Deploy

Requires AWS credentials with S3 write access to `ababsurdo.net` and `cloudfront:CreateInvalidation` on distribution `E1QK9UWYT2P3B3`.

```bash
./deploy.sh
```

This syncs `index.html`, `style.css`, `app.js`, `locations.json`, and the map image to `s3://ababsurdo.net/ptolus/map/`, then invalidates `/map/*` on CloudFront. The image is staged from `Sources/` into `img/` at deploy time and is not committed to the repo.

## Development

No build step. Open `index.html` directly in a browser, or serve the project root with any static server:

```bash
python -m http.server 8000
```

Note: `locations.json` is loaded via `fetch()`, so a local server is needed (file:// won't work).

## Project structure

```
index.html              App shell
style.css               Parchment/manuscript styling (Cinzel + Lora)
app.js                  Leaflet map, search, and highlight logic
locations.json          Named location coordinates
deploy.sh               Deploy to S3 + invalidate CloudFront
Sources/
  ptolus_city_map.jpg   Source map image (5976 × 3960 px)
  Ptolus Players Guide.pdf
```

## Adding or adjusting locations

Locations are in `locations.json`. Each entry is:

```json
{ "name": "Temple District", "type": "district", "px": 1929, "py": 1136 }
```

`px` and `py` are pixel coordinates measured from the **top-left** of the original 5976 × 3960 image. `app.js` converts these to Leaflet's coordinate system automatically.

**Types** control zoom level and highlight ring size:

| Type | Flies to zoom | Ring size |
|---|---|---|
| `district` | −1 (neighbourhood in view) | large |
| `area` | −1 | large |
| `gate` | 0 (street level) | small |
| `landmark` | 0 | small |

### Coordinate mode

To find or correct coordinates, open the map with `?coords` appended to the URL:

```
http://localhost:8000/?coords
```

A banner appears at the bottom-right. Click anywhere on the map and it displays the `px`/`py` values for that point, logs them to the console, and copies them to the clipboard. Use the search bar to fly to the approximate location first, zoom in, then click the exact spot.

Coordinate mode does not interfere with normal search and highlight — it just adds the click reader on top.

## Infrastructure

| What | Value |
|---|---|
| S3 bucket | `ababsurdo.net` |
| S3 prefix | `ptolus/map/` |
| CloudFront distribution | `E1QK9UWYT2P3B3` |
| Live URL | `https://ptolus.ab-absurdo.net/map/` |

The bucket policy and CloudFront behaviours are managed by the Infrastructure repo. The CloudFront Function that resolves `/map/` → `/map/index.html` is already in place — no changes needed there.

## Design system

Follows the shared Ptolus parchment/manuscript style:

- **Headings:** Cinzel (Google Fonts), uppercase, wide tracking
- **Body:** Lora (Google Fonts), falls back to Georgia
- **Palette:** `#ede0c3` parchment background · `#3a2e1e` ink · `#8a6a1e` heading gold · `#d4af50 → #b8922e` button/accent gradient
- **Details:** double-border card frames, `2–4px` border-radius, layered box-shadows, `0.15s` transitions
