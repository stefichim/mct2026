mapboxgl.accessToken = 'pk.eyJ1IjoiYW5kcmVpbW9sZG92YW4iLCJhIjoiY2t2bGI4bTFnMnA0bDJ2cTVjdnd5ejg4ciJ9.efC4UMaX2e0Yft-Qs9wEBQ';

let chart;
let trackData = [];
let poiPoints = [];
let allBounds;
let currentGeoJSON = null;
let poiGeoJSON = null;

const map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/outdoors-v12',
    center: [0,0],
    zoom: 2
});

map.addControl(new mapboxgl.NavigationControl(), 'top-right');

function changeStyle(styleUrl) {
    map.setStyle(styleUrl);
    map.once('style.load', () => {
        if (currentGeoJSON) renderMap(currentGeoJSON);
    });
}


// ============================
// FILE INPUT TRASEU
// ============================

document.getElementById("fileInput").addEventListener("change", (e)=>{

    const file = e.target.files[0];
    if(!file) return;

    const fileName = file.name.toLowerCase();
    const reader = new FileReader();

    reader.onload = (evt)=>{

        try{

            let geojson;
            const content = evt.target.result;

            if(fileName.endsWith('.geojson') || fileName.endsWith('.json')){

                geojson = JSON.parse(content);

            }else{

                const parser = new DOMParser();
                const xml = parser.parseFromString(content,"text/xml");

                geojson = fileName.endsWith('.kml')
                    ? toGeoJSON.kml(xml)
                    : toGeoJSON.gpx(xml);

            }

            currentGeoJSON = geojson;
            processData(geojson);

        }catch(err){

            console.error(err);
            alert("Eroare la procesarea fișierului");

        }

    };

    reader.readAsText(file);

});


// ============================
// FILE INPUT POI
// ============================

document.getElementById("poiInput").addEventListener("change",(e)=>{

    const file = e.target.files[0];
    if(!file) return;

    const reader = new FileReader();

    reader.onload = (evt)=>{

        try{

            poiGeoJSON = JSON.parse(evt.target.result);
            addPOILayer(poiGeoJSON);

        }catch(err){

            console.error(err);
            alert("GeoJSON POI invalid");

        }

    };

    reader.readAsText(file);

});


// ============================
// PROCESS DATA
// ============================

function processData(geojson) {
    let rawData = [];
    let totalDist = 0;

    // În loc de .find(), folosim .forEach() pentru a parcurge TOATE elementele
    geojson.features.forEach(feature => {
        // Verificăm dacă elementul este o linie (LineString sau MultiLineString)
        // Librăria toGeoJSON transformă <trk> și <rte> în aceste tipuri
        if (feature.geometry.type === 'LineString') {
            const coords = feature.geometry.coordinates;
            coords.forEach(c => {
                rawData.push({
                    lon: c[0],
                    lat: c[1],
                    ele: c[2] || 0
                });
            });
        } else if (feature.geometry.type === 'MultiLineString') {
            // Dacă un <trk> are mai multe <trkseg>, devine adesea MultiLineString
            feature.geometry.coordinates.forEach(segment => {
                segment.forEach(c => {
                    rawData.push({ lon: c[0], lat: c[1], ele: c[2] || 0 });
                });
            });
        }
    });

    if (rawData.length === 0) {
        alert("Nu s-au găsit date de tip traseu în fișier.");
        return;
    }

    // Calculăm distanța cumulativă și profilul de elevație
    trackData = rawData.map((pt, i, arr) => {
        // Aplicăm un mic smoothing (Moving Average) pentru a rafina distanța
        if (i > 0) {
            totalDist += haversine(arr[i - 1], pt);
        }
        return {
            ...pt,
            dist: totalDist / 1000 // KM
        };
    });

    renderChart('#007bff');
    renderMap(geojson);

    const kmTotal = (totalDist / 1000).toFixed(2);
    document.getElementById("info").innerText = `Traseu total: ${kmTotal} km | Puncte: ${rawData.length}`;
}


// ============================
// RENDER MAP
// ============================

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

/*
function renderMap(geojson){

    if(map.getLayer('route')) map.removeLayer('route');
    if(map.getSource('route')) map.removeSource('route');

    map.addSource('route',{
        type:'geojson',
        data:geojson
    });

    map.addLayer({
        id:'route',
        type:'line',
        source:'route',
        paint:{
            'line-color':'#007bff',
            'line-width':4
        }
    });

    map.addSource('hover-point',{
        type:'geojson',
        data:{
            type:'Feature',
            geometry:{type:'Point',coordinates:[]}
        }
    });

    map.addLayer({
        id:'hover-point',
        type:'circle',
        source:'hover-point',
        paint:{
            'circle-radius':7,
            'circle-color':'white',
            'circle-stroke-width':2,
            'circle-stroke-color':'#007bff'
        }
    });

    allBounds = new mapboxgl.LngLatBounds();

    trackData.forEach(p=>{
        allBounds.extend([p.lon,p.lat]);
    });

    map.fitBounds(allBounds,{padding:40});

}
*/


// ============================
// ADD POI
// ============================

function addPOILayer(geojson){

    if(map.getLayer('poi-layer')) map.removeLayer('poi-layer');
    if(map.getLayer('poi-cluster')) map.removeLayer('poi-cluster');
    if(map.getLayer('poi-count')) map.removeLayer('poi-count');
    if(map.getSource('poi-source')) map.removeSource('poi-source');

    // Add source with clustering
    map.addSource('poi-source',{
        type:'geojson',
        data:geojson,
        cluster: true,
        clusterMaxZoom: 14, // max zoom to cluster points
        clusterRadius: 50 // radius of each cluster
    });

    // Cluster circles
    map.addLayer({
        id: 'poi-cluster',
        type: 'circle',
        source: 'poi-source',
        filter: ['has', 'point_count'],
        paint: {
            'circle-color': '#ff7f50',
            'circle-radius': [
                'step',
                ['get', 'point_count'],
                15,  // 1-9 points
                10, 20, // 10-29 points
                30, 25, // 30+ points
            ],
            'circle-stroke-width': 2,
            'circle-stroke-color': '#fff'
        }
    });

    // Cluster labels
    map.addLayer({
        id: 'poi-count',
        type: 'symbol',
        source: 'poi-source',
        filter: ['has','point_count'],
        layout: {
            'text-field': '{point_count_abbreviated}',
            'text-font': ['Arial Unicode MS Bold'],
            'text-size': 12
        },
        paint: {
            'text-color': '#fff'
        }
    });

    // Individual POIs with custom icon (accommodation)
    map.loadImage('https://img.icons8.com/emoji/48/000000/hotel-emoji.png', function(error, image) {
        if (error) throw error;
        if (!map.hasImage('accommodation')) map.addImage('accommodation', image);

        map.addLayer({
            id: 'poi-layer',
            type: 'symbol',
            source: 'poi-source',
            filter: ['!', ['has', 'point_count']], // only single points
            layout: {
                'icon-image': 'accommodation',
                'icon-size': 0.7,
                'icon-allow-overlap': true
            }
        });
    });

    generatePOIForChart(geojson);
}


// ============================
// POI PE PROFIL
// ============================

function generatePOIForChart(geojson){

    poiPoints = geojson.features.map(f=>{

        const coord = f.geometry.coordinates;

        let closest = trackData.reduce((prev,curr)=>{

            const d1 = Math.abs(curr.lon-coord[0])+Math.abs(curr.lat-coord[1]);
            const d2 = Math.abs(prev.lon-coord[0])+Math.abs(prev.lat-coord[1]);

            return d1<d2 ? curr : prev;

        });

        return{
            dist:closest.dist,
            name:f.properties?.name || "POI"
        };

    });

    renderChart('#007bff');

}


// ============================
// CLICK POI
// ============================

map.on('click','poi-layer',(e)=>{

    const feature = e.features[0];
    const coord = feature.geometry.coordinates;
    const props = feature.properties || {};

    // construim HTML frumos
    let html = `<div style="
        max-width:300px; 
        padding:10px; 
        border-radius:8px; 
        background: rgba(255,255,255,0.95); 
        box-shadow: 0 4px 12px rgba(0,0,0,0.2); 
        font-family: Arial, sans-serif;
        font-size: 14px;
        color: #333;
    ">`;

    Object.keys(props).forEach(key => {

        const value = props[key];
        if(value !== null && value !== undefined && value !== ""){

            // icon simplu pentru anumite chei
            let icon = '';
            if(key.toLowerCase().includes('name')) icon = '📍 ';
            if(key.toLowerCase().includes('apa')) icon = '💧 ';
            if(key.toLowerCase().includes('tip')) icon = '🏕️ ';

            // linkuri clickabile
            let displayValue = value;
            if(typeof value === "string" && value.startsWith("http")){
                displayValue = `<a href="${value}" target="_blank">${value}</a>`;
            }

            html += `<div style="margin-bottom:4px;"><strong>${icon}${key}</strong>: ${displayValue}</div>`;
        }

    });

    html += `</div>`;

    new mapboxgl.Popup({offset:25,closeButton:true})
        .setLngLat(coord)
        .setHTML(html)
        .addTo(map);


    // highlight pe profil
    let closestIndex = trackData.reduce((best,p,i)=>{

        const d = Math.abs(p.lon-coord[0]) + Math.abs(p.lat-coord[1]);

        if(d < best.dist){
            best.dist = d;
            best.index = i;
        }

        return best;

    },{dist:Infinity,index:0}).index;

    chart.setActiveElements([{datasetIndex:0,index:closestIndex}]);
    chart.tooltip.setActiveElements([{datasetIndex:0,index:closestIndex}],{x:0,y:0});
    chart.update();

});

// ============================
// RENDER CHART
// ============================

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
// ============================
// HAVERSINE
// ============================

function haversine(a,b){

    const R = 6371000;
    const rad = x=>x*Math.PI/180;

    const h =
        Math.sin(rad(b.lat-a.lat)/2)**2 +
        Math.cos(rad(a.lat))*Math.cos(rad(b.lat)) *
        Math.sin(rad(b.lon-a.lon)/2)**2;

    return 2*R*Math.asin(Math.sqrt(h));

}

window.addEventListener('resize',()=>map.resize());