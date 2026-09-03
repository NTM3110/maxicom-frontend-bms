export type InitialBaselineDemoStatus = 'PRECHECK' | 'IN_PROGRESS' | 'CHARGING' | 'AWAITING_BOOST_CONFIRMATION' | 'AWAITING_FLOAT_CONFIRMATION' | 'FLOAT_STABILIZING' | 'COOLING_DOWN' | 'COMPLETED' | 'CANCELLED';

export type InitialBaselineDemoCellResistance = {
	cellId: number;
	resistanceMohm: number;
};

export type InitialBaselineDemoVocCell = {
	cellId: number;
	voltageV: number;
};

export type InitialBaselineDemoVocSnapshot = {
	capturedAt: number;
	stringVoltageV: number;
	cells: InitialBaselineDemoVocCell[];
};

export type InitialBaselineDemoSummary = {
	stringVoltage: string;
	midpointVoltage: string;
	dischargedCapacity: string;
	initialSoh: string;
	lowestCellVoltage: string;
	stopReason: string;
	floatCurrent: string;
	internalResistance: string;
	ambientTemperature: string;
	temperatureDelta: string;
	allowedTemperatureDelta: string;
	rippleNoLoad: string;
	rippleWithLoad: string;
};

export type InitialBaselineDemoTicket = {
	id: string;
	stringIndex: number;
	stringName: string;
	createdAt: number;
	updatedAt: number;
	status: InitialBaselineDemoStatus;
	currentStep: number;
	initialSettingsVerified: boolean;
	boostStartedAt: number | null;
	boostConfirmed: boolean;
	boostConfirmedAt: number | null;
	floatConfirmed: boolean;
	floatStableDurationMinutes?: number;
	floatVoltageToleranceV?: number;
	floatCurrentMinA?: number;
	floatCurrentMaxA?: number;
	floatStableStartedAt?: number | null;
	recoveryMcbClosed?: boolean;
	recoverySettingsVerified?: boolean;
	recoveryStartedAt?: number | null;
	recoveryChargeConfirmed?: boolean;
	recoveryFloatStartedAt?: number | null;
	recoveryFloatStableStartedAt?: number | null;
	recoveryFloatConfirmed?: boolean;
	recoveryCellResistances?: InitialBaselineDemoCellResistance[] | null;
	resistanceMeasured?: boolean;
	floatCurrent?: string;
	floatCurrentMeasured?: boolean;
	midpointVoltage?: string;
	midpointMeasured?: boolean;
	rippleNoLoad?: string;
	rippleNoLoadMeasured?: boolean;
	loadConnectedForRipple?: boolean;
	rippleWithLoad?: string;
	rippleWithLoadMeasured?: boolean;
	chargerOpenedForVoc?: boolean;
	vocCaptureStartedAt?: number | null;
	vocSnapshot?: InitialBaselineDemoVocSnapshot | null;
	vocBaselineConfirmed?: boolean;
	cooldownStartedAt: number | null;
	cooldownDurationMinutes: number | null;
	cooldownAllowedTemperatureDelta: number | null;
	completedAt: number | null;
	summary: InitialBaselineDemoSummary | null;
};

const storageKey = (stringIndex: number) => `maxicom.initial-baseline-demo.${stringIndex}`;

export function loadInitialBaselineDemoTicket(stringIndex: number) {
	if (typeof window === 'undefined') return null;
	try {
		const raw = window.localStorage.getItem(storageKey(stringIndex));
		return raw ? JSON.parse(raw) as InitialBaselineDemoTicket : null;
	} catch { return null; }
}

export function saveInitialBaselineDemoTicket(ticket: InitialBaselineDemoTicket) {
	if (typeof window !== 'undefined') window.localStorage.setItem(storageKey(ticket.stringIndex), JSON.stringify(ticket));
}

export function removeInitialBaselineDemoTicket(stringIndex: number) {
	if (typeof window !== 'undefined') window.localStorage.removeItem(storageKey(stringIndex));
}

export function createInitialBaselineDemoTicket(stringIndex: number, stringName: string): InitialBaselineDemoTicket {
	const now = Date.now();
	return {
		id: `IB-DEMO-${now.toString().slice(-6)}`, stringIndex, stringName, createdAt: now, updatedAt: now,
		status: 'PRECHECK', currentStep: 0, initialSettingsVerified: false, boostStartedAt: null,
		boostConfirmed: false, boostConfirmedAt: null, floatConfirmed: false,
		floatStableDurationMinutes: 60, floatVoltageToleranceV: 1,
		floatCurrentMinA: 0.1, floatCurrentMaxA: 0.2, floatStableStartedAt: null,
		recoveryMcbClosed: false, recoverySettingsVerified: false, recoveryStartedAt: null,
		recoveryChargeConfirmed: false, recoveryFloatStartedAt: null,
		recoveryFloatStableStartedAt: null, recoveryFloatConfirmed: false,
		recoveryCellResistances: null, resistanceMeasured: false, floatCurrent: '82',
		floatCurrentMeasured: false, midpointVoltage: '', midpointMeasured: false,
		rippleNoLoad: '0.6', rippleNoLoadMeasured: false, loadConnectedForRipple: false,
		rippleWithLoad: '0.8', rippleWithLoadMeasured: false, chargerOpenedForVoc: false,
		vocCaptureStartedAt: null, vocSnapshot: null, vocBaselineConfirmed: false,
		cooldownStartedAt: null, cooldownDurationMinutes: null,
		cooldownAllowedTemperatureDelta: null, completedAt: null, summary: null
	};
}
