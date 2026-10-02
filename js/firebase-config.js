/* ============================================================
   FIREBASE CONFIGURATION
   ------------------------------------------------------------
   1. Go to https://console.firebase.google.com
   2. Create a project (e.g. "smart-vehicle-tracking")
   3. Add a Web App (</> icon) and copy the config object shown
   4. Paste your values below, replacing the "PASTE_..." placeholders
   5. In the console: Build > Realtime Database > Create Database
      (choose a region, start in test mode)
   6. In Database > Rules, allow read/write while testing:

        {
          "rules": {
            ".read": true,
            ".write": true
          }
        }

   The dashboard automatically switches from DEMO MODE to LIVE MODE
   as soon as real keys are present here.
   ============================================================ */

const firebaseConfig = {
  apiKey:            "PASTE_YOUR_API_KEY",
  authDomain:        "PASTE_YOUR_PROJECT.firebaseapp.com",
  databaseURL:       "https://PASTE_YOUR_PROJECT-default-rtdb.firebaseio.com",
  projectId:         "PASTE_YOUR_PROJECT",
  storageBucket:     "PASTE_YOUR_PROJECT.appspot.com",
  messagingSenderId: "PASTE_YOUR_SENDER_ID",
  appId:             "PASTE_YOUR_APP_ID"
};

/* Expected data layout in Realtime Database
   (the ESP8266 writes this — see README.md):

   vehicles
   └── vehicle1
       ├── name  : "College Bus"
       └── current
           ├── lat        : 17.6868
           ├── lng        : 83.2185
           ├── speed      : 42
           ├── satellites : 9
           └── timestamp  : 1717000000
   └── vehicle1 / history / <push-id>
           ├── lat, lng, speed, satellites, timestamp
*/
