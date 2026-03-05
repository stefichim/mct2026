mapboxgl.accessToken = 'pk.eyJ1IjoiYW5kcmVpbW9sZG92YW4iLCJhIjoiY2t2bGI4bTFnMnA0bDJ2cTVjdnd5ejg4ciJ9.efC4UMaX2e0Yft-Qs9wEBQ';

let chart, trackData = [], allBounds;

const map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/outdoors-v12',
    center: [0, 0],
    zoom: 2,
    cooperativeGestures: true 
});

map.addControl(new mapboxgl.GeolocateControl({
    positionOptions: { enableHighAccuracy: true },
    trackUserLocation: true,
    showUserHeading: true
}), 'top-right');

document.getElementById("fileInput").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    document.getElementById("info").innerText = "Procesare traseu...";
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
    if (!feature) return alert("Nu am găsit coordonate valide.");

    feature.geometry.coordinates.forEach((c, i) => {
        const pt = { lon: c[0], lat: c[1], ele: Math.round(c[2] || 0) };
        if (i > 0) totalDist += haversine(trackData[i-1], pt);
        pt.dist = Number((totalDist / 1000).toFixed(3));
        trackData.push(pt);
    });

    renderMap(geojson, '#007bff');
    renderChart("Traseu", '#007bff');
}

function renderMap(geojson, color) {
    if (map.getLayer('route')) map.removeLayer('route');
    if (map.getSource('route')) map.removeSource('route');
    map.addSource('route', { type: 'geojson', data: geojson });
    map.addLayer({
        id: 'route', type: 'line', source: 'route',
        paint: { 'line-color': color, 'line-width': 4 }
    });
    if (!map.getSource('hover-point')) {
        map.addSource('hover-point', { type: 'geojson', data: { type: 'Feature', geometry: { type: 'Point', coordinates: [] }}});
        map.addLayer({ id: 'hover-point', type: 'circle', source: 'hover-point', 
            paint: { 'circle-radius': 7, 'circle-color': '#fff', 'circle-stroke-width': 2, 'circle-stroke-color': color }});
    }
    allBounds = new mapboxgl.LngLatBounds();
    geojson.features[0].geometry.coordinates.forEach(c => allBounds.extend(c));
    map.fitBounds(allBounds, { padding: 40 });
}
// ... (Păstrează partea de sus cu Token, Map și File Input neschimbată)

// ... (Păstrează restul codului neschimbat până la renderChart)
// ... (Păstrează partea de sus cu Token și Map neschimbată)

function renderChart(name, color) {
    if (chart) chart.destroy();
    const ctx = document.getElementById("chart").getContext("2d");
    
    const gradient = ctx.createLinearGradient(0, 0, 0, 200);
    gradient.addColorStop(0, color + 'aa');
    gradient.addColorStop(1, color + '05');

    const maxDist = trackData[trackData.length - 1].dist;

    chart = new Chart(ctx, {
        type: "line",
        data: {
            labels: trackData.map(p => p.dist),
            datasets: [{
                data: trackData.map(p => p.ele),
                borderColor: color,
                fill: true,
                backgroundColor: gradient,
                pointRadius: 0,
                tension: 0.1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            onClick: (e) => {
                // Double tap pentru reset complet
                if (e.native.detail === 2) {
                    chart.resetZoom();
                    clearSelection();
                }
            },
            plugins: {
                legend: { display: false },
                zoom: {
                    limits: {
                        // FIX: Limităm strict axa X să nu poată ieși din decor
                        x: { min: 0, max: maxDist, minRange: 0.01 }
                    },
                    zoom: {
                        wheel: { enabled: true },
                        pinch: { enabled: true },
                        mode: 'x',
                        drag: {
                            enabled: true,
                            backgroundColor: 'rgba(0, 123, 255, 0.2)',
                            borderColor: color,
                            borderWidth: 1,
                            // FIX: Forțăm redesenarea corectă a zonei de selecție
                            drawTime: 'beforeDatasetsDraw' 
                        },
                        onZoomComplete: ({chart}) => {
                            // Luăm valorile MIN/MAX direct din scalele actualizate
                            // Asta elimină eroarea de calcul invers
                            const xAxis = chart.scales.x;
                            calculateSegment(xAxis.min, xAxis.max);
                        }
                    },
                    pan: {
                        enabled: true,
                        mode: 'x',
                        threshold: 10 // Previne mișcarea accidentală la tap
                    }
                }
            },
            scales: {
                x: { 
                    type: 'linear', 
                    // FIX: Eliminăm setările de min/max fixe de aici 
                    // pentru a permite scalelor să se recalculeze natural
                    ticks: { font: { size: 10 } } 
                },
                y: { 
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

function calculateSegment(minKm, maxKm) {
    const display = document.getElementById('segment-display');
    const text = document.getElementById('segment-text');
    
    // Normalizăm valorile (în caz că drag-ul a fost făcut de la dreapta la stânga)
    const start = Math.max(0, Math.min(minKm, maxKm));
    const end = Math.min(trackData[trackData.length - 1].dist, Math.max(minKm, maxKm));

    const segment = trackData.filter(p => p.dist >= start && p.dist <= end);
    
    if (segment.length < 2) return;

    let gain = 0, loss = 0;
    for (let i = 1; i < segment.length; i++) {
        const diff = segment[i].ele - segment[i - 1].ele;
        if (diff > 0) gain += diff; else loss += Math.abs(diff);
    }

    const d = (segment[segment.length - 1].dist - segment[0].dist).toFixed(2);
    display.style.display = 'flex';
    text.innerHTML = `<b>${d} km</b> | <span style="color:green">↑${Math.round(gain)}m</span> | <span style="color:red">↓${Math.round(loss)}m</span>`;

    const bounds = new mapboxgl.LngLatBounds();
    segment.forEach(p => bounds.extend([p.lon, p.lat]));
    map.fitBounds(bounds, { padding: 50, duration: 800 });
}
function clearSelection() {
    document.getElementById('segment-display').style.display = 'none';
    if (chart) chart.resetZoom();
    if (allBounds) map.fitBounds(allBounds, { padding: 40 });
}

function getDeterministicColor(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
    return palette[Math.abs(hash) % palette.length];
}

function haversine(a, b) {
    const R = 6371000;
    const rad = x => x * Math.PI / 180;
    const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
    const h = Math.sin(dLat/2)**2 + Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(dLon/2)**2;
    return 2 * R * Math.asin(Math.sqrt(h));
}

window.addEventListener('resize', () => map.resize());