/*
 * main.js
 * Implements map display, search, geolocation, routing and UI interactions.
 */

// Register service worker for offline support
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('./service-worker.js')
      .catch((err) => console.error('Service Worker registration failed:', err));
  });
}

// Global variables
let map;
let baseLayer;
let transitLayer;
let userMarker;
let routingControl;
let currentLocation = null;
let darkLayer;
let selectMode = false;
let selectedMarker = null;
let poiLayer = null;

// Initialize map after DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  initMap();
  setupUI();
});

function initMap() {
  // Create map centered on a default location (San Diego) with zoom 13
  map = L.map('map').setView([32.7157, -117.1611], 13);

  // Base OpenStreetMap tile layer
  baseLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
    maxZoom: 19
  }).addTo(map);

  // Dark base layer using CartoDB dark matter tiles for a sleek theme
  darkLayer = L.tileLayer(
    'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    {
      attribution:
        'Map tiles &copy; <a href="https://carto.com/attributions">Carto</a> & OpenStreetMap contributors',
      maxZoom: 19
    }
  );

  // Transit overlay from ÖPNVKarte (public transport)
  transitLayer = L.tileLayer(
    'https://tileserver.memomaps.de/tilegen/{z}/{x}/{y}.png',
    {
      attribution:
        'Transit data &copy; <a href="https://memomaps.de/">MeMoMaps</a>, Map data &copy; OpenStreetMap contributors',
      maxZoom: 18,
      opacity: 0.8
    }
  );

  // Initialize routing control but don't add to map yet
  routingControl = L.Routing.control({
    waypoints: [],
    routeWhileDragging: false,
    show: false,
    addWaypoints: false,
    collapsible: true,
    createMarker: function () {
      return null; // Hide default markers
    }
  });

  // Handle map click for location selection
  map.on('click', (e) => {
    if (!selectMode) return;
    const { lat, lng } = e.latlng;
    // Create or move the selected marker
    if (selectedMarker) {
      selectedMarker.setLatLng([lat, lng]);
    } else {
      selectedMarker = L.marker([lat, lng], {
        draggable: true,
        title: 'Selected location'
      })
        .addTo(map)
        .bindPopup(
          () =>
            `<strong>Selected location</strong><br/>Lat: ${lat.toFixed(
              5
            )}, Lon: ${lng.toFixed(5)}`,
          { autoClose: false }
        );
      selectedMarker.on('dragend', (ev) => {
        const { lat: dLat, lng: dLng } = ev.target.getLatLng();
        ev.target
          .getPopup()
          .setContent(
            `<strong>Selected location</strong><br/>Lat: ${dLat.toFixed(
              5
            )}, Lon: ${dLng.toFixed(5)}`
          );
      });
    }
    selectedMarker.openPopup();
    // Optionally exit selection mode after picking
    selectMode = false;
    const btn = document.getElementById('selectButton');
    if (btn) {
      btn.classList.remove('active');
    }
    map.getContainer().style.cursor = '';
  });
}

function setupUI() {
  const searchBox = document.getElementById('searchBox');
  const searchButton = document.getElementById('searchButton');
  const locateButton = document.getElementById('locateButton');
  const selectButton = document.getElementById('selectButton');
  const poiButton = document.getElementById('poiButton');
  const transitToggle = document.getElementById('transitToggle');
  const darkToggle = document.getElementById('darkToggle');

  // Search button click event
  searchButton.addEventListener('click', () => {
    const query = searchBox.value.trim();
    if (query) {
      geocodeQuery(query);
    }
  });

  // Pressing Enter triggers search
  searchBox.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      searchButton.click();
    }
  });

  // Locate button: use browser geolocation
  locateButton.addEventListener('click', () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude } = pos.coords;
          currentLocation = L.latLng(latitude, longitude);
          // Add or move marker
          if (userMarker) {
            userMarker.setLatLng(currentLocation);
          } else {
            userMarker = L.marker(currentLocation, {
              title: 'Your location'
            }).addTo(map);
          }
          map.setView(currentLocation, 15);
        },
        (err) => {
          alert('Geolocation failed: ' + err.message);
        }
      );
    } else {
      alert('Geolocation is not supported by your browser.');
    }
  });

  // Transit overlay toggle
  transitToggle.addEventListener('change', () => {
    if (transitToggle.checked) {
      transitLayer.addTo(map);
    } else {
      map.removeLayer(transitLayer);
    }
  });

  // Dark mode toggle
  darkToggle.addEventListener('change', () => {
    if (darkToggle.checked) {
      document.body.classList.add('dark-mode');
      // switch to dark map tiles
      if (map.hasLayer(baseLayer)) {
        map.removeLayer(baseLayer);
      }
      darkLayer.addTo(map);
    } else {
      document.body.classList.remove('dark-mode');
      // switch back to light tiles
      if (map.hasLayer(darkLayer)) {
        map.removeLayer(darkLayer);
      }
      baseLayer.addTo(map);
    }
  });

  // Select location button toggles selection mode
  selectButton.addEventListener('click', () => {
    selectMode = !selectMode;
    if (selectMode) {
      selectButton.classList.add('active');
      map.getContainer().style.cursor = 'crosshair';
    } else {
      selectButton.classList.remove('active');
      map.getContainer().style.cursor = '';
      // remove selected marker if selection cancelled
      if (selectedMarker) {
        map.removeLayer(selectedMarker);
        selectedMarker = null;
      }
    }
  });

  // POI button toggles POIs display
  poiButton.addEventListener('click', () => {
    if (poiLayer) {
      map.removeLayer(poiLayer);
      poiLayer = null;
      poiButton.classList.remove('active');
    } else {
      fetchPOIs();
    }
  });
}

// Perform geocoding using Nominatim
function geocodeQuery(query) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
    query
  )}&limit=5`;
  fetch(url, {
    headers: {
      'User-Agent': 'OSM-Explorer/1.0 (https://example.com)',
      'Accept-Language': 'en'
    }
  })
    .then((res) => res.json())
    .then((results) => {
      if (results && results.length > 0) {
        // Use the first result
        const place = results[0];
        const lat = parseFloat(place.lat);
        const lon = parseFloat(place.lon);
        map.setView([lat, lon], 15);
        // Add marker for searched location
        const marker = L.marker([lat, lon], {
          title: place.display_name
        })
          .addTo(map)
          .bindPopup(
            `<strong>${place.display_name}</strong><br/><button id="routeTo">Route from current location</button>`
          )
          .openPopup();
        // Add click event to compute route
        marker.on('popupopen', () => {
          const btn = document.getElementById('routeTo');
          if (btn) {
            btn.addEventListener('click', () => {
              if (!currentLocation) {
                alert('Please click "Locate Me" first to determine your starting point.');
                return;
              }
              const start = currentLocation;
              const dest = L.latLng(lat, lon);
              calculateRoute(start, dest);
            });
          }
        });
      } else {
        alert('No results found.');
      }
    })
    .catch((err) => {
      console.error(err);
      alert('Failed to fetch geocoding results.');
    });
}

// Calculate driving route using OSRM and display instructions
function calculateRoute(start, dest) {
  // Remove any existing route
  if (routingControl) {
    routingControl.setWaypoints([start, dest]);
    routingControl.addTo(map);
    routingControl.on('routesfound', (e) => {
      const routes = e.routes;
      if (routes && routes.length > 0) {
        const summary = routes[0].summary;
        const instructions = routes[0].instructions || [];
        showDirections(instructions, summary);
      }
    });
    routingControl.on('routingerror', (e) => {
      console.error(e);
      alert('Failed to calculate route.');
    });
  }
}

// Display route instructions in side panel
function showDirections(instructions, summary) {
  const panel = document.getElementById('routingPanel');
  panel.innerHTML = '';
  if (summary) {
    const distanceKm = (summary.totalDistance / 1000).toFixed(1);
    const timeMin = Math.round(summary.totalTime / 60);
    panel.innerHTML += `<h3>Route summary</h3><p>Distance: ${distanceKm} km<br/>Estimated time: ${timeMin} min</p>`;
  }
  if (instructions && instructions.length > 0) {
    panel.innerHTML += '<h3>Directions</h3><ol class="directions-list"></ol>';
    const list = panel.querySelector('.directions-list');
    instructions.forEach((instr) => {
      const li = document.createElement('li');
      li.textContent = instr.text;
      list.appendChild(li);
    });
  }
  panel.style.display = 'block';
}

// Fetch points of interest within the current map view using Overpass API
function fetchPOIs() {
  // Indicate loading state
  const poiButton = document.getElementById('poiButton');
  if (poiButton) {
    poiButton.classList.add('loading');
  }
  const bounds = map.getBounds();
  const southWest = bounds.getSouthWest();
  const northEast = bounds.getNorthEast();
  // Build Overpass query: fetch amenities, shops and tourist attractions
  const query = `
    [out:json][timeout:25];
    (
      node["amenity"](${southWest.lat},${southWest.lng},${northEast.lat},${northEast.lng});
      node["shop"](${southWest.lat},${southWest.lng},${northEast.lat},${northEast.lng});
      node["tourism"](${southWest.lat},${southWest.lng},${northEast.lat},${northEast.lng});
    );
    out center;
  `;
  const url = 'https://overpass-api.de/api/interpreter?data=' + encodeURIComponent(query);
  fetch(url)
    .then((res) => res.json())
    .then((data) => {
      // Remove existing POI layer if present
      if (poiLayer) {
        map.removeLayer(poiLayer);
      }
      poiLayer = L.layerGroup();
      if (data && data.elements) {
        data.elements.forEach((el) => {
          if (el.lat && el.lon) {
            const name = el.tags && (el.tags.name || el.tags['brand'] || 'POI');
            const category = el.tags && (el.tags.amenity || el.tags.shop || el.tags.tourism || '');
            const marker = L.marker([el.lat, el.lon]);
            marker.bindPopup(
              `<strong>${name}</strong><br/>${category ? category : ''}`
            );
            poiLayer.addLayer(marker);
          }
        });
      }
      poiLayer.addTo(map);
      if (poiButton) {
        poiButton.classList.remove('loading');
        poiButton.classList.add('active');
      }
    })
    .catch((err) => {
      console.error(err);
      alert('Failed to load POIs');
      if (poiButton) {
        poiButton.classList.remove('loading');
      }
    });
}