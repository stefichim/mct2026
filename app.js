mapboxgl.accessToken = 'pk.eyJ1IjoiYW5kcmVpbW9sZG92YW4iLCJhIjoiY2t2bGI4bTFnMnA0bDJ2cTVjdnd5ejg4ciJ9.efC4UMaX2e0Yft-Qs9wEBQ';

let chart, trackData = [], allBounds;

// 1. INIȚIALIZARE HARTĂ - Vedere Globală
const map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/outdoors-v12',
    center: [0, 0], // Centrul coordonatelor (Oceanul Atlantic/Ecuator)
    zoom: 1.5,      // Zoom mic pentru a vedea tot globul
    cooperativeGestures: true 
});

// Adăugăm controlul de locație pentru a te găsi oriunde pe glob
map.addControl(new mapboxgl.GeolocateControl({
    positionOptions: { enableHighAccuracy: true },
    trackUserLocation: true,
    showUserHeading: true
}), 'top-right');

document.getElementById("fileInput").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    document.getElementById("info").innerText = "Se procesează...";
    reader.onload = (evt) => {
        const parser = new DOMParser();
        const xml = parser.parseFromString(evt.target.result, "text/xml");
        const geojson = toGeoJSON.gpx(xml);
        processData(geojson);
    };
    reader.readAsText(file);
});

function processData(geojson) {
    trackData = [];
    let totalDist = 0;
    const feature = geojson.features.find(f => f.geometry.type === 'LineString');
    if (!feature) return;

    feature.geometry.coordinates.forEach((c, i) => {
        // FILTRU Z: Eliminăm erorile sub nivelul mării
        let z = c[2] || 0;
        if (z < 0) z = 0; 

        const pt = { lon: c[0], lat: c[1], ele: Math.round(z) };
        if (i > 0) totalDist += haversine(trackData[i-1], pt);
        pt.dist = Number((totalDist / 1000).toFixed(3));
        trackData.push(pt);
    });

    renderMap(geojson);
    renderChart('#007bff');
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
                zoom: {
                    limits: {
                        // Limite pentru a preveni îngustarea profilului
                        x: { 
                            min: 0, 
                            max: maxDist, 
                            minRange: 0.2 // Minim 200m vizibili pe grafic
                        }
                    },
                    zoom: {
                        wheel: { enabled: true },
                        pinch: { enabled: true },
                        mode: 'x',
                        drag: {
                            enabled: true,
                            backgroundColor: 'rgba(0, 123, 255, 0.2)',
                            borderColor: color,
                            borderWidth: 1
                        },
                        onZoomComplete: ({chart}) => {
                            const {min, max} = chart.scales.x;
                            syncMapToZoom(min, max);
                        }
                    },
                    pan: { enabled: true, mode: 'x' }
                }
            },
            scales: {
                x: { 
                    type: 'linear', 
                    min: 0, 
                    max: maxDist,
                    ticks: { font: { size: 10 } } 
                },
                y: { 
                    min: 0, 
                    ticks: { font: { size: 10 } } 
                }
            },
            onHover: (e, elements) => {
                if (elements.length > 0) {
                    const p = trackData[elements[0].index];
                    if (map.getSource('hover-point')) {
                        map.getSource('hover-point').setData({
                            type: 'Feature',
                            geometry: { type: 'Point', coordinates: [p.lon, p.lat] }
                        });
                    }
                    document.getElementById("info").innerHTML = `<b>${p.dist} km</b> | Alt: <b>${p.ele} m</b>`;
                }
            }
        }
    });
}

function syncMapToZoom(minKm, maxKm) {
    const segment = trackData.filter(p => p.dist >= minKm && p.dist <= maxKm);
    if (segment.length < 2) return;
    const bounds = new mapboxgl.LngLatBounds();
    segment.forEach(p => bounds.extend([p.lon, p.lat]));
    map.fitBounds(bounds, { padding: 50, duration: 800 });
}

function renderMap(geojson) {
    if (map.getLayer('route')) map.removeLayer('route');
    if (map.getSource('route')) map.removeSource('route');
    map.addSource('route', { type: 'geojson', data: geojson });
    map.addLayer({
        id: 'route', type: 'line', source: 'route',
        paint: { 'line-color': '#007bff', 'line-width': 4 }
    });
    if (!map.getSource('hover-point')) {
        map.addSource('hover-point', { type: 'geojson', data: { type: 'Feature', geometry: { type: 'Point', coordinates: [] }}});
        map.addLayer({ id: 'hover-point', type: 'circle', source: 'hover-point', 
            paint: { 'circle-radius': 7, 'circle-color': '#fff', 'circle-stroke-width': 2, 'circle-stroke-color': '#007bff' }});
    }
    allBounds = new mapboxgl.LngLatBounds();
    geojson.features[0].geometry.coordinates.forEach(c => allBounds.extend(c));
    map.fitBounds(allBounds, { padding: 40 });
}

function haversine(a, b) {
    const R = 6371000;
    const rad = x => x * Math.PI / 180;
    const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
    const h = Math.sin(dLat/2)**2 + Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(dLon/2)**2;
    return 2 * R * Math.asin(Math.sqrt(h));
}

window.addEventListener('resize', () => map.resize());