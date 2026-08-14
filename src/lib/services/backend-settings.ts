import { browser } from '$app/environment';

const STORAGE_KEY = 'maxicom-backend-settings';
const DEFAULT_BMS_HOST = hostFromUrl(String(import.meta.env.VITE_BMS_DEFAULT_HOST ?? import.meta.env.VITE_OPENEMS_WS_URL ?? ''));
const DEFAULT_RTS_HOST = hostFromUrl(String(import.meta.env.VITE_RTS_DEFAULT_HOST ?? import.meta.env.VITE_RTS_WS_URL ?? ''));

export type BackendSettings = {
	bmsHost: string;
	rtsHost: string;
};

function hostFromUrl(value: string) {
	const trimmed = value.trim();
	if (!trimmed) return '';
	try {
		return new URL(trimmed.includes('://') ? trimmed : `http://${trimmed}`).host;
	} catch {
		return '';
	}
}

function normalizeHost(value: string, stripPort = false) {
	const host = hostFromUrl(value);
	if (!host) throw new Error('Enter a valid backend IP address or host name.');
	if (!/^[a-zA-Z0-9.:[\]-]+(?::\d+)?$/.test(host)) throw new Error('Backend address contains unsupported characters.');
	if (!stripPort) return host;
	try {
		return new URL(`http://${host}`).hostname;
	} catch {
		return host;
	}
}

export function defaultBackendSettings(): BackendSettings {
	return {
		bmsHost: DEFAULT_BMS_HOST || (browser ? window.location.hostname : '127.0.0.1'),
		rtsHost: DEFAULT_RTS_HOST || (browser ? window.location.hostname : '127.0.0.1')
	};
}

export function getBackendSettings(): BackendSettings {
	const defaults = defaultBackendSettings();
	if (!browser) return defaults;
	const stored = localStorage.getItem(STORAGE_KEY);
	if (!stored) return defaults;
	try {
		const value = JSON.parse(stored) as Partial<BackendSettings>;
		return {
			bmsHost: value.bmsHost ? normalizeHost(value.bmsHost, true) : defaults.bmsHost,
			rtsHost: value.rtsHost ? normalizeHost(value.rtsHost) : defaults.rtsHost
		};
	} catch {
		localStorage.removeItem(STORAGE_KEY);
		return defaults;
	}
}

export function saveBackendSettings(settings: BackendSettings) {
	const normalized = {
		bmsHost: normalizeHost(settings.bmsHost, true),
		rtsHost: normalizeHost(settings.rtsHost)
	};
	if (browser) localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
	return normalized;
}

function pageProtocol(kind: 'http' | 'ws') {
	const secure = browser && window.location.protocol === 'https:';
	return kind === 'ws' ? (secure ? 'wss:' : 'ws:') : (secure ? 'https:' : 'http:');
}

export function bmsWebSocketUrl() {
	const host = getBackendSettings().bmsHost;
	return `${pageProtocol('ws')}//${host}:8085`;
}

export function bmsRestPath(path: string) {
	const host = getBackendSettings().bmsHost;
	if (host === DEFAULT_BMS_HOST) return path;
	return `${pageProtocol('http')}//${host}:8888${path}`;
}

export function rtsApiPath(path: string) {
	const host = getBackendSettings().rtsHost;
	const prefix = String(import.meta.env.VITE_RTS_API_PREFIX ?? '').replace(/\/$/, '');
	if (host === DEFAULT_RTS_HOST && prefix) return `${prefix}${path}`;
	return `${pageProtocol('http')}//${host}${path}`;
}

export function rtsWebSocketUrl() {
	const host = getBackendSettings().rtsHost;
	const configuredUrl = String(import.meta.env.VITE_RTS_WS_URL ?? '').trim();
	if (host === DEFAULT_RTS_HOST && configuredUrl) return configuredUrl;
	const prefix = String(import.meta.env.VITE_RTS_API_PREFIX ?? '').replace(/\/$/, '');
	if (host === DEFAULT_RTS_HOST && prefix && browser) {
		return `${pageProtocol('ws')}//${window.location.host}${prefix}/jsonrpc`;
	}
	return `${pageProtocol('ws')}//${host}/jsonrpc`;
}
