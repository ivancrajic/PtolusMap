(function () {
  const IMG_W = 5976;
  const IMG_H = 3960;

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
    map.flyTo(latlng, isLarge ? -1 : 0, { duration: 0.75 });
    if (listItem) {
      listItem.classList.add('active');
      listItem.scrollIntoView({ block: 'nearest' });
      activeListItem = listItem;
    }
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

      buildList(locations);

      input.addEventListener('input', function () {
        var q = input.value.toLowerCase().trim();
        clearBtn.style.display = q ? 'block' : 'none';
        var filtered = q ? locations.filter(function (l) {
          return l.name.toLowerCase().includes(q);
        }) : locations;
        buildList(filtered);
        if (q && filtered.length === 1) {
          showHighlight(filtered[0], list.querySelector('li'));
        }
      });

      clearBtn.addEventListener('click', function () {
        input.value = '';
        clearBtn.style.display = 'none';
        buildList(locations);
        clearHighlight();
        map.fitBounds(bounds, { padding: [8, 8], animate: true, duration: 0.6 });
      });

      map.on('click', function () {
        if (!calibrating) clearHighlight();
      });

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

          var json = JSON.stringify(locations, null, 2);
          var modal = document.createElement('div');
          modal.id = 'calib-export';
          modal.innerHTML =
            '<div class="export-title">' + loc.name + ' updated</div>' +
            '<div class="export-sub">Select all and copy, then replace locations.json</div>' +
            '<textarea class="export-textarea" readonly>' + json + '</textarea>' +
            '<button class="export-close">Done</button>';
          document.body.appendChild(modal);
          modal.querySelector('.export-textarea').select();
          modal.querySelector('.export-close').addEventListener('click', function () {
            modal.remove();
          });
        };
        map.on('click', clickHandler);
      }

      function startCalibration(locs) {
        calibrating = true;
        clearHighlight();

        var calibrated = locs.map(function (l) { return Object.assign({}, l); });
        var idx = 0;
        var clickHandler = null;

        var overlay = document.createElement('div');
        overlay.id = 'calib-overlay';
        document.getElementById('map').appendChild(overlay);

        function step() {
          // Remove previous click handler before setting a new one
          if (clickHandler) { map.off('click', clickHandler); clickHandler = null; }

          if (idx >= calibrated.length) {
            finish();
            return;
          }

          var loc = calibrated[idx];
          overlay.innerHTML =
            '<div class="calib-name">' + loc.name + '</div>' +
            '<div class="calib-sub">Click on this location on the map</div>' +
            '<div class="calib-progress">' + (idx + 1) + ' / ' + calibrated.length + '</div>' +
            '<button class="calib-skip">Skip</button>';

          overlay.querySelector('.calib-skip').addEventListener('click', function (e) {
            e.stopPropagation();
            if (clickHandler) { map.off('click', clickHandler); clickHandler = null; }
            idx++;
            step();
          });

          map.flyTo(toLL(loc.px, loc.py), -1, { duration: 0.4 });

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
          overlay.remove();

          // Show the result in a copyable textarea (reliable across all browsers)
          var json = JSON.stringify(calibrated, null, 2);
          var modal = document.createElement('div');
          modal.id = 'calib-export';
          modal.innerHTML =
            '<div class="export-title">Calibration complete</div>' +
            '<div class="export-sub">Select all and copy, then replace locations.json</div>' +
            '<textarea class="export-textarea" readonly>' + json + '</textarea>' +
            '<button class="export-close">Done</button>';
          document.body.appendChild(modal);
          modal.querySelector('.export-textarea').select();
          modal.querySelector('.export-close').addEventListener('click', function () {
            modal.remove();
          });
        }

        step();
      }
    });
}());
