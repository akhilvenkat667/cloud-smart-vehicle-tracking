# Cloud Smart Vehicle Tracking System — Cloud Computing Web Project

A **cloud computing based** vehicle tracking system. A GPS device in the vehicle
sends its location to the **Google cloud (Firebase)**, and users track the
vehicle live from any browser — with no server of our own anywhere.

```
NEO-6M GPS ─► ESP8266 ─► Wi-Fi / Internet ─► FIREBASE CLOUD ─► Web dashboard ─► User
             (edge device)                   (Google Cloud)      (any browser)
```

Pure **HTML / CSS / JavaScript** frontend. Maps by Leaflet + OpenStreetMap (free,
no API key). Cloud services by Firebase (free Spark tier).

---

## Why this is a cloud computing project

| Layer | Service model | What this project uses |
|---|---|---|
| Application | **SaaS** | The tracking dashboard — used from any browser, nothing to install |
| Platform | **PaaS / BaaS** | Firebase Realtime Database, Hosting, Authentication |
| Infrastructure | **IaaS** | Google Cloud Platform compute, storage and network beneath Firebase |

**Deployment model:** public cloud (Google Cloud).
**The project runs no server of its own** — the vehicle, the database and the
user are in three different places, connected only through the internet.

The dashboard's **Cloud Architecture tab** shows this stack visually and lists
the five NIST cloud characteristics the system demonstrates:

- **On-demand self-service** — a new vehicle registers itself just by writing
  to `/vehicles`; no admin needed.
- **Broad network access** — any browser, any device, over the internet.
- **Resource pooling** — Firebase's multi-tenant backend.
- **Rapid elasticity** — 1 vehicle or 100, the same code.
- **Measured service** — free tier with quotas; pay only if usage grows.

## What the dashboard does

| Feature | Where |
|---|---|
| Live map with type-matched vehicle markers (bike/car/bus/auto/truck) | Live Tracking tab |
| Vehicle cards: type icon, speed, satellites, coordinates, freshness | Sidebar |
| Route history for a chosen date, distance + max/avg speed | History tab |
| Animated route playback with a slider | History tab |
| Cloud architecture, service models, live cloud status | Cloud Architecture tab |

## Run it locally (demo mode, no setup)

The app ships in **demo mode**: two simulated vehicles drive around so the
system can be presented without the hardware.

- Open `index.html` through any static server:
  - VS Code **Live Server** (right-click `index.html` → *Open with Live Server*), or
  - `python -m http.server 8000` → open `http://localhost:8000`
- The demo vehicles **follow real roads**: road geometry is fetched once at
  startup from the public OSRM demo server (router.project-osrm.org — free,
  no API key). If that service is unreachable, the simulator falls back to
  simple waypoint loops so the demo never breaks.
- Change the demo routes to your own city by editing the `WAYPOINTS`
  coordinates in `js/demo-simulator.js` — the routing service snaps them to
  the nearest streets.
- Force demo mode even after adding keys: `index.html?demo=1`.

## Deploy the dashboard TO the cloud (Firebase Hosting)

This is what makes the web side itself a cloud service — a public URL, served
from Google's cloud, that your review panel can open on their phones:

```bash
npm install -g firebase-tools
firebase login
firebase init hosting     # existing project; public directory: . ; single-page app: No
firebase deploy
```

The included `firebase.json` already contains the correct hosting settings, so
`firebase deploy` is enough after `firebase init` associates your project
(`firebase use --add`).

## Connect your Firebase (live mode)

1. <https://console.firebase.google.com> → **Add project**.
2. Register a **Web app** (`</>` icon) and copy the config.
3. Paste it into `js/firebase-config.js` (replace every `PASTE_...` value).
   The app switches from demo to live mode automatically.
4. **Build → Realtime Database → Create Database** (test mode).
5. While testing, allow read/write in **Database → Rules**:

   ```json
   { "rules": { ".read": true, ".write": true } }
   ```

   Tighten before final submission — see "Security".

### Data format the dashboard expects

```
vehicles
└── vehicle1
    ├── name: "College Bus"
    ├── type: "bus"           ← bike | car | bus | auto | truck (marker icon)
    ├── current          ← overwritten every GPS fix (drives the Live tab)
    │   ├── lat: 17.6868
    │   ├── lng: 83.2185
    │   ├── speed: 42          (km/h)
    │   ├── satellites: 9
    │   └── timestamp: 1717000000   (Unix ms)
    └── history          ← appended ~every minute (drives the History tab)
        └── <push-id>: { lat, lng, speed, satellites, timestamp }
```

The `type` field sets the vehicle's marker on the map: 🏍️ bike, 🚗 car,
🚌 bus, 🛺 auto rickshaw, 🚚 truck. It is written once at setup (like
`name`) and also appears next to the vehicle's name in the sidebar.

### ESP8266 sketch snippet (Arduino IDE)

```cpp
#include <ESP8266WiFi.h>
#include <FirebaseESP8266.h>
#include <TinyGPS++.h>

FirebaseData fbdo;
TinyGPSPlus gps;

void pushToFirebase(double lat, double lng, double speedKmh, int sats) {
  String base = "/vehicles/vehicle1/current/";
  Firebase.setFloat(fbdo, base + "lat", lat);
  Firebase.setFloat(fbdo, base + "lng", lng);
  Firebase.setFloat(fbdo, base + "speed", speedKmh);
  Firebase.setInt  (fbdo, base + "satellites", sats);
  Firebase.setInt  (fbdo, base + "timestamp", (int)millis()); // or NTP epoch ms
  Firebase.setString(fbdo, "/vehicles/vehicle1/type", "bus");   // written once at setup

  FirebaseJson json;
  json.set("lat", lat); json.set("lng", lng);
  json.set("speed", speedKmh); json.set("satellites", sats);
  json.set("timestamp", millis());
  Firebase.pushJSON(fbdo, "/vehicles/vehicle1/history", json);
}
```

> Use real epoch milliseconds (NTP, e.g. `NTPClient`) for `timestamp` so the
> History tab can filter by date.

## Adding more vehicles

Nothing to configure — any device that writes to `/vehicles/<new-id>/current`
appears on the dashboard automatically. That is cloud elasticity in practice.

## Security (before final submission)

- Enable **Firebase Authentication** (email/password is enough) and require
  `auth != null` in your database rules.
- Restrict your Firebase Web API key to your hosted domain
  (*Project settings → Your apps*).
- Do not commit your real `firebase-config.js` to a public repo.

## Project structure

```
vehicle-tracker/
├── index.html              dashboard (Live + History + Cloud Architecture tabs)
├── firebase.json           ready-made Firebase Hosting config
├── css/style.css           dark-theme responsive styling
└── js/
    ├── firebase-config.js  ← paste YOUR Firebase keys here
    ├── demo-simulator.js   simulated vehicles for demo mode
    └── app.js              map, Firebase listener, playback, cloud status
```
## Author

**Teki Akhil Venkat**

B.Tech – Computer Science / AIML

## Links

- **Live demo (cloud):** https://smart-vehicle-tracker-ee110.web.app
- **Hosting:** Firebase Hosting (Google Cloud)
- **Database:** Firebase Realtime Database


## License

This project is intended for educational and demonstration purposes.
