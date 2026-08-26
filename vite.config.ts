import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import bmsDeviceConfig from './static/config/device-config.bms.example.json' with { type: 'json' };

export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, '.', '');
	const deviceProfile = String(env.MAXICOM_DEVICE_PROFILE ?? '').trim().toLowerCase();
	const bmsEdgeTarget = env.BMS_EDGE_TARGET || 'http://127.0.0.1:8085';
	const bmsRestTarget = env.BMS_REST_TARGET || 'http://127.0.0.1:8888';
	const rtsTarget = env.RTS_TARGET || 'http://127.0.0.1';
	const bmsProfile = deviceProfile === 'bms' ? JSON.stringify(bmsDeviceConfig) : null;
	const bmsDevelopmentProfilePlugin: Plugin | null = bmsProfile ? {
		name: 'maxicom-bms-development-profile',
		configureServer(server) {
			server.middlewares.use('/config/device-config.json', (_request, response) => {
				response.setHeader('Content-Type', 'application/json; charset=utf-8');
				response.setHeader('Cache-Control', 'no-store');
				response.end(bmsProfile);
			});
		}
	} : null;

	return {
		plugins: [
			...(bmsDevelopmentProfilePlugin ? [bmsDevelopmentProfilePlugin] : []),
			sveltekit({
				compilerOptions: {
					// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
					runes: ({ filename }) =>
						filename.split(/[/\\]/).includes('node_modules') ? undefined : true
				},

				adapter: adapter({ fallback: 'index.html' })
			})
		],
		server: {
			proxy: {
				'/openems': {
					target: bmsEdgeTarget,
					changeOrigin: true,
					ws: true,
					rewrite: (path) => path.replace(/^\/openems\/?/, '/')
				},
				'/rest': {
					target: bmsRestTarget,
					changeOrigin: true
				},
				'/rts': {
					target: rtsTarget,
					changeOrigin: true,
					ws: true,
					rewrite: (path) => path.replace(/^\/rts/, '')
				}
			}
		}
	};
});
