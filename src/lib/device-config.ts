import { navigationGroups, type NavigationItem } from '$lib/navigation';

export type DeviceConfig = {
	schemaVersion: number;
	device: {
		product: 'bms' | 'rts' | 'unified';
		name: string;
		title: string;
		subtitle: string;
	};
	navigation: {
		defaultItem: string;
		enabledItems: string[];
	};
	connectivity: {
		serial: boolean;
		tcp: boolean;
	};
	authentication?: {
		defaultUser: { username: string; passwordHash: string };
	};
	systemInfo?: {
		hardwareModel?: string;
		firmwareVersion?: string;
		softwareVersion?: string;
		uptime?: string;
		cpuUsage?: string;
		memoryUsage?: string;
		diskUsage?: string;
		ipv4Address?: string;
		macAddress?: string;
	};
	/** RTS-specific device templates imported from the Angular configuration. */
	rts?: {
		systemInfo?: { serialNumber?: string; defaultUser?: { username: string; passwordHash: string } };
		sidebarConfig?: Record<string, { visible: boolean }>;
		serialPortTemplates?: Array<{ key: string; displayName: string; portName?: string }>;
		tcpBridgeTemplates?: Array<{ key: string; displayName: string }>;
		inverterSetup?: Record<string, unknown>;
		meterSetup?: Record<string, unknown>;
		storageSetup?: Record<string, unknown>;
		smartLoggerSetup?: Record<string, unknown>;
	};
};

const defaultConfig: DeviceConfig = {
	schemaVersion: 1,
	device: {
		product: 'rts',
		name: 'MAXiCom RTS',
		title: 'System Status',
		subtitle: 'Real-time energy management'
	},
	navigation: {
		defaultItem: 'health-monitor_hybrid',
		enabledItems: navigationGroups.flatMap((group) => group.items.map((item) => item.id))
	},
	connectivity: {
		serial: true,
		tcp: true
	},
	authentication: {
		defaultUser: {
			username: 'admin',
			passwordHash: '8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918'
		}
	}
};

const legacyNavigationAliases: Record<string, string> = {
	dashboard: 'health-monitor_bms',
	status: 'health-monitor_hybrid'
};

function normalizeNavigationId(id: string) {
	return legacyNavigationAliases[id] ?? id;
}

export function getNavigationForConfig(config: DeviceConfig) {
	const enabled = new Set(config.navigation.enabledItems.map(normalizeNavigationId));
	return navigationGroups
		.map((group) => ({
			...group,
			items: group.items.filter((item) =>
				enabled.has(item.id)
				&& !(config.device.product !== 'bms' && item.id === 'modbus-server')
				&& !(config.device.product === 'rts' && item.id === 'ntp-server')
				&& !(config.device.product === 'bms' && group.label === 'SYSTEM' && item.id === 'system-info'))
		}))
		.filter((group) => group.items.length > 0);
}

export function getDefaultItem(config: DeviceConfig, groups = getNavigationForConfig(config)): NavigationItem {
	const allItems = groups.flatMap((group) => group.items);
	const defaultItem = normalizeNavigationId(config.navigation.defaultItem);
	return allItems.find((item) => item.id === defaultItem)
		?? allItems[0]
		?? navigationGroups[0].items[0];
}

export async function loadDeviceConfig(): Promise<DeviceConfig> {
	try {
		const response = await fetch('/config/device-config.json', { cache: 'no-store' });
		if (!response.ok) throw new Error(`Could not load device configuration (${response.status})`);
		const config = await response.json() as DeviceConfig;
		if (!Array.isArray(config.navigation?.enabledItems) || !config.device?.name) {
			throw new Error('Device configuration is invalid');
		}
		config.connectivity ??= { serial: true, tcp: false };
		return config;
	} catch (error) {
		console.warn('[MAXiCom] Falling back to built-in device configuration.', error);
		return defaultConfig;
	}
}
