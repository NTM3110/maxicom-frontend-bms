import adapter from '@sveltejs/adapter-auto';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, '.', '');
	const bmsRestTarget = env.BMS_REST_TARGET || 'http://127.0.0.1:8888';
	const rtsTarget = env.RTS_TARGET || 'http://127.0.0.1';

	return {
		plugins: [
			sveltekit({
				compilerOptions: {
					// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
					runes: ({ filename }) =>
						filename.split(/[/\\]/).includes('node_modules') ? undefined : true
				},

				// adapter-auto only supports some environments, see https://svelte.dev/docs/kit/adapter-auto for a list.
				// If your environment is not supported, or you settled on a specific environment, switch out the adapter.
				// See https://svelte.dev/docs/kit/adapters for more information about adapters.
				adapter: adapter()
			})
		],
		server: {
			proxy: {
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
