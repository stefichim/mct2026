mapboxgl.accessToken = 'pk.eyJ1IjoiYW5kcmVpbW9sZG92YW4iLCJhIjoiY2t2bGI4bTFnMnA0bDJ2cTVjdnd5ejg4ciJ9.efC4UMaX2e0Yft-Qs9wEBQ';

let chart, trackData = [], allBounds, currentGeoJSON = null;

const map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/outdoors-v12',
    center: [0, 0],
    zoom: 1.5,
    cooperativeGestures: false, // Un singur deget pe mobil
    dragPan: true
});

function changeStyle(styleUrl) {
    map.setStyle(styleUrl);
    map.once('style.load', () => {
        if (currentGeoJSON) renderMap(currentGeoJSON);
    });
}

map.addControl(new mapboxgl.NavigationControl({ showCompass: true }), 'top-right');
map.addControl(new mapboxgl.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: true }), 'top-right');

document.getElementById("fileInput").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
        try {
            const parser = new DOMParser();
            const xml = parser.parseFromString(evt.target.result, "text/xml");
            const geojson = toGeoJSON.gpx(xml);
            currentGeoJSON = geojson;
            processData(geojson);
        } catch (err) { alert("Eroare la procesarea GPX-ului."); }
    };
    reader.readAsText(file);
});

function processData(geojson) {
    let rawData = [];
    let totalDist = 0;
    const feature = geojson.features.find(f => f.geometry.type === 'LineString');
    if (!feature) return;

    const coords = feature.geometry.coordinates;
    coords.forEach((c) => {
        let z = c[2] || 0;
        if (z < 0) z = 0;
        rawData.push({ lon: c[0], lat: c[1], ele: z });
    });

    // SMOOTHING: Moving Average (5 puncte)
    trackData = rawData.map((pt, i, arr) => {
        const windowSize = 5;
        const startIdx = Math.max(0, i - Math.floor(windowSize / 2));
        const endIdx = Math.min(arr.length, startIdx + windowSize);
        const subSet = arr.slice(startIdx, endIdx);
        const avgEle = subSet.reduce((sum, p) => sum + p.ele, 0) / subSet.length;

        if (i > 0) totalDist += haversine(arr[i-1], pt);
        
        return {
            ...pt,
            ele: Math.round(avgEle),
            dist: Number((totalDist / 1000).toFixed(3))
        };
    });

    renderMap(geojson);
    renderChart('#007bff');
    document.getElementById("info").innerText = `Traseu: ${(totalDist / 1000).toFixed(2)} km`;
}

function renderChart(color) {
    if (chart) chart.destroy();
    const ctx = document.getElementById("chart").getContext("2d");
    const maxDist = trackData[trackData.length - 1].dist;

    chart = new Chart(ctx, {
        type: "line",
        data: {
            labels: trackData.map(p => p.dist),
            datasets: [{
                data: trackData.map(p => p.ele),
                borderColor: color,
                fill: true,
                backgroundColor: color + '22',
                pointRadius: 0,
                tension: 0.1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { display: false },
                tooltip: {
                    enabled: true,
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    callbacks: {
                        title: (items) => `Km: ${Math.floor(items[0].parsed.x)}`,
                        label: (item) => `Alt: ${Math.round(item.parsed.y)} m`
                    }
                },
                zoom: {
                    limits: { x: { min: 0, max: maxDist, minRange: 0.1 } },
                    zoom: {
                        wheel: { enabled: true }, pinch: { enabled: true }, mode: 'x',
                        drag: { enabled: true, backgroundColor: 'rgba(0, 123, 255, 0.2)' },
                        onZoomComplete: ({chart}) => syncMapToZoom(chart.scales.x.min, chart.scales.x.max)
                    },
                    pan: { enabled: true, mode: 'x' }
                }
            },
            scales: {
                x: { type: 'linear', min: 0, max: maxDist, ticks: { callback: v => Math.floor(v) } },
                y: { min: 0 }
            },
            onHover: (e, elements) => {
                if (elements.length > 0) {
                    const p = trackData[elements[0].index];
                    if (map.getSource('hover-point')) {
                        map.getSource('hover-point').setData({ type: 'Feature', geometry: { type: 'Point', coordinates: [p.lon, p.lat] }});
                    }
                }
            }
        }
    });
}

function fullReset() {
    if (chart) chart.resetZoom();
    if (allBounds) map.fitBounds(allBounds, { padding: 40 });
    map.easeTo({ bearing: 0, pitch: 0 }); 
}

function calculateSegmentGain() {
    const start = Math.min(parseFloat(document.getElementById('kmA').value) || 0, parseFloat(document.getElementById('kmB').value) || 0);
    const end = Math.max(parseFloat(document.getElementById('kmA').value) || 0, parseFloat(document.getElementById('kmB').value) || 0);
    const segment = trackData.filter(p => p.dist >= start && p.dist <= end);
    if (segment.length < 2) return;
    let gain = 0;
    for (let i = 1; i < segment.length; i++) {
        const diff = segment[i].ele - segment[i - 1].ele;
        if (diff > 0) gain += diff;
    }
    document.getElementById('segmentResult').innerHTML = `↑${Math.round(gain)}m`;
}

function syncMapToZoom(minKm, maxKm) {
    const segment = trackData.filter(p => p.dist >= minKm && p.dist <= maxKm);
    if (segment.length < 2) return;
    const bounds = new mapboxgl.LngLatBounds();
    segment.forEach(p => bounds.extend([p.lon, p.lat]));
    map.fitBounds(bounds, { padding: 50 });
}

function renderMap(geojson) {
    if (map.getLayer('route')) map.removeLayer('route');
    if (map.getSource('route')) map.removeSource('route');
    if (map.getLayer('hover-point')) map.removeLayer('hover-point');
    if (map.getSource('hover-point')) map.removeSource('hover-point');
    map.addSource('route', { type: 'geojson', data: geojson });
    map.addLayer({ id: 'route', type: 'line', source: 'route', paint: { 'line-color': '#007bff', 'line-width': 4 }});
    map.addSource('hover-point', { type: 'geojson', data: { type: 'Feature', geometry: { type: 'Point', coordinates: [] }}});
    map.addLayer({ id: 'hover-point', type: 'circle', source: 'hover-point', paint: { 'circle-radius': 7, 'circle-color': '#fff', 'circle-stroke-width': 2, 'circle-stroke-color': '#007bff' }});
    allBounds = new mapboxgl.LngLatBounds();
    geojson.features[0].geometry.coordinates.forEach(c => allBounds.extend(c));
    map.fitBounds(allBounds, { padding: 40 });
}

function haversine(a, b) {
    const R = 6371000;
    const rad = x => x * Math.PI / 180;
    const h = Math.sin(rad(b.lat-a.lat)/2)**2 + Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(rad(b.lon-a.lon)/2)**2;
    return 2 * R * Math.asin(Math.sqrt(h));
}

window.addEventListener('resize', () => map.resize());