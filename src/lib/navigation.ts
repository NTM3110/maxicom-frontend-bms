import {
	Activity,
	BatteryCharging,
	Cable,
	ChartNoAxesCombined,
	CircleGauge,
	Database,
	Gauge,
	HardDrive,
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
		label: 'MONITORING & OPERATIONS',
		items: [
			{ id: 'health-monitor_bms', label: 'Health Monitor', icon: CircleGauge },
			{ id: 'health-monitor_hybrid', label: 'Health Monitor', icon: Activity },
			{ id: 'hybrid-controller', label: 'Hybrid Controller', icon: SlidersHorizontal },
			{ id: 'calibration', label: 'Calibration Event', icon: ChartNoAxesCombined },
			{ id: 'assets', label: 'Asset Management', icon: HardDrive }
		]
	},
	{
		label: 'DEVICE CONFIGURATION',
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
			{ id: 'alerts', label: 'Alerts', icon: MailWarning },
			{ id: 'maintenance', label: 'Maintenance', icon: Wrench }
		]
	}
];

export const accountItem: NavigationItem = { id: 'account', label: 'Account', icon: UserRound };
