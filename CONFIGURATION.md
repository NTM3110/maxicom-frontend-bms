# Device configuration

The application reads its active deployment profile from `static/config/device-config.json`.
Change this file before building or replace it in the deployed static assets to configure the product without changing application code.

- `device.product`: `bms` or `rts` for deployment identification.
- `device.name`, `title`, `subtitle`: branding and header copy.
- `navigation.enabledItems`: menu item IDs enabled for that deployment.
- `navigation.defaultItem`: first workspace shown on opening the application.
- Use `dashboard` for the BMS overview. Use `status` for the RTS System Status workspace; they intentionally remain separate so each can use its own API and layout.
- `connectivity.tcp`: controls whether the TCP section appears inside the shared `Serial & TCP` workspace. Set it to `false` for BMS.
- `rts`: contains the RTS configuration imported from the Angular application: sidebar capabilities, Serial/TCP bridge templates, device-brand catalogs, device tiers, and system serial number. The legacy sample login data is deliberately excluded.

`static/config/device-config.bms.example.json` is a ready BMS example. Copy its contents into `device-config.json` for a BMS deployment.

## Backend connection

Copy `.env.example` to `.env.development` for local development and update the IP when the target device changes.

- `VITE_OPENEMS_WS_URL`: BMS OpenEMS JSON-RPC WebSocket. The original BMS frontend uses port `8085`.
- `BMS_REST_TARGET`: BMS OpenMUC REST server used by configuration import/export, reset, CSV range export and legacy SOH schedules. The original development proxy uses port `8888`.

The browser continues to request relative `/rest/...` URLs, while Vite forwards them to `BMS_REST_TARGET`. A production web server should provide the same `/rest` reverse-proxy rule.
