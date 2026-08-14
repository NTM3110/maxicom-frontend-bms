# Device configuration

The application reads its active deployment profile from `static/config/device-config.json`.
Change this file before building or replace it in the deployed static assets to configure the product without changing application code.

- `device.product`: `bms` or `rts` for deployment identification.
- `device.name`, `title`, `subtitle`: branding and header copy.
- `navigation.enabledItems`: menu item IDs enabled for that deployment.
- `navigation.defaultItem`: first workspace shown on opening the application.
- Use `dashboard` for the BMS overview. Use `status` for the RTS System Status workspace; they intentionally remain separate so each can use its own API and layout.
- `connectivity.tcp`: controls whether the TCP section appears inside the shared `Serial & TCP` workspace. Set it to `false` for BMS.
- `authentication.defaultUser`: shared frontend sign-in account for BMS, RTS, or unified deployments. `passwordHash` is the lowercase SHA-256 value of the password. The supplied default is `admin / admin`.
- `rts`: contains the RTS configuration imported from the Angular application: sidebar capabilities, Serial/TCP bridge templates, device-brand catalogs, device tiers, and system serial number.

`static/config/device-config.bms.example.json` is a ready BMS example. Copy its contents into `device-config.json` for a BMS deployment.

## Backend connection

Copy `.env.example` to `.env.development` for local development and update the IP when the target device changes.

- `VITE_OPENEMS_WS_URL`: BMS OpenEMS JSON-RPC WebSocket. The original BMS frontend uses port `8085`.
- `BMS_REST_TARGET`: BMS OpenMUC REST server used by configuration import/export, reset, CSV range export and legacy SOH schedules. The original development proxy uses port `8888`.
- `VITE_BMS_DEFAULT_HOST`: BMS IP initially shown in the runtime connection dialog.
- `VITE_RTS_DEFAULT_HOST`: RTS IP initially shown in the runtime connection dialog.

The browser continues to request relative `/rest/...` URLs, while Vite forwards them to `BMS_REST_TARGET`. A production web server should provide the same `/rest` reverse-proxy rule.

Users can change both backend IP addresses from **Backend connections** in the application header. The values are stored in browser `localStorage`, survive refreshes, and override the build-time defaults. BMS automatically uses ports `8085` (WebSocket) and `8888` (REST); RTS uses port `80` and `/jsonrpc`. Changing an address resets the existing socket before the connection is checked again.

For a runtime IP different from the build-time proxy target, HTTP services are requested directly from that backend. Its web server must allow the frontend origin through CORS. WebSocket JSON-RPC does not use the HTTP proxy.

## Application sign-in

The application stores the signed-in frontend session in browser `sessionStorage`. Signing out or closing the browser session removes it. When BMS features are enabled, the same submitted credentials are also used to request the OpenEMS platform token; a temporarily offline BMS does not prevent access to the RTS workspace.

The frontend sign-in screen is an access gate for the shared interface. Backend APIs must continue to enforce their own authentication and authorization.
