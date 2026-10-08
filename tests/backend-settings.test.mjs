import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

// Run the actual service with browser storage/location and Vite's env boundary
// supplied by the fixture; no socket or operational backend is needed.
const source = readFileSync(new URL('../src/lib/services/backend-settings.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source.replaceAll('import.meta.env', 'testEnv'), {
	compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
});

function settingsAt(page, stored, env = {}) {
	const storage = new Map(stored ? [['maxicom-backend-settings', JSON.stringify(stored)]] : []);
	const exports = {};
	runInNewContext(outputText, {
		exports, URL, testEnv: env,
		require(name) {
			assert.equal(name, '$app/environment');
			return { browser: true };
		},
		window: { location: new URL(page) },
		localStorage: {
			getItem: (key) => storage.get(key) ?? null,
			setItem: (key, value) => storage.set(key, value),
			removeItem: (key) => storage.delete(key)
		}
	});
	return exports;
}

test('fresh and saved loopback settings use deployed web server, never viewer loopback', () => {
	for (const host of [undefined, '127.0.0.1', 'localhost', '[::1]', '127.0.0.2']) {
		const api = settingsAt('http://192.168.4.127/', host ? { bmsHost: host } : undefined);
		assert.equal(api.bmsWebSocketUrl(), 'ws://192.168.4.127/websocket');
		assert.equal(api.bmsRestPath('/rest/csv_export?fileName=a.csv'), '/rest/csv_export?fileName=a.csv');
	}
});

test('same-device connection preserves HTTPS and the web server port', () => {
	const api = settingsAt('https://bms.example:8443/');
	assert.equal(api.bmsWebSocketUrl(), 'wss://bms.example:8443/websocket');
});

test('development uses the Vite origin proxy, including when opened from another machine', () => {
	const api = settingsAt('http://192.168.4.10:5173/');
	assert.equal(api.bmsWebSocketUrl(), 'ws://192.168.4.10:5173/websocket');
});

test('explicit remote BMS keeps direct ports and does not change RTS', () => {
	const api = settingsAt('http://192.168.4.127/', { bmsHost: '192.168.4.20', rtsHost: '192.168.4.21' });
	assert.equal(api.bmsWebSocketUrl(), 'ws://192.168.4.20:8085');
	assert.equal(api.bmsRestPath('/rest/reset'), 'http://192.168.4.20:8888/rest/reset');
	assert.equal(api.rtsWebSocketUrl(), 'ws://192.168.4.21/jsonrpc');
	api.saveBackendSettings({ bmsHost: 'localhost', rtsHost: 'ignored.invalid' }, 'bms');
	assert.equal(api.getBackendSettings().bmsHost, '127.0.0.1');
	assert.equal(api.bmsWebSocketUrl(), 'ws://192.168.4.127/websocket');
	assert.equal(api.rtsWebSocketUrl(), 'ws://192.168.4.21/jsonrpc');
});

test('remote port override applies only to explicit remote hosts', () => {
	const api = settingsAt('https://bms.example/', { bmsHost: 'other.example' }, { VITE_BMS_WS_PORT: '8090' });
	assert.equal(api.bmsWebSocketUrl(), 'wss://other.example:8090');
	api.saveBackendSettings({ bmsHost: '127.0.0.1', rtsHost: 'rts.example' });
	assert.equal(api.bmsWebSocketUrl(), 'wss://bms.example/websocket');
});

test('Vite provides the same /websocket route with a configurable server-side target', () => {
	const configSource = readFileSync(new URL('../vite.config.ts', import.meta.url), 'utf8');
	const { outputText: configCode } = ts.transpileModule(configSource, {
		compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
	});
	const exports = {};
	runInNewContext(configCode, {
		exports,
		require(name) {
			if (name === 'vite') return { defineConfig: (config) => config, loadEnv: () => ({ BMS_EDGE_TARGET: 'http://127.0.0.1:8090' }) };
			if (name === '@sveltejs/kit/vite') return { sveltekit: () => ({}) };
			if (name === '@sveltejs/adapter-static') return () => ({});
			if (name.endsWith('.json')) return {};
			throw new Error(`Unexpected config import: ${name}`);
		}
	});
	const proxy = exports.default({ mode: 'development' }).server.proxy['/websocket'];
	assert.equal(proxy.target, 'http://127.0.0.1:8090');
	assert.equal(proxy.ws, true);
	assert.equal(proxy.rewrite('/websocket'), '/');
});
