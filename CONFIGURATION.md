# Device configuration

The application reads its active deployment profile from `static/config/device-config.json`.
Change this file before building or replace it in the deployed static assets to configure the product without changing application code.

- `device.product`: `bms` or `rts` for deployment identification.
- `device.name`, `title`, `subtitle`: branding and header copy.
- `navigation.enabledItems`: menu item IDs enabled for that deployment.
- `navigation.defaultItem`: first workspace shown on opening the application.
- Use `health-monitor_bms` for the BMS Health Monitor and `health-monitor_hybrid` for the Hybrid Health Monitor. Both tabs are displayed as **Health Monitor**, while their config IDs keep the API and layout variants separate. Legacy `dashboard` and `status` IDs are still accepted and mapped to the corresponding monitor.
- `connectivity.tcp`: controls whether the TCP section appears inside the shared `Serial & TCP` workspace. Set it to `false` for BMS.
- `authentication.defaultUser`: shared frontend sign-in account for BMS, RTS, or unified deployments. `passwordHash` is the lowercase SHA-256 value of the password. The supplied default is `admin / admin`.
- `rts`: contains the RTS configuration imported from the Angular application: sidebar capabilities, Serial/TCP bridge templates, device-brand catalogs, device tiers, and system serial number.

`static/config/device-config.bms.example.json` and `static/config/device-config.hybrid.example.json` are ready BMS and Hybrid examples. Release
packaging installs it as `device-config.json`. For local development, run
`npm run dev:bms` or `npm run dev:hybrid`; Vite serves the selected example as the active profile without
overwriting the unified source file.

## Backend connection

The BMS development command supports a configurable same-origin REST proxy
target:

- `BMS_REST_TARGET`: BMS OpenMUC REST server used by configuration import/export, reset, CSV range export and legacy SOH schedules. It defaults to `http://127.0.0.1:8888`.
- `VITE_RTS_DEFAULT_HOST`: RTS IP initially shown in the runtime connection dialog.

For example:

```sh
BMS_REST_TARGET=http://BMS_HOST:8888 \
npm run dev:bms
```

For a loopback BMS host, the browser requests same-origin `/rest/...` paths and
Vite forwards them to `BMS_REST_TARGET`. A production web server should provide
the equivalent REST reverse-proxy rule.

Users can change both backend IP addresses from **Backend connections** in the application header. The values are stored in browser `localStorage` and survive refreshes. The BMS JSON-RPC WebSocket always connects directly to the configured BMS host on port `8085`; `localhost` means the browser's own loopback interface and does not select `/openems` or the frontend origin. RTS remains separate and uses port `80` and `/jsonrpc`. Changing an address resets the existing socket before the connection is checked again.

For a saved non-loopback BMS address, REST is also requested directly from that
host on port `8888`, so its HTTP server must allow the frontend origin through
CORS. For a loopback address, REST continues to use the same-origin proxy
described above; this REST behavior does not change the direct BMS WebSocket
endpoint.

## Application sign-in

The application stores the signed-in frontend session in browser `sessionStorage`. Signing out or closing the browser session removes it. When BMS features are enabled, the same submitted credentials are also used to request the OpenEMS platform token; a temporarily offline BMS does not prevent access to the RTS workspace.

The frontend sign-in screen is an access gate for the shared interface. Backend APIs must continue to enforce their own authentication and authorization.
