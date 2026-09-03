# MAXiCom Frontend

Unified SvelteKit frontend for MAXiCom BMS and MAXiCom RTS deployments.

The default local sign-in is `admin / admin`. Deployment behavior, enabled menus, device catalogs and the shared sign-in account are controlled through `static/config/device-config.json`; see `CONFIGURATION.md` for details.

Everything you need to build a Svelte project, powered by [`sv`](https://github.com/sveltejs/cli).

## Creating a project

If you're seeing this, you've probably already done this step. Congrats!

```sh
# create a new project
npx sv create my-app
```

To recreate this project with the same configuration:

```sh
# recreate this project
npx sv@0.17.0 create --template minimal --types ts --no-install .
```

## Developing

Install dependencies and start the default unified development profile with:

```sh
npm run dev
```

To run the BMS profile against an Edge/OpenMUC instance on the same development
machine, use:

```sh
npm run dev:bms
```

To use a BMS appliance on another host, expose the development server and enter
the appliance IP address or hostname in **Backend connections**:

```sh
npm run dev:bms -- --host 0.0.0.0
```

The browser opens the BMS JSON-RPC WebSocket directly at
`ws://<configured-bms-host>:8085` (or `wss://` when the frontend uses HTTPS).
This also applies to `localhost`; the frontend does not replace the configured
host with its own origin or the `/openems` development route. Select **Save &
connect** after changing the address so the existing socket is reset.

`dev:bms` serves `device-config.bms.example.json` at the active configuration
URL without modifying the checked-in unified profile. For a loopback BMS host,
REST requests use the same-origin `/rest` route and Vite forwards them to
`BMS_REST_TARGET` (default `http://127.0.0.1:8888`). A non-loopback BMS host is
requested directly on port `8888` and must allow the frontend origin through
CORS.

## Building

To create a production version of your app:

```sh
npm run build
```

You can preview the production build with `npm run preview`.

> To deploy your app, you may need to install an [adapter](https://svelte.dev/docs/kit/adapters) for your target environment.
