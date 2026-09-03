import type { BmsStringTelemetry, CalibrationAllowedAction, CalibrationCurvePointPage, CalibrationEventDetail, CalibrationManualEvidence, CalibrationSample } from '$lib/services/bms-api';

export const INITIAL_BASELINE_STAGE_GROUPS = [
	['PREREQUISITES'],
	['INITIAL_CHARGE'],
	['PRE_DISCHARGE_FLOAT'],
	['WAITING_FOR_LOAD', 'DISCHARGE', 'LOAD_DISCONNECT'],
	['RECHARGE', 'POST_RECHARGE_FLOAT', 'BASELINE_CAPTURE'],
	['COMPLETION']
] as const;

export type InitialBaselineRealAdapter = {
	event: CalibrationEventDetail;
	evidence: CalibrationManualEvidence[];
	samples: CalibrationSample[];
	telemetry: BmsStringTelemetry | null;
	curvePointPage: CalibrationCurvePointPage | null;
	curvePointsLoading: boolean;
	busy: boolean;
	onEvidence(type: string, value?: number, unit?: string, sampleId?: number): void;
	onConfigureDemoTimeScale(factor: 1 | 60): void;
	onConfigureFloatStablePolicy(policy: { durationMinutes: number; voltageToleranceV: number; currentMinA: number; currentMaxA: number }): void;
	onConfigureActiveFloatRange(processType: 'FLOAT_SETTLEMENT_TO_VFLOAT' | 'RECOVERY_FLOAT_STABILIZATION', currentMinA: number, currentMaxA: number, reason: string): Promise<void>;
	onConfigureActiveVocDeadband(deadbandA: number, reason: string): Promise<void>;
	onConfirmRecoveryLoadConnected(): Promise<void>;
	onConfigureDischargeMonitor(policy: { safetyFloorVoltagePerCell: number; maxWrongCurrentDirectionSamples: number }): void;
	onLoadCurvePoints(cellIndex: number, offset: number, limit: number): void;
	onStartProcess(type: string): void;
	onStartControlledDischarge(): void;
	onCompleteProcess(type: string): void;
	onConfirmDischargeStopped(): void;
	onContinue(): void;
	onExecuteAction(action: CalibrationAllowedAction, reason: string, acknowledgedItems: string[]): void;
	onRedoStage(reason: string): void;
	canRedoStage: boolean;
};

export function initialBaselineStep(event: CalibrationEventDetail) {
	const stage = event.stages.find((item) => item.calibrationStageId === event.currentStageId);
	const index = INITIAL_BASELINE_STAGE_GROUPS.findIndex((types) => stage && (types as readonly string[]).includes(stage.type));
	return index < 0 ? 0 : index;
}

export function hasInitialBaselineEvidence(adapter: InitialBaselineRealAdapter, type: string) {
	return adapter.evidence.some((item) => item.evidenceType === type && ['RECORDED', 'PASS'].includes(item.status));
}

export function initialBaselineProcess(adapter: InitialBaselineRealAdapter, type: string) {
	return adapter.event.processes.find((item) => item.type === type) ?? null;
}

export function finalProcessSample(adapter: InitialBaselineRealAdapter, type: string) {
	const process = initialBaselineProcess(adapter, type);
	if (!process || process.state !== 'COMPLETED') return null;
	return adapter.samples.filter((sample) => sample.calibrationProcessId === process.calibrationProcessId
		&& sample.processAttemptNumber === process.attemptNumber && sample.persistenceReason === 'FINAL_SNAPSHOT')
		.sort((left, right) => left.sampleId - right.sampleId).at(-1) ?? null;
}

export type InitialBaselineCooldownTemperature = {
	ambientTemperatureC: number | null;
	farthestCellTemperatureC: number | null;
	deltaC: number | null;
};

/**
 * Stage 3 is a live thermal check. Prefer the current BmsStringSnapshot over a
 * persisted process sample, because the latter is written only when the worker
 * completes the cool-down process and otherwise cannot describe the cells now.
 */
export function initialBaselineCooldownTemperature(adapter: InitialBaselineRealAdapter): InitialBaselineCooldownTemperature {
	const finite = (value: number | null | undefined) => typeof value === 'number' && Number.isFinite(value) ? value : null;
	const liveAmbientTemperatureC = finite(adapter.telemetry?.summary.ambientTemperature);
	const liveCellTemperatures = adapter.telemetry?.cells.map((cell) => finite(cell.temperature)).filter((value): value is number => value !== null) ?? [];
	const finalSample = finalProcessSample(adapter, 'COOL_DOWN_TO_AMBIENT');
	const ambientTemperatureC = liveAmbientTemperatureC ?? finite(finalSample?.ambientTemperatureC);
	const sampleCellTemperatures = finalSample?.cells.map((cell) => finite(cell.temperatureC)).filter((value): value is number => value !== null) ?? [];
	const cellTemperatures = liveCellTemperatures.length ? liveCellTemperatures : sampleCellTemperatures;
	if (!cellTemperatures.length) return { ambientTemperatureC, farthestCellTemperatureC: null, deltaC: null };
	if (ambientTemperatureC === null) return { ambientTemperatureC, farthestCellTemperatureC: cellTemperatures[0], deltaC: null };
	const farthestCellTemperatureC = cellTemperatures.reduce((farthest, current) =>
		Math.abs(current - ambientTemperatureC) > Math.abs(farthest - ambientTemperatureC) ? current : farthest
	);
	return {
		ambientTemperatureC,
		farthestCellTemperatureC,
		deltaC: Math.abs(farthestCellTemperatureC - ambientTemperatureC)
	};
}
