import { browser } from '$app/environment';

const STORAGE_KEY = 'maxicom-backend-settings';
const DEFAULT_BMS_HOST = '127.0.0.1';
const configuredBmsWsPort = Number(import.meta.env.VITE_BMS_WS_PORT ?? 8085);
const BMS_WS_PORT = Number.isInteger(configuredBmsWsPort) && configuredBmsWsPort > 0 && configuredBmsWsPort <= 65535
	? configuredBmsWsPort
	: 8085;
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

function isLoopbackHost(value: string) {
	const hostname = value.replace(/^\[|\]$/g, '').toLowerCase();
	return hostname === 'localhost' || hostname === '::1' || /^127(?:\.\d{1,3}){3}$/.test(hostname);
}

/** Loopback aliases select the BMS backend on the device serving this UI. */
function normalizeBmsHost(value: string) {
	const loopbackCandidate = value.trim().replace(/^\[|\]$/g, '').toLowerCase();
	if (loopbackCandidate === 'localhost' || loopbackCandidate === '::1') return DEFAULT_BMS_HOST;
	const host = normalizeHost(value, true);
	return isLoopbackHost(host) ? DEFAULT_BMS_HOST : host;
}

export function defaultBackendSettings(): BackendSettings {
	const pageHost = browser ? window.location.hostname : '127.0.0.1';
	return {
		bmsHost: DEFAULT_BMS_HOST,
		rtsHost: DEFAULT_RTS_HOST || pageHost
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
			bmsHost: value.bmsHost ? normalizeBmsHost(value.bmsHost) : defaults.bmsHost,
			rtsHost: value.rtsHost ? normalizeHost(value.rtsHost) : defaults.rtsHost
		};
	} catch {
		localStorage.removeItem(STORAGE_KEY);
		return defaults;
	}
}

export function saveBackendSettings(settings: BackendSettings, scope: 'all' | 'bms' = 'all') {
	const current = getBackendSettings();
	const normalized = {
		bmsHost: normalizeBmsHost(settings.bmsHost),
		rtsHost: scope === 'bms' ? current.rtsHost : normalizeHost(settings.rtsHost)
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
	// The browser connects to the web server; its proxy reaches device loopback.
	// Vite supplies the same route during development.
	if (isLoopbackHost(host)) {
		const webHost = browser ? window.location.host : DEFAULT_BMS_HOST;
		return `${pageProtocol('ws')}//${webHost}/websocket`;
	}
	return `${pageProtocol('ws')}//${host}:${BMS_WS_PORT}`;
}

export function bmsRestPath(path: string) {
	const host = getBackendSettings().bmsHost;
	if (isLoopbackHost(host)) return path;
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
