/* ============================================================
   CLOUD SMART VEHICLE TRACKING SYSTEM — main application
   ------------------------------------------------------------
   Vanilla JavaScript. No frameworks, no build step.
   Works in two modes:
     • LIVE — listens to Firebase Realtime Database /vehicles
     • DEMO — uses DemoSimulator (no keys / no hardware needed)
   ============================================================ */

/* ---------------- global state ---------------- */
const vehicles = {};        // id -> { name, current, history }
let selectedId = null;
let liveMap, histMap;      // Leaflet maps
const markers = {};        // id -> Leaflet marker (live map)
let histRouteLine = null, histPlayMarker = null, histEndMarkers = [];
let histPoints = [], playTimer = null, histType = undefined;

/* ---------------- vehicle types ----------------
   The type comes from the vehicle's own data:
     demo mode  → assigned in js/demo-simulator.js
     live mode  → /vehicles/<id>/type in Firebase
   Supported: bike | car | bus | auto | truck           */
const VEHICLE_TYPES = {
  bike:  { icon: "🏍️", label: "Bike" },
  car:   { icon: "🚗", label: "Car" },
  bus:   { icon: "🚌", label: "Bus" },
  auto:  { icon: "🛺", label: "Auto Rickshaw" },
  truck: { icon: "🚚", label: "Truck" },
  ambulance: { icon: "🚑", label: "Ambulance" },
};
const typeInfo = (t) => VEHICLE_TYPES[t] || VEHICLE_TYPES.car;

/* live map marker — an icon that matches the vehicle's type */
const vehicleIcon = (type) => L.divIcon({
  className: "",
  html: `<div style="font-size:34px;line-height:34px;
         filter:drop-shadow(0 2px 3px rgba(0,0,0,.55));">${typeInfo(type).icon}</div>`,
  iconSize: [34, 34],
  iconAnchor: [17, 17],
});

/* history playback marker — same icon inside an amber badge */
const playbackIcon = (type) => L.divIcon({
  className: "",
  html: `<div style="width:40px;height:40px;border-radius:50%;background:#f0a635;
         border:2px solid #fff;display:flex;align-items:center;justify-content:center;
         font-size:24px;box-shadow:0 2px 5px rgba(0,0,0,.5);">${typeInfo(type).icon}</div>`,
  iconSize: [40, 40],
  iconAnchor: [20, 20],
});

/* ---------------- mode detection ---------------- */
const hasRealKeys =
  typeof firebaseConfig !== "undefined" &&
  !String(firebaseConfig.apiKey).startsWith("PASTE");

const forceDemo = new URLSearchParams(location.search).has("demo");
const DEMO_MODE = forceDemo || !hasRealKeys;

/* ============================================================
   BOOT
   ============================================================ */
document.addEventListener("DOMContentLoaded", () => {
  initTabs();
  initMaps();
  updateCloudPanel();

  if (DEMO_MODE) {
    document.getElementById("modeBadge").style.display = "inline-block";
    setConn("demo");
    DemoSimulator.start((id, name, frame, history, type) => {
      applyVehicleData(id, name, frame, history, type);
    });
  } else {
    document.getElementById("modeBadge").style.display = "none";
    firebase.initializeApp(firebaseConfig);
    const db = firebase.database();
    setConn("connecting");

    // Listen to every vehicle in the cloud, in real time.
    db.ref("vehicles").on("value", (snap) => {
      setConn("online");
      const data = snap.val() || {};
      Object.keys(data).forEach((id) => {
        const v = data[id];
        const cur = v.current || {};
        applyVehicleData(id, v.name || id, {
          lat: cur.lat, lng: cur.lng,
          speed: cur.speed, satellites: cur.satellites,
          timestamp: cur.timestamp,
        }, null, v.type);
      });
    }, (err) => {
      console.error("Firebase error:", err);
      setConn("offline");
    });
  }
});

function setConn(state) {
  const b = document.getElementById("connBadge");
  if (state === "online")  { b.className = "badge badge-online";  b.textContent = "● Live (Firebase)"; }
  if (state === "demo")    { b.className = "badge badge-demo";     b.textContent = "● Simulated data"; }
  if (state === "offline") { b.className = "badge badge-offline";  b.textContent = "● Connection error"; }
  if (state === "connecting") { b.className = "badge badge-offline"; b.textContent = "● Connecting…"; }
}

/* ============================================================
   TABS
   ============================================================ */
function initTabs() {
  document.querySelectorAll(".tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById("tab-" + btn.dataset.tab).classList.add("active");
      // Leaflet needs invalidateSize when its container becomes visible
      setTimeout(() => { liveMap && liveMap.invalidateSize(); histMap && histMap.invalidateSize(); }, 50);
      if (btn.dataset.tab === "history") refreshVehicleDropdown();
      if (btn.dataset.tab === "cloud") updateCloudPanel();
    });
  });
}

/* ============================================================
   CLOUD ARCHITECTURE TAB — live status panel
   ============================================================ */
function updateCloudPanel() {
  const modeEl = document.getElementById("csMode");
  const projEl = document.getElementById("csProject");
  const noteEl = document.getElementById("csNote");
  if (!modeEl) return;

  if (DEMO_MODE) {
    modeEl.textContent = "DEMO MODE";
    modeEl.style.color = "#f0a635";
    projEl.textContent = "not configured";
    noteEl.textContent =
      "Vehicle data is simulated in the browser. Add your Firebase keys in " +
      "js/firebase-config.js to switch to the live cloud — the dashboard then " +
      "reads the real device directly from Google's Firebase Realtime Database.";
  } else {
    modeEl.textContent = "LIVE (Firebase)";
    modeEl.style.color = "#13c2a3";
    projEl.textContent = firebaseConfig.projectId || "your project";
    noteEl.textContent =
      "The dashboard holds an open realtime connection to Firebase. Every GPS fix " +
      "the ESP8266 writes to the database is pushed to this browser instantly — " +
      "no polling, no server of our own.";
  }
}

/* ============================================================
   MAPS
   ============================================================ */
function initMaps() {
  liveMap = L.map("map", { zoomControl: true }).setView([17.6868, 83.2185], 13);
  histMap = L.map("histMap", { zoomControl: true }).setView([17.6868, 83.2185], 13);

  const osm = () => L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  });
  osm().addTo(liveMap);
  osm().addTo(histMap);
}

/* ============================================================
   DATA PIPELINE — one path for demo + live
   ============================================================ */
function applyVehicleData(id, name, frame, history, type) {
  if (!vehicles[id]) vehicles[id] = { name, current: null, history: [] };
  vehicles[id].name = name;
  if (type) vehicles[id].type = type;
  if (frame && frame.lat != null && frame.lng != null) vehicles[id].current = frame;
  if (history) vehicles[id].history = history;

  updateMarker(id);
  renderVehicleList();
  refreshVehicleDropdown();
  if (selectedId === id || selectedId === null) {
    selectedId = id;
    updateStats();
  }
}

function updateMarker(id) {
  const v = vehicles[id];
  if (!v || !v.current) return;
  const { lat, lng } = v.current;
  const pos = [lat, lng];

  if (!markers[id]) {
    markers[id] = L.marker(pos, { icon: vehicleIcon(v.type) }).addTo(liveMap);
    markers[id].bindPopup(`<b>${typeInfo(v.type).icon} ${v.name}</b><br>${typeInfo(v.type).label} · ${lat.toFixed(5)}, ${lng.toFixed(5)}`);
    markers[id].on("click", () => selectVehicle(id));
    liveMap.setView(pos, 14);
  } else {
    // smooth slide to the new position; swap the icon if the type changed
    markers[id].setLatLng(pos);
    markers[id].setIcon(vehicleIcon(v.type));
    markers[id].setPopupContent(`<b>${typeInfo(v.type).icon} ${v.name}</b><br>${typeInfo(v.type).label} · ${lat.toFixed(5)}, ${lng.toFixed(5)}`);
  }
}

function selectVehicle(id) {
  selectedId = id;
  const v = vehicles[id];
  if (v && v.current) liveMap.setView([v.current.lat, v.current.lng], 15);
  renderVehicleList();
  updateStats();
}

/* ============================================================
   VEHICLE LIST + STATS
   ============================================================ */
function renderVehicleList() {
  const box = document.getElementById("vehicleList");
  const ids = Object.keys(vehicles);
  if (!ids.length) return;

  box.innerHTML = "";
  ids.forEach((id) => {
    const v = vehicles[id];
    const cur = v.current || {};
    const age = cur.timestamp ? (Date.now() - cur.timestamp) / 1000 : Infinity;
    const status = !cur.lat ? "offline" : age > 60 ? "idle" : "moving";

    const card = document.createElement("div");
    card.className = "vehicle-card" + (id === selectedId ? " selected" : "");
    card.innerHTML = `
      <div class="v-head">
        <span class="v-name"><span class="dot ${status}"></span>${typeInfo(v.type).icon} ${v.name}</span>
        <span class="v-speed">${cur.speed ?? "--"}<small> km/h</small></span>
      </div>
      <div class="v-meta">
        🛰 ${cur.satellites ?? "--"} satellites<br>
        📍 ${cur.lat != null ? cur.lat.toFixed(5) + ", " + cur.lng.toFixed(5) : "--"}
      </div>
      <div class="v-time">${cur.timestamp ? timeAgo(cur.timestamp) : "no data"}</div>`;
    card.addEventListener("click", () => selectVehicle(id));
    box.appendChild(card);
  });
}

function updateStats() {
  const cur = vehicles[selectedId]?.current || {};
  document.getElementById("statSpeed").textContent = cur.speed ?? "--";
  document.getElementById("statSats").textContent = cur.satellites ?? "--";
  document.getElementById("statLat").textContent = cur.lat != null ? cur.lat.toFixed(6) : "--";
  document.getElementById("statLng").textContent = cur.lng != null ? cur.lng.toFixed(6) : "--";
  document.getElementById("statTime").textContent = cur.timestamp ? timeAgo(cur.timestamp) : "--";
}

function timeAgo(ts) {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 5)  return "just now";
  if (s < 60) return s + " s ago";
  const m = Math.floor(s / 60);
  if (m < 60) return m + " min ago";
  return Math.floor(m / 60) + " h ago";
}
setInterval(() => { renderVehicleList(); updateStats(); }, 10000); // keep "x ago" fresh

/* ============================================================
   HISTORY TAB
   ============================================================ */
function refreshVehicleDropdown() {
  const sel = document.getElementById("histVehicle");
  const ids = Object.keys(vehicles);
  if (!ids.length) return;
  const prev = sel.value;
  sel.innerHTML = "";
  ids.forEach((id) => {
    const opt = document.createElement("option");
    opt.value = id; opt.textContent = vehicles[id].name;
    sel.appendChild(opt);
  });
  if (ids.includes(prev)) sel.value = prev;
}

document.getElementById("loadHistoryBtn").addEventListener("click", async () => {
  const id = document.getElementById("histVehicle").value;
  if (!id) return;

  let points = [];
  if (DEMO_MODE) {
    points = DemoSimulator.getHistory(id);
  } else {
    // Firebase: pull history written by the ESP8266.
    // Use a broad fetch (latest 3000 points) then filter by date locally.
    const snap = await firebase.database()
      .ref(`vehicles/${id}/history`)
      .orderByChild("timestamp")
      .limitToLast(3000)
      .once("value");
    const obj = snap.val() || {};
    points = Object.values(obj)
      .filter(p => p.lat != null && p.lng != null)
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  // filter to selected date (local timezone)
  const dateStr = document.getElementById("histDate").value;
  if (dateStr && points.length) {
    const d = new Date(dateStr + "T00:00:00");
    const start = d.getTime(), end = start + 24 * 3600 * 1000;
    points = points.filter(p => p.timestamp >= start && p.timestamp < end);
  }

  drawHistory(points, vehicles[id] ? vehicles[id].type : undefined);
});

function drawHistory(points, type) {
  // clear previous drawings
  if (histRouteLine) { histMap.removeLayer(histRouteLine); histRouteLine = null; }
  if (histPlayMarker) { histMap.removeLayer(histPlayMarker); histPlayMarker = null; }
  histEndMarkers.forEach(m => histMap.removeLayer(m));
  histEndMarkers = [];
  stopPlayback();
  histPoints = points;
  histType = type;

  const summary = document.getElementById("histSummary");
  const playback = document.getElementById("playbackBox");

  if (!points.length) {
    summary.style.display = "none"; playback.style.display = "none";
    alert("No tracking data found for this vehicle/date. (In demo mode, pick today's date.)");
    return;
  }

  // summary
  let dist = 0, maxSpd = 0, spdSum = 0;
  for (let i = 0; i < points.length; i++) {
    if (i > 0) dist += haversine(points[i - 1], points[i]);
    maxSpd = Math.max(maxSpd, points[i].speed || 0);
    spdSum += points[i].speed || 0;
  }
  document.getElementById("histPoints").textContent = points.length;
  document.getElementById("histDistance").textContent = dist.toFixed(2);
  document.getElementById("histMaxSpeed").textContent = maxSpd;
  document.getElementById("histAvgSpeed").textContent = Math.round(spdSum / points.length);
  summary.style.display = "flex";

  // route line
  const latlngs = points.map(p => [p.lat, p.lng]);
  histRouteLine = L.polyline(latlngs, { color: "#2f81f7", weight: 4, opacity: 0.85 }).addTo(histMap);
  histMap.fitBounds(histRouteLine.getBounds(), { padding: [30, 30] });

  // start & end markers
  histEndMarkers.push(
    L.circleMarker(latlngs[0], { radius: 7, color: "#13c2a3", fillOpacity: 1 })
      .addTo(histMap).bindPopup("Start"));
  histEndMarkers.push(
    L.circleMarker(latlngs[latlngs.length - 1], { radius: 7, color: "#f1555c", fillOpacity: 1 })
      .addTo(histMap).bindPopup("End"));

  // playback
  playback.style.display = "flex";
  const slider = document.getElementById("playSlider");
  slider.max = points.length - 1;
  slider.value = 0;
  showPlayPoint(0);
}

function showPlayPoint(i) {
  const p = histPoints[i];
  if (!p) return;
  const pos = [p.lat, p.lng];
  if (!histPlayMarker) {
    histPlayMarker = L.marker(pos, { icon: playbackIcon(histType) }).addTo(histMap);
  } else {
    histPlayMarker.setLatLng(pos);
  }
  histPlayMarker.bindPopup(
    `<b>${p.speed ?? "--"} km/h</b><br>
     🛰 ${p.satellites ?? "--"}<br>
     ${new Date(p.timestamp).toLocaleTimeString()}`).openPopup();
  document.getElementById("playTime").textContent =
    new Date(p.timestamp).toLocaleString();
}

/* playback controls */
document.getElementById("playBtn").addEventListener("click", () => {
  if (playTimer) { stopPlayback(); return; }
  const slider = document.getElementById("playSlider");
  const btn = document.getElementById("playBtn");
  let i = +slider.value;
  if (i >= histPoints.length - 1) i = 0;
  playTimer = setInterval(() => {
    i++;
    if (i >= histPoints.length) { stopPlayback(); return; }
    slider.value = i;
    showPlayPoint(i);
  }, 300); // 300 ms per point — slow it down or speed it up as you like
  btn.textContent = "⏸ Pause";
});

document.getElementById("playSlider").addEventListener("input", (e) => {
  stopPlayback();
  showPlayPoint(+e.target.value);
});

function stopPlayback() {
  clearInterval(playTimer); playTimer = null;
  const btn = document.getElementById("playBtn");
  if (btn) btn.textContent = "▶ Play";
}

/* ============================================================
   HELPERS
   ============================================================ */
function haversine(a, b) {
  const R = 6371; // km
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const s = Math.sin(dLat / 2) ** 2 +
            Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) *
            Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
