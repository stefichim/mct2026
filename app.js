// --- CONFIGURATION ---
// Replace with your actual Mapbox Token
mapboxgl.accessToken = 'pk.eyJ1IjoiYW5kcmVpbW9sZG92YW4iLCJhIjoiY2t2bGI4bTFnMnA0bDJ2cTVjdnd5ejg4ciJ9.efC4UMaX2e0Yft-Qs9wEBQ';

const map = new mapboxgl.Map({
  container: 'map',
  style: 'mapbox://styles/mapbox/outdoors-v12', // Outdoors style is best for GPX
  center: [0, 0],
  zoom: 2
});

let chart, trackData = [];
const palette = ['#007bff', '#ff4757', '#2ed573', '#ffa502', '#6f42c1'];

// --- FILE HANDLING ---
document.getElementById("fileInput").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (evt) => {
    const xml = new DOMParser().parseFromString(evt.target.result, "text/xml");
    const geojson = toGeoJSON.gpx(xml);
    processData(geojson);
  };
  reader.readAsText(file);
});

function processData(geojson) {
  trackData = [];
  let totalDist = 0;

  // Extract name and pick a color
  const trackFeature = geojson.features.find(f => f.geometry.type === "LineString");
  const trackName = trackFeature.properties.name || "Track";
  
  // Deterministic color based on name
  let hash = 0;
  for (let i = 0; i < trackName.length; i++) hash = trackName.charCodeAt(i) + ((hash << 5) - hash);
  const themeColor = palette[Math.abs(hash) % palette.length];

  const coords = trackFeature.geometry.coordinates;
  coords.forEach((c, i) => {
    const pt = { lat: c[1], lon: c[0], ele: Math.round(c[2] || 0) };
    if (i > 0) totalDist += haversine(trackData[i-1], pt);
    pt.dist = Number((totalDist / 1000).toFixed(3));
    trackData.push(pt);
  });

  renderMap(geojson, themeColor);
  renderChart(trackName, themeColor);
}

function renderMap(geojson, color) {
  // Remove existing layers if any
  if (map.getLayer('route')) map.removeLayer('route');
  if (map.getSource('route')) map.removeSource('route');
  if (map.getLayer('hover-point')) map.removeLayer('hover-point');

  map.addSource('route', { type: 'geojson', data: geojson });

  map.addLayer({
    id: 'route',
    type: 'line',
    source: 'route',
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: { 'line-color': color, 'line-width': 4 }
  });

  // Hover Marker Layer
  map.addSource('hover-point', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] }
  });

  map.addLayer({
    id: 'hover-point',
    type: 'circle',
    source: 'hover-point',
    paint: { 'circle-radius': 6, 'circle-color': '#fff', 'circle-stroke-width': 2, 'circle-stroke-color': color }
  });

  // Fit bounds
  const coordinates = geojson.features[0].geometry.coordinates;
  const bounds = coordinates.reduce((acc, coord) => acc.extend(coord), new mapboxgl.LngLatBounds(coordinates[0], coordinates[0]));
  map.fitBounds(bounds, { padding: 50 });
}

function renderChart(name, color) {
  if (chart) chart.destroy();
  const ctx = document.getElementById("chart").getContext("2d");

  chart = new Chart(ctx, {
    type: "line",
    data: {
      labels: trackData.map(p => p.dist),
      datasets: [{
        data: trackData.map(p => p.ele),
        borderColor: color,
        borderWidth: 2,
        fill: true,
        backgroundColor: color + '22',
        pointRadius: 0,
        tension: 0
      }]
    },
options: {
  responsive: true,
  maintainAspectRatio: false,
  // CRITICAL FOR MOBILE:
  interaction: {
    mode: 'index',
    intersect: false,
  },
  plugins: {
    zoom: {
      limits: { x: { min: 0, max: 'original', minRange: 0.3 } },
      pan: { 
        enabled: true, 
        mode: 'x',
        modifierKey: null, // Allows panning without holding a key
      },
      zoom: {
        wheel: { enabled: true },
        pinch: { enabled: true }, // Enables pinch-to-zoom on mobile
        mode: 'x'
      }
    },
    tooltip: {
      enabled: true,
      position: 'nearest',
      external: function(context) {
        // Sync map when tooltip appears on touch
        const index = context.tooltip.dataPoints?.[0]?.dataIndex;
        if (index !== undefined) {
          const p = trackData[index];
          updateHoverPoint(p);
        }
      }
    }
  },
  scales: {
    x: { type: 'linear', title: { display: false } }, // Hide title on mobile to save space
    y: { ticks: { stepSize: 100 } }
  },
  // Ensure the map updates when dragging a finger across the chart
  onHover: (e, elements) => {
    if (elements.length > 0) {
      const i = elements[0].index;
      const p = trackData[i];
      updateHoverPoint(p);
      document.getElementById("info").innerText = `${p.dist}km | ${p.ele}m`;
    }
  }
}
  });
}

function updateHoverPoint(p) {
  const source = map.getSource('hover-point');
  if (source) {
    source.setData({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [p.lon, p.lat] }
    });
  }
}

function resetZoom() { if (chart) chart.resetZoom(); }

function haversine(a, b) {
  const R = 6371000;
  const toRad = x => x * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat), dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat/2)**2 + Math.cos(toRad(a.lat))*Math.cos(toRad(b.lat))*Math.sin(dLon/2)**2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function calculateSegmentGain() {
  const kmA = parseFloat(document.getElementById('kmA').value);
  const kmB = parseFloat(document.getElementById('kmB').value);
  const resultSpan = document.getElementById('segmentResult');

  if (isNaN(kmA) || isNaN(kmB)) {
    alert("Please enter valid numbers for both intervals.");
    return;
  }

  // Filter trackData to find points within the range
  const segment = trackData.filter(p => p.dist >= kmA && p.dist <= kmB);

  if (segment.length < 2) {
    resultSpan.innerText = " | No data in range";
    return;
  }

  let segmentGain = 0;
  for (let i = 1; i < segment.length; i++) {
    const diff = segment[i].ele - segment[i - 1].ele;
    if (diff > 0) {
      segmentGain += diff;
    }
  }

  resultSpan.innerHTML = ` | <b>Gain: ${Math.round(segmentGain)}m</b>`;
  
  // Optional: Highlight the segment on the chart
  highlightChartSegment(kmA, kmB);
}

// Visual feedback: Zoom the chart to that specific segment
function highlightChartSegment(a, b) {
  if (chart) {
    chart.zoomScale('x', { min: a, max: b }, 'original');
  }
}