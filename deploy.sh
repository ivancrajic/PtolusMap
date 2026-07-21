#!/bin/bash
set -euo pipefail

BUCKET="ababsurdo.net"
PREFIX="ptolus/map"
DIST_ID="E1QK9UWYT2P3B3"

# Stage the map image from Sources/ into img/ for the sync
mkdir -p img
cp Sources/ptolus_city_map.jpg img/

echo "Syncing to s3://$BUCKET/$PREFIX/ ..."
aws s3 sync . "s3://$BUCKET/$PREFIX/" \
  --exclude "*" \
  --include "index.html" \
  --include "style.css" \
  --include "app.js" \
  --include "locations.json" \
  --include "img/ptolus_city_map.jpg" \
  --delete

echo "Invalidating CloudFront cache ..."
aws cloudfront create-invalidation \
  --distribution-id "$DIST_ID" \
  --paths "/map/*" \
  --output text

echo "Done — https://ptolus.ab-absurdo.net/map/"
