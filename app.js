(function () {
  const IMG_W = 5976;
  const IMG_H = 3960;

  // Editing tools (add location / calibrate) only run against a local dev
  // server — the deployed site loads the same files but never enables them.
  // Excludes file:// (empty hostname): locations.json fetch is blocked there
  // anyway, so the whole app — not just editing — needs a real local server.
  var isLocalDev = ['localhost', '127.0.0.1'].indexOf(window.location.hostname) !== -1;
  if (isLocalDev) { document.body.classList.add('edit-mode'); }

  var calibrating = false;

  const map = L.map('map', {
    crs: L.CRS.Simple,
    minZoom: -3,
    maxZoom: 2,
    zoomSnap: 0.25,
    attributionControl: false,
  });

  const bounds = [[0, 0], [IMG_H, IMG_W]];
  L.imageOverlay('img/ptolus_city_map.jpg', bounds).addTo(map);
  map.fitBounds(bounds, { padding: [8, 8] });

  function toLL(px, py) {
    return L.latLng(IMG_H - py, px);
  }

  // ── Highlight ─────────────────────────────────────────────────────────────

  var activeMarker = null;
  var activeListItem = null;

  function clearHighlight() {
    if (activeMarker) { map.removeLayer(activeMarker); activeMarker = null; }
    if (activeListItem) { activeListItem.classList.remove('active'); activeListItem = null; }
  }

  function showHighlight(loc, listItem) {
    clearHighlight();
    var latlng = toLL(loc.px, loc.py);
    var isLarge = loc.type === 'district' || loc.type === 'area';
    var isStreet = loc.type === 'street';
    activeMarker = L.marker(latlng, {
      icon: L.divIcon({
        className: 'ptolus-highlight',
        html: '<div class="highlight-ring' + (isLarge ? '' : ' small') + '">' +
              '<div class="highlight-label">' + loc.name + '</div></div>',
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      }),
      zIndexOffset: 1000,
    }).addTo(map);
    var zoom = isLarge ? -1 : isStreet ? 1 : 0;
    map.flyTo(latlng, zoom, { duration: 0.75 });
    if (listItem) {
      listItem.classList.add('active');
      listItem.scrollIntoView({ block: 'nearest' });
      activeListItem = listItem;
    }
  }

  // Marks a location's current position without moving the map — used during
  // batch calibration so the view stays put while stepping through a section.
  function showCalibMarker(loc) {
    clearHighlight();
    activeMarker = L.marker(toLL(loc.px, loc.py), {
      icon: L.divIcon({
        className: 'ptolus-highlight',
        html: '<div class="highlight-ring small">' +
              '<div class="highlight-label">' + loc.name + '</div></div>',
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      }),
      zIndexOffset: 1000,
    }).addTo(map);
  }

  // Buckets locations into a grid matching the tile layout used to read the
  // map (1000×700px cells) so batch calibration can walk one section at a
  // time instead of jumping around the city between every single item.
  var TILE_W = 1000;
  var TILE_H = 700;

  function groupByTile(locs) {
    var cols = Math.ceil(IMG_W / TILE_W);
    var buckets = {};
    locs.forEach(function (l) {
      var col = Math.min(cols - 1, Math.floor(l.px / TILE_W));
      var row = Math.floor(l.py / TILE_H);
      var key = row + '-' + col;
      if (!buckets[key]) buckets[key] = { row: row, col: col, items: [] };
      buckets[key].items.push(l);
    });
    var groups = Object.keys(buckets).map(function (k) { return buckets[k]; });
    groups.sort(function (a, b) { return (a.row - b.row) || (a.col - b.col); });
    groups.forEach(function (g) {
      g.items.sort(function (a, b) { return a.name.localeCompare(b.name); });
      g.x0 = g.col * TILE_W;
      g.y0 = g.row * TILE_H;
      g.x1 = Math.min(IMG_W, g.x0 + TILE_W);
      g.y1 = Math.min(IMG_H, g.y0 + TILE_H);
    });
    return groups;
  }

  // Always log coordinates on click — useful during calibration
  map.on('click', function (e) {
    var px = Math.round(e.latlng.lng);
    var py = Math.round(IMG_H - e.latlng.lat);
    console.log('{"px":' + px + ',"py":' + py + '}');
  });

  // ── Search + list ──────────────────────────────────────────────────────────

  fetch('locations.json')
    .then(function (r) { return r.json(); })
    .then(function (locations) {

      var input    = document.getElementById('search');
      var clearBtn = document.getElementById('clear-search');
      var list     = document.getElementById('results');

      function buildList(items) {
        list.innerHTML = '';
        items.forEach(function (loc) {
          var li = document.createElement('li');
          li.setAttribute('role', 'option');
          li.innerHTML = '<span class="loc-name">' + loc.name + '</span>' +
                         '<span class="loc-type ' + loc.type + '">' + loc.type + '</span>' +
                         '<button class="recal-btn" title="Recalibrate">◎</button>';
          li.addEventListener('click', function () { showHighlight(loc, li); });
          li.querySelector('.recal-btn').addEventListener('click', function (e) {
            e.stopPropagation();
            calibrateSingle(loc);
          });
          list.appendChild(li);
        });
      }

      var sorted = locations.slice().sort(function (a, b) {
        return a.name.localeCompare(b.name);
      });
      buildList(sorted);

      input.addEventListener('input', function () {
        var q = input.value.toLowerCase().trim();
        clearBtn.style.display = q ? 'block' : 'none';
        var filtered = q ? sorted.filter(function (l) {
          return l.name.toLowerCase().includes(q);
        }) : sorted;
        buildList(filtered);
        if (q && filtered.length === 1) {
          showHighlight(filtered[0], list.querySelector('li'));
        }
      });

      clearBtn.addEventListener('click', function () {
        input.value = '';
        clearBtn.style.display = 'none';
        buildList(sorted);
        clearHighlight();
        map.fitBounds(bounds, { padding: [8, 8], animate: true, duration: 0.6 });
      });

      map.on('click', function () {
        if (!calibrating) clearHighlight();
      });

      // ── Shared export modal ──────────────────────────────────────────────

      function showExportModal(title, json) {
        var modal = document.createElement('div');
        modal.id = 'calib-export';
        modal.innerHTML =
          '<div class="export-title">' + title + '</div>' +
          '<div class="export-sub">Select all and copy, then replace locations.json</div>' +
          '<textarea class="export-textarea" readonly>' + json + '</textarea>' +
          '<button class="export-close">Done</button>';
        document.body.appendChild(modal);
        modal.querySelector('.export-textarea').select();
        modal.querySelector('.export-close').addEventListener('click', function () {
          modal.remove();
        });
      }

      // ── Add location ──────────────────────────────────────────────────────

      document.getElementById('add-location-btn').addEventListener('click', function () {
        startAddLocation(locations);
      });

      function startAddLocation(locs) {
        calibrating = true;
        clearHighlight();

        var overlay = document.createElement('div');
        overlay.id = 'calib-overlay';
        overlay.innerHTML =
          '<div class="calib-name">Add Location</div>' +
          '<div class="add-loc-form">' +
            '<input class="add-loc-name" type="text" placeholder="Location name" autocomplete="off">' +
            '<select class="add-loc-type">' +
              '<option value="property">Property</option>' +
              '<option value="landmark">Landmark</option>' +
              '<option value="gate">Gate</option>' +
              '<option value="district">District</option>' +
              '<option value="area">Area</option>' +
              '<option value="street">Street</option>' +
            '</select>' +
            '<div class="add-loc-actions">' +
              '<button class="add-loc-place">Place on Map</button>' +
              '<button class="calib-skip">Cancel</button>' +
            '</div>' +
          '</div>';
        document.getElementById('map').appendChild(overlay);

        overlay.querySelector('.calib-skip').addEventListener('click', function (e) {
          e.stopPropagation();
          calibrating = false;
          overlay.remove();
        });

        var nameInput = overlay.querySelector('.add-loc-name');
        var typeSelect = overlay.querySelector('.add-loc-type');
        nameInput.focus();

        overlay.querySelector('.add-loc-place').addEventListener('click', function (e) {
          e.stopPropagation();
          var name = nameInput.value.trim();
          if (!name) { nameInput.focus(); return; }
          var type = typeSelect.value;

          overlay.innerHTML =
            '<div class="calib-name">' + name + '</div>' +
            '<div class="calib-sub">Click on the map to place it</div>' +
            '<button class="calib-skip">Cancel</button>';
          L.DomEvent.disableClickPropagation(overlay);

          var clickHandler = null;

          overlay.querySelector('.calib-skip').addEventListener('click', function (e2) {
            e2.stopPropagation();
            if (clickHandler) { map.off('click', clickHandler); }
            calibrating = false;
            overlay.remove();
          });

          clickHandler = function (e2) {
            map.off('click', clickHandler);
            var loc = {
              name: name,
              type: type,
              px: Math.round(e2.latlng.lng),
              py: Math.round(IMG_H - e2.latlng.lat),
            };
            locs.push(loc);

            sorted = locs.slice().sort(function (a, b) { return a.name.localeCompare(b.name); });
            buildList(sorted);

            calibrating = false;
            overlay.remove();

            showHighlight(loc, null);
            showExportModal(name + ' added', JSON.stringify(locs, null, 2));
          };
          map.on('click', clickHandler);
        });
      }

      // ── Calibration ────────────────────────────────────────────────────────

      document.getElementById('calibrate-btn').addEventListener('click', function () {
        startCalibration(locations);
      });

      function calibrateSingle(loc) {
        calibrating = true;
        clearHighlight();

        var overlay = document.createElement('div');
        overlay.id = 'calib-overlay';
        overlay.innerHTML =
          '<div class="calib-name">' + loc.name + '</div>' +
          '<div class="calib-sub">Click the location on the map</div>' +
          '<button class="calib-skip">Cancel</button>';
        L.DomEvent.disableClickPropagation(overlay);
        document.getElementById('map').appendChild(overlay);

        map.flyTo(toLL(loc.px, loc.py), -1, { duration: 0.4 });

        var clickHandler = null;

        overlay.querySelector('.calib-skip').addEventListener('click', function (e) {
          e.stopPropagation();
          if (clickHandler) { map.off('click', clickHandler); }
          calibrating = false;
          overlay.remove();
        });

        clickHandler = function (e) {
          map.off('click', clickHandler);
          loc.px = Math.round(e.latlng.lng);
          loc.py = Math.round(IMG_H - e.latlng.lat);
          calibrating = false;
          overlay.remove();

          showExportModal(loc.name + ' updated', JSON.stringify(locations, null, 2));
        };
        map.on('click', clickHandler);
      }

      function startCalibration(locs) {
        calibrating = true;
        clearHighlight();

        // Keep each item's place in the source array so results can be written
        // back to it, even though we walk it grouped by section.
        var source = locs.map(function (l, i) {
          var copy = Object.assign({}, l);
          copy._origIndex = i;
          return copy;
        });
        var groups = groupByTile(source);
        var calibrated = [];
        groups.forEach(function (g, gi) {
          g.items.forEach(function (item) {
            item._group = gi;
            calibrated.push(item);
          });
        });

        var idx = 0;
        var lastGroup = -1;
        var clickHandler = null;

        var overlay = document.createElement('div');
        overlay.id = 'calib-overlay';
        L.DomEvent.disableClickPropagation(overlay);
        document.getElementById('map').appendChild(overlay);

        function step() {
          // Remove previous click handler before setting a new one
          if (clickHandler) { map.off('click', clickHandler); clickHandler = null; }

          if (idx >= calibrated.length) {
            finish();
            return;
          }

          var loc = calibrated[idx];
          var group = groups[loc._group];
          var enteringNewGroup = loc._group !== lastGroup;
          lastGroup = loc._group;

          overlay.innerHTML =
            '<div class="calib-name">' + loc.name + '</div>' +
            '<div class="calib-sub">Click on this location on the map</div>' +
            '<div class="calib-section">Section ' + (loc._group + 1) + ' of ' + groups.length +
              ' — ' + group.items.length + ' locations</div>' +
            '<div class="calib-progress">' + (idx + 1) + ' / ' + calibrated.length + '</div>' +
            '<button class="calib-skip">Skip</button>';

          overlay.querySelector('.calib-skip').addEventListener('click', function (e) {
            e.stopPropagation();
            if (clickHandler) { map.off('click', clickHandler); clickHandler = null; }
            idx++;
            step();
          });

          showCalibMarker(loc);

          if (enteringNewGroup) {
            var bounds = L.latLngBounds(toLL(group.x0, group.y0), toLL(group.x1, group.y1));
            map.flyToBounds(bounds, { duration: 0.6, padding: [30, 30] });
          }

          clickHandler = function (e) {
            calibrated[idx].px = Math.round(e.latlng.lng);
            calibrated[idx].py = Math.round(IMG_H - e.latlng.lat);
            idx++;
            step();
          };
          map.on('click', clickHandler);
        }

        function finish() {
          if (clickHandler) { map.off('click', clickHandler); clickHandler = null; }
          calibrating = false;
          clearHighlight();
          overlay.remove();

          // Update the live locations too, so later edits and exports keep this pass.
          calibrated.forEach(function (l) {
            locs[l._origIndex].px = l.px;
            locs[l._origIndex].py = l.py;
          });

          showExportModal('Calibration complete', JSON.stringify(locs, null, 2));
        }

        step();
      }
    });
}());
