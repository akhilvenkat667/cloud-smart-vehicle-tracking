/* ============================================================
   DEMO SIMULATOR — vehicles follow REAL ROADS
   ------------------------------------------------------------
   Road-following geometry is fetched once at startup from the
   public OSRM demo server (router.project-osrm.org — free, no
   API key). Each demo vehicle drives a closed loop along
   actual streets. If the routing service cannot be reached,
   the simulator silently falls back to simple waypoint loops,
   so the demo never breaks.
   ============================================================ */

const DemoSimulator = (() => {

  const ROUTE_API = "https://router.project-osrm.org/route/v1/driving/";
  const QUERY = "?overview=full&geometries=geojson";
  const FETCH_TIMEOUT_MS = 6000;
  const SPEEDUP = 10;        // 10× real time, so movement is clearly visible
  const TICK_MS = 2000;      // one simulation tick every 2 seconds

  // Waypoint loops in Vijayawada. The routing service snaps each
  // waypoint to the nearest road and drives between them along
  // real streets, then returns to the first one.
  // Change these coordinates to simulate movement in your own city.
  const WAYPOINTS = {
    vehicle1: [
      [17.6905, 83.2150], [17.6930, 83.2250], [17.6880, 83.2300],
      [17.6830, 83.2220], [17.6845, 83.2160],
    ],
    vehicle2: [
      [19.6750, 83.2120], [19.6785, 83.2155], [19.6810, 83.2198],
      [19.6762, 83.2220],
    ],
        vehicle3: [
      [17.6849, 83.1550], [17.6862, 83.1600], [17.6875, 83.1650],
      [17.6890, 83.1700], [17.6910, 83.1750], [17.6920, 83.1800],
    ],
    vehicle4: [
      [17.7000, 83.2000], [17.7020, 83.2050], [17.7040, 83.2100],
      [17.7060, 83.2150], [17.7080, 83.2200],
    ],
    vehicle5: [
      [17.7100, 83.2300], [17.7120, 83.2350], [17.7140, 83.2400],
      [17.7160, 83.2450], [17.7180, 83.2500],
    ],
    vehicle6: [
      [17.7200, 83.2600], [17.7220, 83.2650], [17.7240, 83.2700],
      [17.7260, 83.2750], [17.7280, 83.2800],
    ],

      };

  // Demo vehicles — change `type` to bike | car | bus | auto | truck
  // and the marker on the map changes to match.
  const VEHICLES = {
    vehicle1: { name: "Demo Bike 01", type: "bike" },
    vehicle2: { name: "Demo Car 02", type: "car" },
    vehicle3: { name: "Kurmannapalem Auto", type: "auto" },
    vehicle4: { name: "Demo Truck 04", type: "truck" },
    vehicle5: { name: "Demo Bus 05", type: "bus" },
    vehicle6: { name: "Demo Bike 06", type: "ambulance" },
  };

  const state = {};       // id -> simulation state
  const listeners = [];   // called with every data frame
  let timer = null;

  /* ---------------- path helpers ---------------- */

  function haversineKm(a, b) {
    const R = 6371;
    const dLat = (b[0] - a[0]) * Math.PI / 180;
    const dLng = (b[1] - a[1]) * Math.PI / 180;
    const s = Math.sin(dLat / 2) ** 2 +
              Math.cos(a[0] * Math.PI / 180) * Math.cos(b[0] * Math.PI / 180) *
              Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(s));
  }

  // Build a closed path with cumulative arc lengths (in km).
  function buildPath(points) {
    const pts = points;
    const cum = [0];
    for (let i = 1; i < pts.length; i++) {
      cum.push(cum[i - 1] + haversineKm(pts[i - 1], pts[i]));
    }
    return { pts, cum, total: cum[cum.length - 1] };
  }

  // Position at arc length `dist` km along the closed path.
  function pointAt(path, dist) {
    const { pts, cum } = path;
    const d = ((dist % path.total) + path.total) % path.total;
    let i = 1;
    while (i < cum.length - 1 && cum[i] < d) i++;
    const a = pts[i - 1], b = pts[i];
    const f = (d - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1);
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
  }

  /* ---------------- road routing (OSRM) ---------------- */

  async function fetchRoadPath(waypoints) {
    // closed loop: append the first waypoint again
    const wps = waypoints.concat([waypoints[0]]);
    const coordStr = wps.map(p => p[1].toFixed(6) + "," + p[0].toFixed(6)).join(";");
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(ROUTE_API + coordStr + QUERY, { signal: ctrl.signal });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      const route = data && data.routes && data.routes[0];
      if (!route || !route.geometry || !route.geometry.coordinates.length) {
        throw new Error("no geometry in response");
      }
      // GeoJSON coordinates are [lng, lat] — convert to [lat, lng]
      const pts = route.geometry.coordinates.map(c => [c[1], c[0]]);
      pts.push(pts[0].slice()); // close the loop
      return pts;
    } finally {
      clearTimeout(t);
    }
  }

  /* ---------------- history seeding ---------------- */

  // ~2 hours of plausible history along the (road) path.
  function seedHistory(path, startDist) {
    const pts = [];
    const now = Date.now();
    const POINTS = 120;              // one point per minute
    const KM_PER_MIN = 25 / 60;      // ~25 km/h average
    let dist = startDist;
    for (let i = 0; i <= POINTS; i++) {
      dist = (dist + KM_PER_MIN) % path.total;
      const p = pointAt(path, dist);
      const jitter = () => (Math.random() - 0.5) * 0.0003; // GPS-like noise
      pts.push({
        lat: +(p[0] + jitter()).toFixed(6),
        lng: +(p[1] + jitter()).toFixed(6),
        speed: Math.round(18 + Math.random() * 32),
        satellites: 6 + Math.floor(Math.random() * 5),
        timestamp: now - (POINTS - i) * 60 * 1000,
      });
    }
    return pts;
  }

  /* ---------------- simulation ---------------- */

  function init() {
    Object.keys(WAYPOINTS).forEach((id) => {
      // fallback path: straight lines between waypoints (closed loop)
      const fallback = WAYPOINTS[id].concat([WAYPOINTS[id][0]]);
      const path = buildPath(fallback);
      const dist = Math.random() * path.total;
      state[id] = {
        path, dist,
        speed: 25 + Math.random() * 25,
        sats: 7 + Math.floor(Math.random() * 4),
        history: seedHistory(path, dist),
      };
    });
  }

  // Swap in the road-following path once OSRM answers.
  function applyRoadPath(id, pts) {
    const st = state[id];
    if (!st || !pts || pts.length < 2) return;
    const frac = st.dist / st.path.total;         // keep the vehicle's relative position
    const newPath = buildPath(pts);
    st.path = newPath;
    st.dist = frac * newPath.total;
    st.history = seedHistory(newPath, st.dist);    // reseed history along the road
  }

  function tick() {
    Object.keys(state).forEach((id) => {
      const st = state[id];
      st.speed = Math.max(12, Math.min(60, st.speed + (Math.random() - 0.5) * 10));
      st.sats = Math.max(4, Math.min(12, st.sats + (Math.random() < 0.2 ? (Math.random() < 0.5 ? -1 : 1) : 0)));

      const kmPerTick = (st.speed / 3600) * (TICK_MS / 1000) * SPEEDUP;
      st.dist = (st.dist + kmPerTick) % st.path.total;
      const p = pointAt(st.path, st.dist);

      const frame = {
        lat: +p[0].toFixed(6),
        lng: +p[1].toFixed(6),
        speed: Math.round(st.speed),
        satellites: st.sats,
        timestamp: Date.now(),
      };
      st.history.push(frame);
      if (st.history.length > 2000) st.history.shift();

      listeners.forEach((fn) => fn(id, VEHICLES[id].name, frame, st.history.slice(), VEHICLES[id].type));
    });
  }

  return {
    start(updateFn) {
      init();
      listeners.push(updateFn);
      tick();                                // immediate first frame
      timer = setInterval(tick, TICK_MS);

      // Upgrade every vehicle to a road-following path once OSRM answers.
      Object.keys(WAYPOINTS).forEach(async (id) => {
        try {
          const pts = await fetchRoadPath(WAYPOINTS[id]);
          applyRoadPath(id, pts);
        } catch (e) {
          // Offline or blocked — the straight-line fallback keeps running.
          console.warn("Road routing unavailable for " + id + ", using fallback path.", e);
        }
      });
    },
    stop() { clearInterval(timer); },
    getHistory(id) { return (state[id] || {}).history || []; },
  };
})();
