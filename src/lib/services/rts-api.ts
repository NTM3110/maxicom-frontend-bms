import { rtsApiPath, rtsWebSocketUrl as resolveRtsWebSocketUrl } from '$lib/services/backend-settings';

export type RtsProperty = { name: string; value: unknown };

export type RtsComponent = {
	factoryId?: string;
	properties?: Record<string, unknown>;
};

export type RtsEdgeConfig = {
	components: Record<string, RtsComponent>;
	raw: unknown;
};

export type NetworkConfig = {
	id: 'eth0' | 'eth1';
	displayName: string;
	isDhcp: boolean;
	ipAddress: string;
	subnetMask: string;
	gateway: string;
	dnsPrimary: string;
	dnsSecondary: string;
};

export type Modem4GConfig = {
	enabled: boolean;
	apn: string;
	username: string;
	password: string;
};

export type Modem4GStatus = {
	status: string;
	signalStrength: number;
	signalDbm?: number;
	operator: string;
	ipAddress: string;
	connectionType: string;
	modemModel: string;
	imei: string;
	lastError: string | null;
};

export type EvnModbusStatus = {
	pOutEnabled: boolean | null;
	pOutSetpointWatt: number | null;
	pOutSetpointPercent: number | null;
	qOutEnabled: boolean | null;
	qOutSetpointVar: number | null;
	qOutSetpointPercent: number | null;
};

type RpcResponse = {
	id?: string;
	result?: unknown;
	error?: { code?: number; message?: string };
};

function uuid() {
	return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function errorMessage(value: unknown, fallback: string) {
	return value instanceof Error ? value.message : fallback;
}

function rtsPath(path: string) {
	return rtsApiPath(path);
}

function rtsWebSocketUrl() {
	return resolveRtsWebSocketUrl();
}

function toForm(config: Record<string, unknown>, arraysAsCsv = true) {
	const body = new URLSearchParams();
	for (const [key, value] of Object.entries(config)) {
		const normalized = arraysAsCsv && Array.isArray(value) ? value.join(',') : value;
		body.set(key, normalized === null || normalized === undefined ? '' : String(normalized));
	}
	return body;
}

async function requestText(path: string, init?: RequestInit) {
	const response = await fetch(rtsPath(path), init);
	if (!response.ok) throw new Error(`RTS API ${response.status}: ${response.statusText}`);
	return response.text();
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
	const response = await fetch(rtsPath(path), init);
	if (!response.ok) throw new Error(`RTS API ${response.status}: ${response.statusText}`);
	return response.json() as Promise<T>;
}

class RtsRpcClient {
	private socket: WebSocket | null = null;
	private connecting: Promise<void> | null = null;
	private generation = 0;
	private pending = new Map<string, { resolve: (value: unknown) => void; reject: (reason: Error) => void; timer: ReturnType<typeof setTimeout> }>();

	private async connect() {
		if (typeof window === 'undefined') throw new Error('RTS WebSocket is only available in the browser.');
		if (this.socket?.readyState === WebSocket.OPEN) return;
		if (this.connecting) return this.connecting;

		const generation = ++this.generation;
		this.connecting = new Promise<void>((resolve, reject) => {
			const socket = new WebSocket(rtsWebSocketUrl());
			this.socket = socket;

			socket.onmessage = (event) => {
				if (generation !== this.generation) return;
				let message: RpcResponse;
				try { message = JSON.parse(event.data as string) as RpcResponse; } catch { return; }
				if (!message.id) return;
				const waiter = this.pending.get(message.id);
				if (!waiter) return;
				clearTimeout(waiter.timer);
				this.pending.delete(message.id);
				if (message.error) waiter.reject(new Error(`RPC Error: ${message.error.message ?? 'Unknown error'} (Code: ${message.error.code ?? '-'})`));
				else waiter.resolve(message.result);
			};

			socket.onerror = () => {
				if (generation === this.generation) reject(new Error('Cannot connect to the RTS JSON-RPC service.'));
			};
			socket.onclose = () => {
				if (generation !== this.generation) return;
				this.socket = null;
				this.connecting = null;
				for (const waiter of this.pending.values()) {
					clearTimeout(waiter.timer);
					waiter.reject(new Error('RTS JSON-RPC connection closed.'));
				}
				this.pending.clear();
			};
			socket.onopen = () => {
				if (generation !== this.generation) {
					socket.close();
					return;
				}
				void this.sendRaw('authenticateWithPassword', { username: 'admin', password: 'admin' })
					.then(() => resolve())
					.catch(reject);
			};
		});

		try { await this.connecting; } catch (error) {
			this.connecting = null;
			this.socket?.close();
			throw error;
		}
	}

	private sendRaw(method: string, params: Record<string, unknown> = {}) {
		if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return Promise.reject(new Error('RTS JSON-RPC is not connected.'));
		const id = uuid();
		return new Promise<unknown>((resolve, reject) => {
			const timer = setTimeout(() => {
				this.pending.delete(id);
				reject(new Error(`RTS JSON-RPC request timed out: ${method}`));
			}, 12000);
			this.pending.set(id, { resolve, reject, timer });
			this.socket?.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }));
		});
	}

	async rpc(method: string, params: Record<string, unknown> = {}) {
		await this.connect();
		return this.sendRaw(method, params);
	}

	async edgeRpc(method: string, params: Record<string, unknown> = {}) {
		const innerId = uuid();
		return this.rpc('edgeRpc', {
			edgeId: '0',
			payload: { jsonrpc: '2.0', id: innerId, method, params }
		});
	}

	reset() {
		this.generation += 1;
		const socket = this.socket;
		this.socket = null;
		this.connecting = null;
		for (const waiter of this.pending.values()) {
			clearTimeout(waiter.timer);
			waiter.reject(new Error('RTS JSON-RPC connection restarted.'));
		}
		this.pending.clear();
		if (socket && (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN)) socket.close();
	}
}

const rpcClient = new RtsRpcClient();

export function resetRtsConnection() {
	rpcClient.reset();
}

export async function checkRtsConnection() {
	await rpcClient.edgeRpc('getEdgeConfig');
	return true;
}

export function unwrapEdgeConfig(response: unknown): RtsEdgeConfig {
	const value = response as Record<string, any> | null;
	const components = value?.payload?.result?.components ?? value?.result?.components ?? value?.components ?? {};
	return { components, raw: response };
}

export async function getEdgeConfig() {
	return unwrapEdgeConfig(await rpcClient.edgeRpc('getEdgeConfig'));
}

export async function getFelixPids(): Promise<any[]> {
	try {
		const html = await requestText('/system/console/configMgr');
		const match = html.match(/var configData = (\{.*?\});/);
		return match?.[1] ? (JSON.parse(match[1])?.pids ?? []) : [];
	} catch (error) {
		console.warn('[MAXiCom RTS] Failed to fetch Felix PIDs.', error);
		return [];
	}
}

export async function getComponentDetails(pid: string) {
	return requestJson<Record<string, unknown>>(`/system/console/configMgr/${encodeURIComponent(pid)}.json`);
}

export async function postFelix(path: string, config: Record<string, unknown>, arraysAsCsv = true) {
	return requestText(path, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: toForm(config, arraysAsCsv)
	});
}

export function createSerialPort(factoryPid: string, config: Record<string, unknown>) {
	return postFelix(`/system/console/configMgr/${encodeURIComponent(factoryPid)}`, config, false);
}

export function createInverter(factoryPid: string, config: Record<string, unknown>) {
	return postFelix(`/system/console/configMgr/${encodeURIComponent(factoryPid)}`, config, true);
}

export function updateFelixComponent(servicePid: string, config: Record<string, unknown>) {
	return postFelix(`/system/console/configMgr/${encodeURIComponent(servicePid)}`, config, true);
}

/** Felix update variant retained for parity with the Angular ApiService. */
export function updateConfigComponent(servicePid: string, config: Record<string, unknown>) {
	const values = Object.fromEntries(Object.entries(config).map(([name, value]) => [`${name}.value`, value]));
	return postFelix(`/system/console/configMgr/${encodeURIComponent(servicePid)}`, {
		apply: 'true',
		...values,
		propertylist: Object.keys(config).join(',')
	});
}

export function deleteFelixComponent(servicePid: string) {
	return postFelix(`/system/console/configMgr/${encodeURIComponent(servicePid)}`, { apply: 'true', delete: 'true' });
}

export function createConfigComponent(pid: string, config: Record<string, unknown>) {
	return postFelix(`/system/console/configMgr/${encodeURIComponent(pid)}`, {
		apply: 'true',
		propertylist: Object.keys(config).join(','),
		...config
	});
}

export function createUserConfigComponent(factoryPid: string, config: Record<string, unknown>) {
	return postFelix(`/system/console/configMgr/${encodeURIComponent(factoryPid)}`, config);
}

export function updateController(servicePid: string, config: Record<string, unknown>) {
	const body = new URLSearchParams();
	for (const [key, value] of Object.entries(config)) {
		if (key === 'enabled' && value === true) {
			body.append('enabled', 'true');
			body.append('enabled', 'false');
		} else body.set(key, Array.isArray(value) ? value.join(',') : String(value ?? ''));
	}
	return requestText(`/system/console/configMgr/${encodeURIComponent(servicePid)}`, {
		method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body
	});
}

export function updateComponentProperties(componentId: string, properties: RtsProperty[]) {
	return rpcClient.edgeRpc('updateComponentConfig', { componentId, properties });
}

export function createComponentConfigRpc(factoryPid: string, properties: RtsProperty[]) {
	return rpcClient.edgeRpc('createComponentConfig', { factoryPid, properties });
}

export function deleteComponentConfig(componentId: string) {
	return rpcClient.edgeRpc('deleteComponentConfig', { componentId });
}

export function queryHistoricTimeseriesData(timezone: string, fromDate: string, toDate: string, channels: string[], resolution?: { value: number; unit: string }) {
	return rpcClient.edgeRpc('queryHistoricTimeseriesData', { timezone, fromDate, toDate, channels, ...(resolution ? { resolution } : {}) });
}

/** Starts the same OpenEMS channel subscription exposed by the Angular service. */
export function subscribeChannels(channels: string[]) {
	return rpcClient.edgeRpc('subscribeChannels', { count: 0, channels });
}

export async function getNetworkConfigs(): Promise<NetworkConfig[]> {
	const { components } = await getEdgeConfig();
	const config = components._network?.properties ?? {};
	const create = (id: 'eth0' | 'eth1', displayName: string): NetworkConfig => {
		const mode = String(config[`${id}Mode`] ?? config[id] ?? 'DHCP').toUpperCase();
		return {
			id, displayName, isDhcp: mode !== 'STATICIP' && mode !== 'STATIC',
			ipAddress: String(config[`${id}Ip`] ?? ''), subnetMask: String(config[`${id}SubnetMask`] ?? ''),
			gateway: String(config[`${id}Gateway`] ?? ''), dnsPrimary: String(config[`${id}DnsPrimary`] ?? ''),
			dnsSecondary: String(config[`${id}DnsSecondary`] ?? '')
		};
	};
	return [create('eth1', 'WAN 0'), create('eth0', 'WAN 1')];
}

export function setNetworkConfig(config: NetworkConfig) {
	const properties: RtsProperty[] = [{ name: `${config.id}Mode`, value: config.isDhcp ? 'DHCP' : 'STATIC' }];
	if (!config.isDhcp) properties.push(
		{ name: `${config.id}Ip`, value: config.ipAddress }, { name: `${config.id}SubnetMask`, value: config.subnetMask },
		{ name: `${config.id}Gateway`, value: config.gateway }, { name: `${config.id}DnsPrimary`, value: config.dnsPrimary },
		{ name: `${config.id}DnsSecondary`, value: config.dnsSecondary }
	);
	return updateComponentProperties('_network', properties);
}

export async function getNetworkActualStatus() {
	try { return await requestJson<Record<string, { ip: string; netmask: string; gateway: string }>>('/api/network/status'); }
	catch { return {}; }
}

export async function getModem4GStatus(): Promise<Modem4GStatus> {
	try {
		const response = await rpcClient.edgeRpc('componentJsonApi', {
			componentId: 'modem4g0', payload: { jsonrpc: '2.0', id: uuid(), method: 'getModemStatus', params: {} }
		}) as Record<string, any>;
		const result = response?.payload?.result ?? {};
		return { status: result.status ?? 'DISCONNECTED', signalStrength: result.signalStrength ?? 0, signalDbm: result.signalDbm,
			operator: result.operator ?? '-', ipAddress: result.ipAddress ?? '-', connectionType: result.connectionType ?? '-',
			modemModel: result.modemModel ?? '-', imei: result.imei ?? '-', lastError: result.lastError ?? null };
	} catch (error) {
		return { status: 'NO_MODEM', signalStrength: 0, operator: '-', ipAddress: '-', connectionType: '-', modemModel: '-', imei: '-', lastError: errorMessage(error, 'Could not connect to modem') };
	}
}

export async function getModem4GConfig(): Promise<Modem4GConfig> {
	try {
		const { components } = await getEdgeConfig();
		const config = components.modem4g0?.properties ?? {};
		return { enabled: Boolean(config.enabled ?? true), apn: String(config.apn ?? 'v-internet'), username: String(config.username ?? ''), password: String(config.password ?? '') };
	} catch { return { enabled: false, apn: 'v-internet', username: '', password: '' }; }
}

export function setModem4GConfig(config: Modem4GConfig) {
	return updateComponentProperties('modem4g0', Object.entries(config).map(([name, value]) => ({ name, value })));
}

export async function getChannelValueRest(componentId: string, channelId: string) {
	try {
		const result = await requestJson<{ value?: unknown }>(`/rest/channel/${encodeURIComponent(componentId)}/${encodeURIComponent(channelId)}`);
		return result?.value ?? null;
	} catch { return null; }
}

export async function getRtsSystemStatus(componentId = '_modem.maxicom') {
	const [cpuUsage, ramUsage, diskUsage, firmware, network] = await Promise.all([
		getChannelValueRest(componentId, 'CpuUsage'), getChannelValueRest(componentId, 'RamUsage'), getChannelValueRest(componentId, 'DiskUsage'),
		getChannelValueRest(componentId, 'Fw'), getNetworkActualStatus()
	]);
	const percent = (value: unknown) => value == null || value === '' || Number.isNaN(Number(String(value).replace('%', '').trim())) ? null : Number(String(value).replace('%', '').trim());
	return { cpuUsage: percent(cpuUsage), ramUsage: percent(ramUsage), diskUsage: percent(diskUsage), firmware: firmware == null ? null : String(firmware), network };
}

export async function getEvnModbusStatus(): Promise<EvnModbusStatus> {
	const [pEnabled, pWatt, pPercent, qEnabled, qVar, qPercent] = await Promise.all([
		getChannelValueRest('ctrlEvnModbus0', 'POutEnabled'), getChannelValueRest('ctrlEvnModbus0', 'POutSetpointWatt'),
		getChannelValueRest('ctrlEvnModbus0', 'POutSetpointPercent'), getChannelValueRest('ctrlEvnModbus0', 'QOutEnabled'),
		getChannelValueRest('ctrlEvnModbus0', 'QOutSetpointVar'), getChannelValueRest('ctrlEvnModbus0', 'QOutSetpointPercent')
	]);
	const number = (value: unknown) => value == null || Number.isNaN(Number(value)) ? null : Number(value);
	return { pOutEnabled: pEnabled == null ? null : pEnabled === 1 || pEnabled === true, pOutSetpointWatt: number(pWatt),
		pOutSetpointPercent: number(pPercent), qOutEnabled: qEnabled == null ? null : qEnabled === 1 || qEnabled === true,
		qOutSetpointVar: number(qVar), qOutSetpointPercent: number(qPercent) };
}

export async function getEvnVpnControllers() {
	const { components } = await getEdgeConfig();
	return Object.entries(components).flatMap(([servicePid, component]) => {
		const isVpn = servicePid.startsWith('Controller.VPN.EVN') || component.factoryId === 'Controller.VPN.EVN';
		if (!isVpn) return [];
		return [{ ...(component.properties ?? {}), 'service.pid': servicePid, pid: component.properties?.id ?? 'EVNNPC0' }];
	});
}

export function createEvnVpnController(config: Record<string, unknown>) {
	return postFelix('/system/console/configMgr/Controller.VPN.EVN', {
		apply: 'true', factoryPid: 'Controller.VPN.EVN', action: 'ajaxConfigManager', propertylist: Object.keys(config).join(','), ...config
	});
}

export function updateEvnVpnController(servicePid: string, config: Record<string, unknown>) {
	const names = ['id', 'enabled', 'alias', 'localId', 'localSubnet', 'natLeft', 'remotePublicIp', 'remoteId', 'remoteSubnet', 'psk'];
	const values = Object.fromEntries(names.filter((name) => name in config).map((name) => [name, config[name]]));
	return postFelix(`/system/console/configMgr/${encodeURIComponent(servicePid)}`, {
		apply: 'true', factoryPid: 'Controller.VPN.EVN', action: 'ajaxConfigManager', '$location': '', propertylist: names.join(','), ...values
	});
}

export function deleteEvnVpnController(servicePid: string) {
	return postFelix(`/system/console/configMgr/${encodeURIComponent(servicePid)}`, { apply: '1', delete: '1' });
}

export async function getVpnChannelStatus(componentId: string) {
	const [phase1Status, phase2Status, errorDetails] = await Promise.all([
		getChannelValueRest(componentId, 'Phase1Status'), getChannelValueRest(componentId, 'Phase2Status'), getChannelValueRest(componentId, 'VpnErrorDetails')
	]);
	return { phase1Status, phase2Status, errorDetails };
}

/* Legacy Python IPsec/certificate routes are not used by the current EVN-IPsec
 * screen, but remain available so the unified frontend does not drop any API
 * exposed by the Angular ApiService. */
export function getIpsecConnections() { return requestJson<any[]>('/api/ipsec/connections'); }
export function createIpsecConnection(connection: Record<string, unknown>) {
	return requestJson<any>('/api/ipsec/connections', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(connection) });
}
export function updateIpsecConnection(connectionId: string, connection: Record<string, unknown>) {
	return requestJson<any>(`/api/ipsec/connections/${encodeURIComponent(connectionId)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(connection) });
}
export function deleteIpsecConnection(connectionId: string) {
	return requestJson<any>(`/api/ipsec/connections/${encodeURIComponent(connectionId)}`, { method: 'DELETE' });
}
export function getIpsecCertificates() { return requestJson<any[]>('/api/ipsec/certificates'); }
export function uploadIpsecCertificate(file: File) {
	const formData = new FormData(); formData.set('file', file);
	return requestJson<any>('/api/ipsec/certificates/upload', { method: 'POST', body: formData });
}

export function pingIpsec(ip: string) {
	return requestJson<any>('/edge-rpc', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
		jsonrpc: '2.0', id: uuid(), method: 'componentJsonApi', params: { componentId: '_host', payload: { jsonrpc: '2.0', method: 'ping', params: { ip } } }
	}) });
}

export function uploadOpenvpnProfile(file: File) {
	const formData = new FormData(); formData.set('file', file);
	return requestJson<any>('/api/openvpn/upload', { method: 'POST', body: formData });
}
export function saveOpenvpnConfig(config: Record<string, unknown>) { return requestJson<any>('/api/openvpn/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(config) }); }
export function enableOpenvpn() { return requestJson<any>('/api/openvpn/enable', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); }
export function disableOpenvpn() { return requestJson<any>('/api/openvpn/disable', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); }
export function getOpenvpnStatus() { return requestJson<any>('/api/openvpn/status'); }

export function componentProperties(config: RtsEdgeConfig, componentId: string) {
	return config.components[componentId]?.properties ?? {};
}
