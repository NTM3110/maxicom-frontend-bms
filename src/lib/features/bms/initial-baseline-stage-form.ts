export type InitialBaselineFormMode = 'demo' | 'real';

export type InitialBaselineResistanceCell = {
	cellId: number;
	resistanceMohm: number | null;
	quality?: string | null;
	availabilityWarning?: string | null;
};

export type InitialBaselineVocCell = {
	id: number;
	voltage: number | null;
	quality?: string | null;
	availabilityWarning?: string | null;
};

export type InitialBaselineStageFiveModel = {
	mode: InitialBaselineFormMode;
	readOnly: boolean;
	busy: boolean;
	cellCount: number;
	boostVoltagePerCell: number;
	floatVoltagePerCell: number;
	boostVoltage: number;
	floatVoltage: number;
	currentLimit: number;
	recoveryMcbClosed: boolean;
	recoverySettingsVerified: boolean;
	recoveryStarted: boolean;
	recoveryChargeComplete: boolean;
	recoveryProgress: number;
	recoveryBoostVoltage: number | null;
	recoveryFloatStarted: boolean;
	recoveryFloatReached: boolean;
	recoveryFloatProgress: number;
	recoveryFloatVoltage: number | null;
	recoveryFloatCurrentA: number | null;
	recoveryFloatStableProgress: number;
	recoveryFloatElapsedSeconds: number;
	recoveryFloatStableSeconds: number;
	recoveryFloatComplete: boolean;
	recoveryFloatConfirmed: boolean;
	resistanceCells: InitialBaselineResistanceCell[];
	resistanceConfirmed: boolean;
	averageResistanceMohm: string;
	floatCurrent: string;
	floatCurrentConfirmed: boolean;
	midpointVoltage: string;
	midpointConfirmed: boolean;
	rippleNoLoad: string;
	rippleNoLoadConfirmed: boolean;
	loadConnected: boolean;
	rippleWithLoad: string;
	rippleWithLoadConfirmed: boolean;
	chargerMcbOpen: boolean;
	vocLoading: boolean;
	vocError: string;
	vocSampleId: number | null;
	vocCapturedAt: string | null;
	vocStringVoltage: number | null;
	vocCells: InitialBaselineVocCell[];
	vocConfirmed: boolean;
};

export type InitialBaselineStageFiveActions = {
	setRecoveryMcbClosed(checked: boolean): void;
	setRecoverySettingsVerified(checked: boolean): void;
	startRecovery(): void;
	setRecoveryFloatConfirmed(checked: boolean): void;
	setResistanceConfirmed(checked: boolean): void;
	setFloatCurrent(value: string): void;
	setFloatCurrentConfirmed(checked: boolean): void;
	setMidpointVoltage(value: string): void;
	setMidpointConfirmed(checked: boolean): void;
	setRippleNoLoad(value: string): void;
	setRippleNoLoadConfirmed(checked: boolean): void;
	setLoadConnected(checked: boolean): void;
	setRippleWithLoad(value: string): void;
	setRippleWithLoadConfirmed(checked: boolean): void;
	setChargerMcbOpen(checked: boolean): void;
	setVocConfirmed(checked: boolean): void;
};
