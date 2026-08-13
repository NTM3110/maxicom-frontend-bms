import {
	Activity,
	BellRing,
	BatteryCharging,
	Cable,
	ChartNoAxesCombined,
	CircleGauge,
	Database,
	Gauge,
	HardDrive,
	Info,
	MailWarning,
	Network,
	ShieldCheck,
	SlidersHorizontal,
	UserRound,
	Wrench
} from '@lucide/svelte';
import type { Component } from 'svelte';

export type NavigationItem = {
	id: string;
	label: string;
	icon: Component;
};

export const navigationGroups: { label?: string; items: NavigationItem[] }[] = [
	{
		items: [
			{ id: 'dashboard', label: 'Dashboard', icon: CircleGauge },
			{ id: 'status', label: 'Status', icon: Activity }
		]
	},
	{
		label: 'DEVICES',
		items: [
			{ id: 'battery-strings', label: 'Battery Strings', icon: BatteryCharging },
			{ id: 'inverters', label: 'Inverters', icon: Gauge },
			{ id: 'meters', label: 'Meters', icon: Activity },
			{ id: 'data-loggers', label: 'Data Loggers', icon: Database },
			{ id: 'ess', label: 'ESS / Storage', icon: BatteryCharging },
			{ id: 'wika', label: 'Wika', icon: Gauge }
		]
	},
	{
		label: 'OPERATIONS',
		items: [
			{ id: 'hybrid-controller', label: 'Hybrid Controller', icon: SlidersHorizontal },
			{ id: 'calibration', label: 'Discharge Calibration', icon: ChartNoAxesCombined }
		]
	},
	{
		label: 'MANAGEMENT',
		items: [{ id: 'assets', label: 'Asset Management', icon: HardDrive }]
	},
	{
		label: 'CONNECTIVITY',
		items: [
			{ id: 'serial-tcp', label: 'Serial & TCP', icon: Cable },
			{ id: 'network', label: 'Network', icon: Network },
			{ id: 'vpn', label: 'VPN', icon: ShieldCheck }
		]
	},
	{
		label: 'SYSTEM',
		items: [
			{ id: 'system-info', label: 'System Info', icon: Info },
			{ id: 'alerts', label: 'Alerts', icon: MailWarning },
			{ id: 'maintenance', label: 'Maintenance', icon: Wrench }
		]
	}
];

export const accountItem: NavigationItem = { id: 'account', label: 'Account', icon: UserRound };
