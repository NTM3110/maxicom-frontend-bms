<script lang="ts">
	import { onMount } from 'svelte';
	import { AlertTriangle, ArrowLeft, CheckCircle2, ClipboardCheck, Play } from '@lucide/svelte';
	import type { BatteryString, CalibrationAllowedAction, CalibrationProcess, CalibrationStage } from '$lib/services/bms-api';
	import type { InitialBaselineDemoCellResistance, InitialBaselineDemoTicket } from './initial-baseline-demo';
	import DischargeTrendChart from './DischargeTrendChart.svelte';
	import InitialBaselineStageFive from './InitialBaselineStageFive.svelte';
	import type { InitialBaselineStageFiveActions, InitialBaselineStageFiveModel } from './initial-baseline-stage-form';
	import { finalProcessSample, hasInitialBaselineEvidence, initialBaselineCooldownTemperature, initialBaselineProcess, initialBaselineStep, type InitialBaselineRealAdapter } from './initial-baseline-real';

	const DEMO_STABLE_PERCENT_MS_PER_CONFIGURED_MINUTE = 20;
	const RECOVERY_FLOAT_STABLE_DURATION_SECONDS = 60;

	type BaselineStep = {
		title: string;
		action: string;
		checklist: string[];
		records: string[];
	};

	let { stringName, batteryString, ticket, onTicketChange, onBack, real = null }: { stringName: string; batteryString: BatteryString | null; ticket: InitialBaselineDemoTicket; onTicketChange: (ticket: InitialBaselineDemoTicket) => void; onBack: () => void; real?: InitialBaselineRealAdapter | null } = $props();

	const steps: BaselineStep[] = [
		{ title: 'Pre-check', action: 'Isolate the load and inspect the battery string before charging.', checklist: ['Battery and charger connections are checked.', 'Load MCB is open.', 'No leakage, damage or deformed safety valve.', 'Open-circuit voltage is recorded.'], records: ['String voltage', 'Cell / block voltage'] },
		{ title: 'Initial charge', action: 'Apply the approved boost charge and wait for float charge.', checklist: ['Verify Vboost, Vfloat and current limit.', 'String voltage reaches Vboost.', 'Charger changes to Vfloat.'], records: ['Vboost / Vfloat', 'Charge current', 'Charge time'] },
		{ title: 'Cool-down', action: 'Open the charger DC MCB and wait until battery temperature is near ambient.', checklist: ['Charger DC MCB is open.', 'Cell temperature is near ambient.', 'Safety valves are checked.'], records: ['Ambient temperature', 'Cell / block temperature'] },
		{ title: 'Discharge test', action: 'Connect the standard load and discharge until the configured cut-off.', checklist: ['Select discharge profile and cut-off.', 'Connect the test load.', 'Disconnect the test load after stop.'], records: ['Discharged Ah', 'Lowest cell voltage', 'Stop reason'] },
		{ title: 'Recovery charge', action: 'Close the charger DC MCB, recharge to Vboost, then confirm stable Vfloat before taking baseline measurements.', checklist: ['String voltage reaches Vboost.', 'Charger changes to Vfloat.', 'Float condition is stable.'], records: ['Vboost / Vfloat', 'String voltage', 'Float current'] },
		{ title: 'Summary data', action: 'Review all measurements and confirm this Initial Baseline event is complete.', checklist: ['All required values are recorded.'], records: ['Baseline summary', 'Operator confirmation'] }
	];

	let selectedIndex = $state(0);
	let selected = $derived(steps[selectedIndex]);
	let activeStepIndex = $derived(real ? initialBaselineStep(real.event) : Math.min(ticket.currentStep, steps.length - 1));
	let viewingActiveStep = $derived(!real || selectedIndex === activeStepIndex);
	let navigationEventId = $state<number | null>(null);
	let checkedItems = $state<Record<string, boolean>>({});
	let demoComplete = $state(false);
	let completionDialog = $state(false);
	let now = $state(Date.now());
	let cellCount = $derived(real?.event.configuration.cellCount ?? batteryString?.cellQty ?? 106);
	let boostVoltagePerCell = $derived(real?.event.configuration.boostVoltagePerCell ?? batteryString?.boostVoltage ?? 2.37);
	let floatVoltagePerCell = $derived(real?.event.configuration.floatVoltagePerCell ?? batteryString?.floatVoltage ?? 2.23);
	let boostVoltage = $derived(boostVoltagePerCell * cellCount);
	let floatVoltage = $derived(floatVoltagePerCell * cellCount);
	let currentLimit = $derived(real?.event.configuration.chargeCurrentLimitA ?? (batteryString?.ratedCapacity ?? 200) * 0.2);
	let floatStableDurationInput = $state((ticket.floatStableDurationMinutes ?? 60).toString());
	let floatVoltageToleranceInput = $state((ticket.floatVoltageToleranceV ?? 1).toFixed(1));
	let floatCurrentMinInput = $state((ticket.floatCurrentMinA ?? 0.1).toFixed(1));
	let floatCurrentMaxInput = $state((ticket.floatCurrentMaxA ?? 0.2).toFixed(1));
	let floatPolicyInputEventVersion = $state<number | null>(null);
	let dischargeProfile = $state<'0.1C10' | '0.2C5'>('0.1C10');
	let dischargeSamplingMinutes = $state('10');
	let dischargeSamplingLastConfiguredMinutes = $state<number | null>(null);
	let dischargeLoadConnected = $state(false);
	let dischargeScheduled = $state(false);
	let dischargeStartedAt = $state<number | null>(null);
	let dischargeResultRecorded = $state(false);
	let dischargedCapacity = $state('196.8');
	let lowestCellVoltage = $state('1.80');
	let dischargeStopReason = $state('CELL_CUTOFF');
	let recoveryMcbClosed = $state(ticket.recoveryMcbClosed ?? false);
	let recoverySettingsVerified = $state(ticket.recoverySettingsVerified ?? false);
	let recoveryStartedAt = $state<number | null>(ticket.recoveryStartedAt ?? null);
	let recoveryFloatStartedAt = $state<number | null>(ticket.recoveryFloatStartedAt ?? null);
	let recoveryFloatStableStartedAt = $state<number | null>(ticket.recoveryFloatStableStartedAt ?? null);
	let recoveryFloatConfirmed = $state(ticket.recoveryFloatConfirmed ?? false);
	let resistanceMeasured = $state(ticket.resistanceMeasured ?? false);
	let floatCurrentMeasured = $state(ticket.floatCurrentMeasured ?? false);
	let midpointMeasured = $state(ticket.midpointMeasured ?? false);
	let rippleNoLoadMeasured = $state(ticket.rippleNoLoadMeasured ?? false);
	let chargerOpenedForLoad = $state(ticket.chargerOpenedForVoc ?? false);
	let loadMcbClosed = $state(ticket.loadConnectedForRipple ?? false);
	let rippleWithLoadMeasured = $state(ticket.rippleWithLoadMeasured ?? false);
	let recoveryBaselineAccepted = $state(ticket.vocBaselineConfirmed ?? false);
	let summaryApproved = $state(false);
	let floatCurrent = $state(ticket.floatCurrent ?? '82');
	let midpointVoltage = $state(ticket.midpointVoltage || (floatVoltage / 2).toFixed(1));
	let rippleNoLoad = $state(ticket.rippleNoLoad ?? '0.6');
	let rippleWithLoad = $state(ticket.rippleWithLoad ?? '0.8');
	let dischargeCurrent = $derived(configurationNumber('ratedCapacityAh', batteryString?.ratedCapacity ?? 200)
		* (real?.event.configuration.dischargeMethod === 'C5' || !real && dischargeProfile === '0.2C5' ? 0.2 : 0.1));
	let dischargeCutoff = $derived(configurationNumber('cutoffVoltagePerCell', dischargeProfile === '0.2C5' ? 1.75 : 1.8));
	let realCurrentStage = $derived(real?.event.stages.find((stage) => stage.calibrationStageId === real.event.currentStageId) ?? null);
	let displayedDischargeStage = $derived(real ? dischargeStageForView(realCurrentStage, real.event.stages) : null);
	let displayedDischargePhase = $derived(displayedDischargeStage?.type ?? null);
	let dischargeStageIsAuthoritativeCurrent = $derived(Boolean(real && displayedDischargeStage
		&& displayedDischargeStage.calibrationStageId === real.event.currentStageId));
	let controlledDischargeProcess = $derived(real ? initialBaselineProcess(real, 'CONTROLLED_DISCHARGE') : null);
	let configuredDischargeSamplingMinutes = $derived(dischargeProcessPropertyNumber('dischargeSamplingIntervalMinutes', 10));
	let dischargeSamplingDirty = $derived(Boolean(real) && Number(dischargeSamplingMinutes) !== configuredDischargeSamplingMinutes);
	let dischargeSamplingValid = $derived(Number.isInteger(Number(dischargeSamplingMinutes))
		&& Number(dischargeSamplingMinutes) >= 1 && Number(dischargeSamplingMinutes) <= 1440);
	let waitingForLoadCompleteAction = $derived(real?.event.allowedActions.find((action) => action.actionCode === 'COMPLETE_STAGE') ?? null);
	let dischargeRevalidateAction = $derived(real?.event.allowedActions.find((action) => action.actionCode === 'REVALIDATE_STAGE') ?? null);
	let dischargeRevalidationRequired = $derived(Boolean(real && dischargeStageIsAuthoritativeCurrent
		&& (real.event.status === 'REVALIDATION_REQUIRED' || realCurrentStage?.state === 'REVALIDATION_REQUIRED')));
	let startControlledDischargeDisabledReason = $derived(controlledDischargeStartDisabledReason());
	let canStartControlledDischarge = $derived(startControlledDischargeDisabledReason === null);
	let effectiveDischargeSamplingSeconds = $derived(Math.max(1, Math.ceil(configuredDischargeSamplingMinutes * 60 / (real ? prerequisiteDemoTimeScaleFactor() : 1))));
	let realDischargeSamples = $derived(real && controlledDischargeProcess ? real.samples
		.filter((sample) => sample.calibrationProcessId === controlledDischargeProcess?.calibrationProcessId
			&& sample.processAttemptNumber === controlledDischargeProcess?.attemptNumber)
		.sort((left, right) => left.sampleId - right.sampleId) : []);
	let latestDischargeSample = $derived(realDischargeSamples.at(-1) ?? null);
	// Live telemetry is a readiness preview only. Once the persisted process has
	// started, every official discharge metric and chart point must come from the
	// event/process/attempt-linked calibration samples below.
	let showLiveDischargePreview = $derived(Boolean(real && controlledDischargeProcess?.state === 'NOT_STARTED'
		&& latestDischargeSample === null));
	let liveDischargeStringVoltage = $derived(showLiveDischargePreview ? finiteNumber(real?.telemetry?.summary.stringVoltage) : null);
	let liveDischargeCurrent = $derived(showLiveDischargePreview ? finiteNumber(real?.telemetry?.summary.stringCurrent) : null);
	let liveDischargeLowestCellVoltage = $derived(showLiveDischargePreview ? lowestLiveCellVoltage() : null);
	let displayedDischargeStringVoltage = $derived(latestDischargeSample?.stringVoltageV ?? liveDischargeStringVoltage);
	let displayedDischargeCurrent = $derived(latestDischargeSample?.domainCurrentA ?? liveDischargeCurrent);
	let displayedDischargeLowestCellVoltage = $derived(latestDischargeSample ? lowestPersistedCellVoltage() : liveDischargeLowestCellVoltage);
	let cutoffDischargeSample = $derived(realDischargeSamples.filter((sample) => sample.persistenceReason === 'CUTOFF'
		&& sample.quality === 'VALID').at(-1) ?? null);
	let realDischargeTrend = $derived(realDischargeSamples.map((sample) => ({
		label: sample.measurementTime ? new Date(sample.measurementTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : `#${sample.snapshotSequence}`,
		voltageV: sample.averageVoltageV ?? (sample.cells.length ? sample.cells.reduce((sum, cell) => sum + (cell.voltageV ?? 0), 0) / sample.cells.length : 0),
		usedAh: sample.rawUsedAh ?? 0
	})));
	let dischargeRecommendation = $derived(typeof controlledDischargeProcess?.properties?.recommendation === 'string'
		? controlledDischargeProcess.properties.recommendation : null);
	let dischargeBlockers = $derived(Array.isArray(controlledDischargeProcess?.properties?.blockers)
		? controlledDischargeProcess.properties.blockers.filter((value): value is string => typeof value === 'string') : []);
	let dischargeProgress = $derived(real ? initialBaselineProcess(real, 'CONTROLLED_DISCHARGE')?.state === 'COMPLETED' ? 100 : initialBaselineProcess(real, 'CONTROLLED_DISCHARGE')?.state === 'ACTIVE' ? 50 : 0 : dischargeStartedAt == null ? 0 : Math.min(100, Math.floor((now - dischargeStartedAt) / 120)));
	let dischargeComplete = $derived(dischargeProgress >= 100);
	let demoDischargedCapacity = $derived(((batteryString?.ratedCapacity ?? 200) * .984 * dischargeProgress / 100).toFixed(1));
	let recoveryProgress = $derived(real ? initialBaselineProcess(real, 'RECOVERY_CHARGE_TO_VBOOST')?.state === 'COMPLETED' ? 100 : initialBaselineProcess(real, 'RECOVERY_CHARGE_TO_VBOOST')?.state === 'ACTIVE' ? 50 : 0 : recoveryStartedAt == null ? 0 : Math.min(100, Math.floor((now - recoveryStartedAt) / 120)));
	let recoveryChargeComplete = $derived(real ? initialBaselineProcess(real, 'RECOVERY_CHARGE_TO_VBOOST')?.state === 'COMPLETED' : recoveryProgress >= 100);
	let recoveryFloatProgress = $derived(recoveryFloatStartedAt == null ? 0 : Math.min(100, Math.floor((now - recoveryFloatStartedAt) / 60)));
	let recoveryFloatReached = $derived(real ? initialBaselineProcess(real, 'RECOVERY_FLOAT_STABILIZATION')?.state === 'COMPLETED' : recoveryFloatProgress >= 100);
	let recoveryFloatElapsedSeconds = $derived(real ? Math.max(0, Math.floor((processCheckpointNumber('RECOVERY_FLOAT_STABILIZATION', 'stableDurationMillis') ?? 0) / 1000)) : recoveryFloatStableStartedAt == null ? 0 : Math.min(RECOVERY_FLOAT_STABLE_DURATION_SECONDS, Math.max(0, Math.floor((now - recoveryFloatStableStartedAt) / 1000))));
	let recoveryFloatStableProgress = $derived(Math.floor(recoveryFloatElapsedSeconds * 100 / RECOVERY_FLOAT_STABLE_DURATION_SECONDS));
	let recoveryFloatComplete = $derived(real ? initialBaselineProcess(real, 'RECOVERY_FLOAT_STABILIZATION')?.state === 'COMPLETED' : recoveryFloatElapsedSeconds >= RECOVERY_FLOAT_STABLE_DURATION_SECONDS);
	let recoveryStartVoltage = $derived(dischargeCutoff * cellCount);
	let recoveryBoostVoltage = $derived(real ? processMeasurementNumber('RECOVERY_CHARGE_TO_VBOOST', 'stringVoltageV') : recoveryStartVoltage + ((boostVoltage - recoveryStartVoltage) * recoveryProgress / 100));
	let recoveryFloatVoltage = $derived(real ? processMeasurementNumber('RECOVERY_FLOAT_STABILIZATION', 'stringVoltageV') : boostVoltage - ((boostVoltage - floatVoltage) * recoveryFloatProgress / 100));
	let recoveryFloatCurrentA = $derived(real ? processMeasurementNumber('RECOVERY_FLOAT_STABILIZATION', 'domainCurrentA') : recoveryFloatComplete
		? ((ticket.floatCurrentMinA ?? 0.1) + (ticket.floatCurrentMaxA ?? 0.2)) / 2
		: ticket.floatCurrentMaxA ?? 0.2);
	let initialSoh = $derived(Math.min(100, (Number(dischargedCapacity || 0) / (batteryString?.ratedCapacity ?? 200)) * 100));
	let initialBoostProcess = $derived(real ? initialBaselineProcess(real, 'BOOST_CHARGE_TO_VBOOST') : null);
	let initialFloatProcess = $derived(real ? initialBaselineProcess(real, 'FLOAT_SETTLEMENT_TO_VFLOAT') : null);
	let initialBoostRuntimeStatus = $derived(processRuntimeStatus(initialBoostProcess));
	let initialFloatRuntimeStatus = $derived(processRuntimeStatus(initialFloatProcess));
	let realBoostVoltage = $derived(real ? initialStageTwoMeasurement('BOOST_CHARGE_TO_VBOOST', 'stringVoltageV') : null);
	let realBoostCurrentA = $derived(real ? initialStageTwoMeasurement('BOOST_CHARGE_TO_VBOOST', 'domainCurrentA') : null);
	let realFloatVoltage = $derived(real ? initialStageTwoMeasurement('FLOAT_SETTLEMENT_TO_VFLOAT', 'stringVoltageV') : null);
	let realFloatCurrentA = $derived(real ? initialStageTwoMeasurement('FLOAT_SETTLEMENT_TO_VFLOAT', 'domainCurrentA') : null);
	let initialFloatStableDurationMinutes = $derived(realProcessPolicyNumber('floatStableDurationMinutes', real?.event.configuration.floatStableDurationMinutes ?? 60) ?? ticket.floatStableDurationMinutes ?? 60);
	let initialFloatVoltageToleranceV = $derived(realProcessPolicyNumber('floatVoltageToleranceV', real?.event.configuration.floatVoltageToleranceV ?? 1) ?? ticket.floatVoltageToleranceV ?? 1);
	let initialFloatCurrentMinA = $derived(realProcessPolicyNumber('floatCurrentMinA', real?.event.configuration.floatCurrentMinA ?? 0.1) ?? ticket.floatCurrentMinA ?? 0.1);
	let initialFloatCurrentMaxA = $derived(realProcessPolicyNumber('floatCurrentMaxA', real?.event.configuration.floatCurrentMaxA ?? 0.2) ?? ticket.floatCurrentMaxA ?? 0.2);
	let effectiveBoostTargetVoltage = $derived(real ? effectiveBoostTargetVoltageV() : boostVoltage);
	let effectiveFloatTargetVoltage = $derived(real ? effectiveFloatTargetVoltageV() : floatVoltage);
	let boostProcessedTemperature = $derived(processTemperature('BOOST_CHARGE_TO_VBOOST'));
	let floatProcessedTemperature = $derived(processTemperature('FLOAT_SETTLEMENT_TO_VFLOAT'));
	let realBoostBarWidth = $derived(processBarWidth(realBoostVoltage, effectiveBoostTargetVoltage));
	let realFloatBarWidth = $derived(processBarWidth(realFloatVoltage, effectiveFloatTargetVoltage));
	let boostProgress = $derived(ticket.boostStartedAt == null ? 0 : Math.min(100, Math.floor((now - ticket.boostStartedAt) / 120)));
	let boostReached = $derived(real ? initialBoostProcess?.state === 'COMPLETED' : boostProgress >= 100);
	let boostConfirmed = $derived(ticket.boostConfirmed);
	let floatSettlingProgress = $derived(ticket.boostConfirmedAt == null ? 0 : Math.min(100, Math.floor((now - ticket.boostConfirmedAt) / 60)));
	let floatSettled = $derived(real ? initialFloatProcess?.state === 'COMPLETED' : floatSettlingProgress >= 100);
	let floatStableDurationMinutes = $derived(initialFloatStableDurationMinutes);
	let initialFloatStableElapsedSeconds = $derived(real ? Math.max(0, Math.floor((processCheckpointNumber('FLOAT_SETTLEMENT_TO_VFLOAT', 'stableDurationMillis') ?? 0) / 1000)) : 0);
	let floatStableProgress = $derived(real ? initialFloatProcess?.state === 'COMPLETED' ? 100 : Math.min(100, Math.floor(initialFloatStableElapsedSeconds * 100 / Math.max(1, floatStableDurationMinutes * 60))) : ticket.floatStableStartedAt == null ? 0 : Math.min(100, Math.floor((now - ticket.floatStableStartedAt) / Math.max(1, floatStableDurationMinutes * DEMO_STABLE_PERCENT_MS_PER_CONFIGURED_MINUTE))));
	let floatStableElapsedMinutes = $derived(Math.min(floatStableDurationMinutes, Math.floor(floatStableProgress * floatStableDurationMinutes / 100)));
	let floatReached = $derived(floatStableProgress >= 100);
	let floatConfirmed = $derived(ticket.floatConfirmed);
	let initialSettingsVerified = $derived(ticket.initialSettingsVerified);
	let floatStableSettingsError = $derived(validateFloatStableSettings());
	let initialFloatStage = $derived(real && initialFloatProcess ? real.event.stages.find((stage) => stage.calibrationStageId === initialFloatProcess.calibrationStageId) ?? null : null);
	let initialFloatStableWarning = $derived(floatStableWarning());
	let realDemoTimeScaleFactor = $derived(real ? prerequisiteDemoTimeScaleFactor() : 1);
	let canConfigureRealDemoTimeScale = $derived(canConfigureDemoTimeScale());
	let canConfigureRealFloatStablePolicy = $derived(canConfigureFloatStablePolicy());
	let realFloatStablePolicyDirty = $derived(real && (Number(floatStableDurationInput) !== initialFloatStableDurationMinutes
		|| Number(floatVoltageToleranceInput) !== initialFloatVoltageToleranceV
		|| Number(floatCurrentMinInput) !== initialFloatCurrentMinA || Number(floatCurrentMaxInput) !== initialFloatCurrentMaxA));
	let footerAction = $state<CalibrationAllowedAction | null>(null);
	let footerActionReason = $state('');
	let footerAcknowledgedItems = $state<string[]>([]);
	let redoConfirmation = $state(false);
	let redoReason = $state('');
	let realCooldownTemperature = $derived(real ? initialBaselineCooldownTemperature(real) : null);
	let ambientTemperature = $derived(real ? realCooldownTemperature?.ambientTemperatureC ?? null : 25.5);
	let cooldownThresholdInput = $state(ticket.cooldownAllowedTemperatureDelta?.toString() ?? '0.3');
	let allowedTemperatureDelta = $derived(Number(cooldownThresholdInput) || 0.3);
	let cooldownManualApproved = $state(false);
	let cooldownExceptionAccepted = $state(false);
	let cooldownManualReason = $state('');
	let cooldownDurationInput = $state(ticket.cooldownDurationMinutes?.toString() ?? '30');
	let demoStringVoltage = $derived(floatVoltage + ((boostVoltage - floatVoltage) * boostProgress / 100));
	let displayedBoostVoltage = $derived(real ? realBoostVoltage : demoStringVoltage);
	let demoFloatVoltage = $derived(boostVoltage - ((boostVoltage - floatVoltage) * floatSettlingProgress / 100));
	let displayedFloatVoltage = $derived(real ? realFloatVoltage : demoFloatVoltage);
	let demoFloatCurrent = $derived(floatReached
		? ((ticket.floatCurrentMinA ?? 0.1) + (ticket.floatCurrentMaxA ?? 0.2)) / 2
		: ticket.floatCurrentMaxA ?? 0.2);
	let displayedFloatCurrentA = $derived(real ? realFloatCurrentA : demoFloatCurrent);
	let realVocSample = $derived(real ? finalProcessSample(real, 'VOC_BASELINE_CAPTURE') : null);
	let realFloatSample = $derived(real ? finalProcessSample(real, 'RECOVERY_FLOAT_STABILIZATION') : null);
	let recoveryCellResistances = $derived(real ? (realFloatSample?.cells ?? []).map((cell) => ({ cellId: cell.cellIndex, resistanceMohm: cell.resistanceUohm == null ? null : cell.resistanceUohm / 1000, quality: cell.quality, availabilityWarning: cell.availabilityWarning })) : ticket.recoveryCellResistances ?? []);
	let vocCells = $derived(real ? (realVocSample?.cells ?? []).map((cell) => ({ id: cell.cellIndex, voltage: cell.voltageV, quality: cell.quality, availabilityWarning: cell.availabilityWarning })) : (ticket.vocSnapshot?.cells ?? []).map((cell) => ({ id: cell.cellId, voltage: cell.voltageV, quality: 'VALID' })));
	let validRecoveryResistances = $derived(recoveryCellResistances.map((cell) => cell.resistanceMohm).filter((value): value is number => value !== null && Number.isFinite(value)));
	let internalResistance = $derived(validRecoveryResistances.length
		? (validRecoveryResistances.reduce((total, value) => total + value, 0) / validRecoveryResistances.length).toFixed(2)
		: '—');
	let demoCooldownProgress = $derived(ticket.cooldownStartedAt == null ? 0 : Math.min(100, Math.floor((now - ticket.cooldownStartedAt) / 120)));
	let cooldownElapsedSeconds = $derived(ticket.cooldownStartedAt == null ? 0 : Math.min(12, Math.floor((now - ticket.cooldownStartedAt) / 1000)));
	// The demo deliberately settles at 0.4 °C above ambient, so the operator can
	// review and approve the out-of-range path. Real values will come from the BMS.
	let farthestCellTemperature = $derived(real ? realCooldownTemperature?.farthestCellTemperatureC ?? null : 26.5 - (0.6 * demoCooldownProgress / 100));
	let cooldownTemperatureDelta = $derived(real ? realCooldownTemperature?.deltaC ?? null : farthestCellTemperature === null || ambientTemperature === null ? null : Math.abs(farthestCellTemperature - ambientTemperature));
	let cooldownTemperatureConditionMet = $derived(cooldownTemperatureDelta !== null
		&& Number.isFinite(cooldownTemperatureDelta)
		&& cooldownTemperatureDelta <= allowedTemperatureDelta + 0.000001);
	// A real cool-down bar is a condition indicator, not a timer or estimated
	// trajectory. It is complete only when the live snapshot is within the
	// configured allowance; backend state alone still completes the process.
	let cooldownProgress = $derived(real
		? cooldownTemperatureConditionMet ? 100 : 0
		: demoCooldownProgress);
	let cooldownMonitoringComplete = $derived(real
		? initialBaselineProcess(real, 'COOL_DOWN_TO_AMBIENT')?.state === 'COMPLETED'
		: cooldownProgress === 100);
	let cooldownTemperaturePassed = $derived(real ? initialBaselineProcess(real, 'COOL_DOWN_TO_AMBIENT')?.state === 'COMPLETED' : cooldownTemperatureDelta !== null && cooldownTemperatureDelta <= allowedTemperatureDelta + 0.000001);
	let cooldownStatusReady = $derived(real ? cooldownTemperatureConditionMet : cooldownTemperaturePassed || cooldownManualApproved);
	let readOnly = $derived(real ? real.event.closedAt !== null : ticket.status === 'COMPLETED');
	let summaryValues = $derived(ticket.summary ?? { stringVoltage: floatVoltage.toFixed(1), midpointVoltage, dischargedCapacity, initialSoh: initialSoh.toFixed(1), lowestCellVoltage, stopReason: dischargeStopReason, floatCurrent, internalResistance, ambientTemperature: temperatureText(ambientTemperature), temperatureDelta: temperatureText(cooldownTemperatureDelta), allowedTemperatureDelta: allowedTemperatureDelta.toFixed(1), rippleNoLoad, rippleWithLoad });
	let cooldownReady = $derived(!!checkedItems['2-0'] && (cooldownTemperaturePassed || cooldownManualApproved) && !!checkedItems['2-1'] && !!checkedItems['2-2']);
	let recoveryReviewComplete = $derived(real ? ['RECOVERY_FLOAT_STABILITY_REVIEWED', 'CELL_RESISTANCE_SAMPLE_REVIEWED',
		'CHARGER_OUTPUT_CURRENT', 'MIDPOINT_VOLTAGE', 'RIPPLE_BEFORE_LOAD'].every((type) => hasInitialBaselineEvidence(real, type)) : false);
	let recoveryReviewAwaitingContinue = $derived(real ? real.event.stages.some((stage) => stage.calibrationStageId === real.event.currentStageId
		&& stage.type === 'POST_RECHARGE_FLOAT') && recoveryReviewComplete : false);
	let stageFiveModel = $derived<InitialBaselineStageFiveModel>({
		mode: real ? 'real' : 'demo', readOnly, busy: (real?.busy ?? false) || recoveryReviewAwaitingContinue, cellCount, boostVoltagePerCell, floatVoltagePerCell,
		boostVoltage, floatVoltage, currentLimit, recoveryMcbClosed, recoverySettingsVerified,
		recoveryStarted: recoveryStartedAt !== null, recoveryChargeComplete, recoveryProgress,
		recoveryBoostVoltage,
		recoveryFloatStarted: recoveryFloatStartedAt !== null, recoveryFloatReached,
		recoveryFloatProgress, recoveryFloatVoltage, recoveryFloatCurrentA, recoveryFloatStableProgress,
		recoveryFloatElapsedSeconds, recoveryFloatStableSeconds: RECOVERY_FLOAT_STABLE_DURATION_SECONDS,
		recoveryFloatComplete, recoveryFloatConfirmed,
		resistanceCells: recoveryCellResistances, resistanceConfirmed: resistanceMeasured,
		averageResistanceMohm: internalResistance, floatCurrent, floatCurrentConfirmed: floatCurrentMeasured,
		midpointVoltage, midpointConfirmed: midpointMeasured, rippleNoLoad, rippleNoLoadConfirmed: rippleNoLoadMeasured,
		loadConnected: loadMcbClosed, rippleWithLoad, rippleWithLoadConfirmed: rippleWithLoadMeasured,
		chargerMcbOpen: chargerOpenedForLoad, vocLoading: real ? false : chargerOpenedForLoad && !ticket.vocSnapshot,
		vocError: '', vocSampleId: realVocSample?.sampleId ?? ticket.vocSnapshot?.capturedAt ?? null,
		vocCapturedAt: realVocSample?.measurementTime ?? (ticket.vocSnapshot ? new Date(ticket.vocSnapshot.capturedAt).toLocaleString() : null),
		vocStringVoltage: realVocSample?.stringVoltageV ?? ticket.vocSnapshot?.stringVoltageV ?? null, vocCells,
		vocConfirmed: recoveryBaselineAccepted
	});
	const stageFiveActions: InitialBaselineStageFiveActions = {
		setRecoveryMcbClosed(checked) {
			if (real) { if (checked) real.onEvidence('RECOVERY_CHARGER_MCB_CLOSED_CONFIRMED'); return; }
			recoveryMcbClosed = checked;
			updateTicket({ recoveryMcbClosed: checked });
		},
		setRecoverySettingsVerified(checked) {
			if (real) { if (checked) real.onEvidence('RECOVERY_CHARGE_SETPOINTS_REVIEWED'); return; }
			recoverySettingsVerified = checked;
			updateTicket({ recoverySettingsVerified: checked });
		},
		startRecovery() { if (real) real.onStartProcess('RECOVERY_CHARGE_TO_VBOOST'); else startRecoveryCharge(); },
		setRecoveryFloatConfirmed(checked) {
			if (real) { if (checked) real.onEvidence('RECOVERY_FLOAT_STABILITY_REVIEWED'); return; }
			recoveryFloatConfirmed = checked;
			updateTicket({ recoveryFloatConfirmed: checked });
		},
		setResistanceConfirmed(checked) {
			if (real) { if (checked && realFloatSample) real.onEvidence('CELL_RESISTANCE_SAMPLE_REVIEWED', undefined, undefined, realFloatSample.sampleId); return; }
			resistanceMeasured = checked;
			updateTicket({ resistanceMeasured: checked });
		},
		setFloatCurrent(value) { if (!real) { floatCurrent = value; updateTicket({ floatCurrent: value }); } },
		setFloatCurrentConfirmed(checked) { if (real) { if (checked && realFloatSample?.domainCurrentA != null) real.onEvidence('CHARGER_OUTPUT_CURRENT', Math.abs(realFloatSample.domainCurrentA), 'A', realFloatSample.sampleId); } else { floatCurrentMeasured = checked; updateTicket({ floatCurrentMeasured: checked }); } },
		setMidpointVoltage(value) { if (!real) { midpointVoltage = value; updateTicket({ midpointVoltage: value }); } },
		setMidpointConfirmed(checked) { if (real) { if (checked && realFloatSample?.midpointVoltageV != null) real.onEvidence('MIDPOINT_VOLTAGE', realFloatSample.midpointVoltageV, 'V', realFloatSample.sampleId); } else { midpointMeasured = checked; updateTicket({ midpointMeasured: checked }); } },
		setRippleNoLoad(value) { rippleNoLoad = value; if (!real) updateTicket({ rippleNoLoad: value }); },
		setRippleNoLoadConfirmed(checked) { if (real) { const value = Number(rippleNoLoad); if (checked && Number.isFinite(value) && value >= 0) real.onEvidence('RIPPLE_BEFORE_LOAD', value, 'V'); } else { rippleNoLoadMeasured = checked; updateTicket({ rippleNoLoadMeasured: checked }); } },
		setLoadConnected(checked) { if (real) { if (checked) real.onEvidence('LOAD_CONNECTED_CONFIRMATION'); } else { loadMcbClosed = checked; updateTicket({ loadConnectedForRipple: checked }); } },
		setRippleWithLoad(value) { rippleWithLoad = value; updateTicket({ rippleWithLoad: value }); },
		setRippleWithLoadConfirmed(checked) { if (real) { if (checked) real.onEvidence('RIPPLE_AFTER_LOAD', Number(rippleWithLoad), 'V'); } else { rippleWithLoadMeasured = checked; updateTicket({ rippleWithLoadMeasured: checked }); } },
		setChargerMcbOpen: confirmChargerOpenedForVoc,
		setVocConfirmed(checked) {
			if (real) { if (checked && realVocSample) real.onEvidence('VOC_BASELINE_CONFIRMATION', undefined, undefined, realVocSample.sampleId); return; }
			recoveryBaselineAccepted = checked;
			updateTicket({ vocBaselineConfirmed: checked });
		}
	};
	let stepReady = $derived(real ? real.event.allowedActions.some((action) => action.actionCode === 'COMPLETE_STAGE' && action.enabled) : selectedIndex === 1
		? initialSettingsVerified && boostReached && boostConfirmed && floatReached && floatConfirmed
		: selectedIndex === 2 ? cooldownReady
		: selectedIndex === 3 ? dischargeLoadConnected && dischargeScheduled && dischargeComplete && dischargeResultRecorded
		: selectedIndex === 4 ? recoveryMcbClosed && recoverySettingsVerified && recoveryChargeComplete && recoveryFloatComplete && recoveryFloatConfirmed && floatCurrentMeasured && midpointMeasured && rippleNoLoadMeasured && loadMcbClosed && rippleWithLoadMeasured && chargerOpenedForLoad && !!ticket.vocSnapshot && resistanceMeasured && recoveryBaselineAccepted
		: selectedIndex === 5 ? summaryApproved
		: selected.checklist.every((_, index) => checkedItems[`${selectedIndex}-${index}`]));

	function toggleItem(index: number, checked: boolean) {
		if (real) {
			const evidence = ([
				['BATTERY_CHARGER_CONNECTIONS_CHECKED', 'LOAD_MCB_OPEN_CONFIRMED', 'SAFETY_VISUAL_INSPECTION_CONFIRMED', 'OPEN_CIRCUIT_VOLTAGE_REVIEWED'],
				[], ['CHARGER_MCB_OPEN_FOR_COOLDOWN', 'AMBIENT_TEMPERATURE_REVIEWED', 'COOLDOWN_SAFETY_VALVES_REVIEWED'],
				['TEST_LOAD_CONNECTED', 'DISCHARGE_CUTOFF_REVIEWED'], [],
				['BASELINE_SUMMARY_REVIEWED']
			] as const)[selectedIndex]?.[index];
			if (checked && evidence) real.onEvidence(evidence);
			return;
		}
		checkedItems = { ...checkedItems, [`${selectedIndex}-${index}`]: checked };
	}

	function isChecklistItemVisible(index: number) {
		return index === 0 || selected.checklist.slice(0, index).every((_, previousIndex) => checkedItems[`${selectedIndex}-${previousIndex}`]);
	}

	function processMeasurementNumber(type: string, key: string) {
		if (!real) return null;
		const latest = initialBaselineProcess(real, type)?.properties?.latestMeasurement;
		if (!latest || typeof latest !== 'object' || Array.isArray(latest)) return null;
		const value = (latest as Record<string, unknown>)[key];
		return typeof value === 'number' && Number.isFinite(value) ? value : null;
	}

	function processCheckpointNumber(type: string, key: string) {
		if (!real) return null;
		const checkpoint = initialBaselineProcess(real, type)?.properties?.checkpoint;
		if (!checkpoint || typeof checkpoint !== 'object' || Array.isArray(checkpoint)) return null;
		const value = (checkpoint as Record<string, unknown>)[key];
		return typeof value === 'number' && Number.isFinite(value) ? value : null;
	}

	function processCheckpointNestedNumber(type: string, parent: string, key: string) {
		if (!real) return null;
		const checkpoint = initialBaselineProcess(real, type)?.properties?.checkpoint;
		if (!checkpoint || typeof checkpoint !== 'object' || Array.isArray(checkpoint)) return null;
		const nested = (checkpoint as Record<string, unknown>)[parent];
		if (!nested || typeof nested !== 'object' || Array.isArray(nested)) return null;
		const value = (nested as Record<string, unknown>)[key];
		return typeof value === 'number' && Number.isFinite(value) ? value : null;
	}

	function processRuntimeStatus(process: CalibrationProcess | null) {
		if (!real || !process || (process.state !== 'ACTIVE' && process.state !== 'BLOCKED')) return null;
		const properties = process.properties ?? {};
		const blockers = Array.isArray(properties.blockers)
			? properties.blockers.filter((value): value is string => typeof value === 'string' && value.length > 0)
			: [];
		const recommendation = typeof properties.recommendation === 'string'
			? properties.recommendation
			: null;
		return blockers.length || recommendation ? { blockers, recommendation } : null;
	}

	function finiteNumber(value: number | null | undefined) {
		return typeof value === 'number' && Number.isFinite(value) ? value : null;
	}

	function lowestLiveCellVoltage() {
		if (!real) return null;
		const summaryMinimum = finiteNumber(real.telemetry?.summary.minVoltage);
		if (summaryMinimum !== null) return summaryMinimum;
		const values = real.telemetry?.cells.map((cell) => finiteNumber(cell.voltage))
			.filter((value): value is number => value !== null) ?? [];
		return values.length ? Math.min(...values) : null;
	}

	function lowestPersistedCellVoltage() {
		const values = latestDischargeSample?.cells.map((cell) => finiteNumber(cell.voltageV))
			.filter((value): value is number => value !== null) ?? [];
		return values.length ? Math.min(...values) : null;
	}

	function controlledDischargeStartDisabledReason() {
		if (!real) return 'A real calibration event is required.';
		if (real.busy) return 'Wait for the current backend request to finish.';
		if (!dischargeLoadConnected) return 'Confirm the standard load connection and wait for persisted evidence readback.';
		if (!dischargeSamplingValid) return 'Enter a whole sampling interval from 1 to 1440 calibration minutes.';
		if (dischargeSamplingDirty) return 'Save the changed sampling interval before starting discharge.';
		if (!controlledDischargeProcess) return 'Backend did not create CONTROLLED_DISCHARGE for this event.';
		if (controlledDischargeProcess.state !== 'NOT_STARTED') return `CONTROLLED_DISCHARGE is ${controlledDischargeProcess.state}.`;
		if (!dischargeStageIsAuthoritativeCurrent) return 'Return to the active discharge stage before starting the process.';
		if (dischargeRevalidationRequired) {
			return 'OpenEMS restarted while this physical stage was active. Revalidate the charger, load and battery topology before starting discharge.';
		}
		if (displayedDischargePhase === 'DISCHARGE') return null;
		if (displayedDischargePhase !== 'WAITING_FOR_LOAD') return 'The active backend stage is not ready to start discharge.';
		if (!waitingForLoadCompleteAction) return 'Backend did not return COMPLETE_STAGE for WAITING_FOR_LOAD.';
		if (!waitingForLoadCompleteAction.enabled) {
			return waitingForLoadCompleteAction.disabledReason ?? 'Backend has disabled completion of WAITING_FOR_LOAD.';
		}
		return null;
	}

	function processBlockerMessage(blocker: string) {
		switch (blocker) {
			case 'PHASE_CURRENT_INCONSISTENT':
				return 'The measured current direction is inconsistent with the active charging phase. Check the charger state and BMS current sign, then wait for a consistent snapshot.';
			case 'TARGET_NOT_REACHED':
				return 'The temperature-compensated voltage target has not been reached yet.';
			case 'SNAPSHOT_STALE':
				return 'The backend snapshot is stale. Check BMS communication and wait for a fresh snapshot.';
			default:
				return blocker.replaceAll('_', ' ').toLowerCase();
		}
	}

	function configurationNumber(key: string, fallback: number) {
		if (!real) return fallback;
		const value = real.event.configuration[key];
		return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
	}

	function realProcessPolicyNumber(key: string, fallback: number) {
		if (!real) return null;
		const value = initialFloatProcess?.properties?.[key];
		return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
	}

	function dischargeProcessPropertyNumber(key: string, fallback: number) {
		const value = controlledDischargeProcess?.properties?.[key];
		return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
	}

	function dischargeStageForView(currentStage: CalibrationStage | null, stages: CalibrationStage[]) {
		const stageTypes = new Set(['WAITING_FOR_LOAD', 'DISCHARGE', 'LOAD_DISCONNECT']);
		if (currentStage && stageTypes.has(currentStage.type)) return currentStage;

		// Stage 4 is one logical UI step backed by three persisted stages. When an
		// operator reviews it after the workflow has advanced, retain the latest
		// reached sub-stage instead of branching on the event's unrelated current
		// stage and rendering an empty panel.
		return stages.filter((stage) => stageTypes.has(stage.type) && stage.state !== 'NOT_STARTED')
			.sort((left, right) => right.order - left.order)[0]
			?? stages.find((stage) => stage.type === 'WAITING_FOR_LOAD')
			?? null;
	}

	function processTemperature(type: 'BOOST_CHARGE_TO_VBOOST' | 'FLOAT_SETTLEMENT_TO_VFLOAT') {
		if (!real) return null;
		const process = initialBaselineProcess(real, type);
		const completedSample = process?.state === 'COMPLETED' ? finalProcessSample(real, type) : null;
		const sampleTemperature = completedSample?.averageCellTemperatureC;
		if (typeof sampleTemperature === 'number' && Number.isFinite(sampleTemperature)) return sampleTemperature;
		const checkpointTemperature = processCheckpointNestedNumber(type, 'targets', 'averageCellTemperatureC');
		if (checkpointTemperature !== null) return checkpointTemperature;
		const liveTemperature = real.telemetry?.summary.avgTemperature;
		return typeof liveTemperature === 'number' && Number.isFinite(liveTemperature) ? liveTemperature : null;
	}

	function processBarWidth(actual: number | null, target: number) {
		if (actual === null || !Number.isFinite(actual) || !Number.isFinite(target) || target <= 0) return 0;
		return Math.max(0, Math.min(100, actual * 100 / target));
	}

	function effectiveBoostTargetVoltageV() {
		const workerTarget = processCheckpointNestedNumber('BOOST_CHARGE_TO_VBOOST', 'targets', 'boostStringVoltageV');
		if (workerTarget !== null) return workerTarget;
		const averageTemperature = real?.telemetry?.summary.avgTemperature;
		if (averageTemperature === null || averageTemperature === undefined || !Number.isFinite(averageTemperature)) return boostVoltage;
		const coefficientMvPerCellC = configurationNumber('boostTemperatureCoefficientMvPerCellC', -5);
		return (boostVoltagePerCell + coefficientMvPerCellC / 1000 * (averageTemperature - 25)) * cellCount;
	}

	function effectiveFloatTargetVoltageV() {
		const workerTarget = processCheckpointNestedNumber('FLOAT_SETTLEMENT_TO_VFLOAT', 'targets', 'floatStringVoltageV');
		if (workerTarget !== null) return workerTarget;
		const averageTemperature = real?.telemetry?.summary.avgTemperature;
		if (averageTemperature === null || averageTemperature === undefined || !Number.isFinite(averageTemperature)) return floatVoltage;
		const coefficientMvPerCellC = configurationNumber('floatTemperatureCoefficientMvPerCellC', -3.3);
		return (floatVoltagePerCell + coefficientMvPerCellC / 1000 * (averageTemperature - 25)) * cellCount;
	}

	function prerequisiteDemoTimeScaleFactor(): 1 | 60 {
		if (!real) return 1;
		const prerequisites = real.event.stages.find((stage) => stage.type === 'PREREQUISITES');
		const value = prerequisites?.properties?.demoTimeScaleFactor;
		return value === 60 ? 60 : 1;
	}

	function canConfigureDemoTimeScale() {
		if (!real) return false;
		return real.event.currentStageId === real.event.stages
			.find((stage) => stage.type === 'PREREQUISITES')?.calibrationStageId && !real.busy;
	}

	function canConfigureFloatStablePolicy() {
		if (!real || real.busy || real.event.currentStageId !== initialBoostProcess?.calibrationStageId) return false;
		return initialBoostProcess?.state === 'NOT_STARTED' && initialFloatProcess?.state === 'NOT_STARTED';
	}

	function initialStageTwoMeasurement(type: 'BOOST_CHARGE_TO_VBOOST' | 'FLOAT_SETTLEMENT_TO_VFLOAT', key: 'stringVoltageV' | 'domainCurrentA') {
		if (!real) return null;
		const process = initialBaselineProcess(real, type);
		const completedSample = process?.state === 'COMPLETED' ? finalProcessSample(real, type) : null;
		const sampleValue = completedSample?.[key];
		if (typeof sampleValue === 'number' && Number.isFinite(sampleValue)) return sampleValue;
		const liveValue = key === 'stringVoltageV'
			? real.telemetry?.summary.stringVoltage
			: real.telemetry?.summary.stringCurrent;
		if (typeof liveValue === 'number' && Number.isFinite(liveValue)) {
			return key === 'domainCurrentA' && real.event.configuration.currentDirection === 'NEGATIVE'
				? -liveValue
				: liveValue;
		}
		return processMeasurementNumber(type, key);
	}

	function voltageWithinTarget(actual: number | null, target: number, tolerance: number) {
		return actual !== null && Number.isFinite(actual) && Number.isFinite(target) && Number.isFinite(tolerance)
			&& Math.abs(actual - target) <= tolerance;
	}

	function floatStableWarning() {
		if (!real || initialFloatProcess?.state !== 'ACTIVE') return null;
		const voltageAvailable = displayedFloatVoltage !== null && Number.isFinite(displayedFloatVoltage);
		const currentAvailable = displayedFloatCurrentA !== null && Number.isFinite(displayedFloatCurrentA);
		const voltageInRange = voltageAvailable && voltageWithinTarget(displayedFloatVoltage, effectiveFloatTargetVoltage, initialFloatVoltageToleranceV);
		const currentMagnitude = currentAvailable ? Math.abs(displayedFloatCurrentA) : null;
		const currentInRange = currentMagnitude !== null && currentMagnitude >= initialFloatCurrentMinA && currentMagnitude <= initialFloatCurrentMaxA;
		if (voltageInRange && currentInRange) return null;
		const serverBlocker = initialFloatStage?.blockerCode ?? real.event.blockers.at(0) ?? null;
		return {
			serverBlocker,
			voltageAvailable,
			currentAvailable,
			voltageInRange,
			currentInRange,
			currentMagnitude
		};
	}

	function actionReady(action: CalibrationAllowedAction) {
		return action.enabled && (!action.requiresReason || footerActionReason.trim().length > 0)
			&& (!action.requiresAcknowledgement || action.acknowledgementItems.every((item) => footerAcknowledgedItems.includes(item)));
	}

	function requestFooterAction(action: CalibrationAllowedAction) {
		footerAction = action;
		footerActionReason = '';
		footerAcknowledgedItems = [];
	}

	function footerActionDescription(action: CalibrationAllowedAction) {
		return action.actionCode === 'REVALIDATE_STAGE'
			? 'OpenEMS restarted while this physical stage was active. Confirm that the charger, load and battery topology still matches this stage before monitoring resumes.'
			: 'This permanently aborts the persisted calibration event. The server will validate the latest event version and authorization.';
	}

	function confirmFooterAction() {
		if (!real || !footerAction || !actionReady(footerAction)) return;
		real.onExecuteAction(footerAction, footerActionReason, footerAcknowledgedItems);
		footerAction = null;
	}

	function voltageText(value: number | null) {
		return value === null || !Number.isFinite(value) ? '—' : value.toFixed(1);
	}

	function temperatureText(value: number | null) {
		return value === null || !Number.isFinite(value) ? '—' : value.toFixed(1);
	}

	function currentText(value: number | null) {
		return value === null || !Number.isFinite(value) ? '—' : Math.abs(value).toFixed(2);
	}

	function updateTicket(patch: Partial<InitialBaselineDemoTicket>) {
		if (real) return;
		onTicketChange({ ...ticket, ...patch, updatedAt: Date.now() });
	}

	function parsedFloatStableSettings() {
		return {
			durationMinutes: Number(floatStableDurationInput),
			voltageToleranceV: Number(floatVoltageToleranceInput),
			currentMinA: Number(floatCurrentMinInput),
			currentMaxA: Number(floatCurrentMaxInput)
		};
	}

	$effect(() => {
		if (!real || floatPolicyInputEventVersion === real.event.eventVersion) return;
		floatStableDurationInput = String(initialFloatStableDurationMinutes);
		floatVoltageToleranceInput = String(initialFloatVoltageToleranceV);
		floatCurrentMinInput = String(initialFloatCurrentMinA);
		floatCurrentMaxInput = String(initialFloatCurrentMaxA);
		floatPolicyInputEventVersion = real.event.eventVersion;
	});

	function validateFloatStableSettings() {
		const settings = parsedFloatStableSettings();
		if (![settings.durationMinutes, settings.voltageToleranceV, settings.currentMinA, settings.currentMaxA].every(Number.isFinite)) return 'Enter numeric Float-stable settings.';
		if (!Number.isInteger(settings.durationMinutes) || settings.durationMinutes <= 0) return 'Stable duration must be a positive whole number of minutes.';
		if (settings.voltageToleranceV <= 0) return 'Voltage tolerance must be positive.';
		if (settings.currentMinA < 0 || settings.currentMaxA < settings.currentMinA) return 'Float current range is invalid.';
		return '';
	}

	function verifyInitialChargeSettings(checked: boolean) {
		if (real) { if (checked && !floatStableSettingsError && !realFloatStablePolicyDirty) real.onEvidence('CHARGE_SETPOINTS_REVIEWED'); return; }
		if (!checked) {
			updateTicket({ initialSettingsVerified: false });
			return;
		}
		if (floatStableSettingsError) return;
		const settings = parsedFloatStableSettings();
		updateTicket({
			initialSettingsVerified: true,
			floatStableDurationMinutes: settings.durationMinutes,
			floatVoltageToleranceV: settings.voltageToleranceV,
			floatCurrentMinA: settings.currentMinA,
			floatCurrentMaxA: settings.currentMaxA
		});
	}

	function createRecoveryCellResistances(): InitialBaselineDemoCellResistance[] {
		return Array.from({ length: cellCount }, (_, index) => {
			const cellId = index + 1;
			return { cellId, resistanceMohm: Number((0.18 + ((cellId * 17 + ticket.stringIndex * 7) % 31) / 100).toFixed(2)) };
		});
	}

	function createVocSnapshot(capturedAt: number) {
		const cells = Array.from({ length: cellCount }, (_, index) => {
			const cellId = index + 1;
			return { cellId, voltageV: Number((2.17 + ((cellId * 13 + ticket.stringIndex * 5) % 17) / 1000).toFixed(3)) };
		});
		return {
			capturedAt,
			stringVoltageV: Number(cells.reduce((total, cell) => total + cell.voltageV, 0).toFixed(3)),
			cells
		};
	}

	function confirmChargerOpenedForVoc(checked: boolean) {
		if (real) { if (checked) real.onEvidence('CHARGER_MCB_OPEN_CONFIRMATION'); return; }
		chargerOpenedForLoad = checked;
		if (!checked) recoveryBaselineAccepted = false;
		updateTicket({
			chargerOpenedForVoc: checked,
			vocCaptureStartedAt: checked ? ticket.vocCaptureStartedAt ?? Date.now() : null,
			vocSnapshot: checked ? ticket.vocSnapshot : null,
			vocBaselineConfirmed: checked ? recoveryBaselineAccepted : false
		});
	}

	function startBoostCharge() {
		if (real) { real.onStartProcess('BOOST_CHARGE_TO_VBOOST'); return; }
		if (ticket.boostStartedAt || boostReached) return;
		updateTicket({ boostStartedAt: Date.now(), status: 'CHARGING', currentStep: 1 });
	}

	function confirmBoost(checked: boolean) {
		if (real) { if (checked) real.onEvidence('BOOST_TARGET_REVIEWED'); return; }
		updateTicket({ boostConfirmed: checked });
	}

	function confirmFloat(checked: boolean) {
		if (real) { if (checked) real.onEvidence('FLOAT_MODE_REVIEWED'); return; }
		updateTicket({ floatConfirmed: checked });
	}

	function confirmDischargeLoad(checked: boolean) {
		if (real) { if (checked) real.onEvidence('TEST_LOAD_CONNECTED'); return; }
		dischargeLoadConnected = checked;
	}

	function confirmDischargeResult(checked: boolean) {
		if (real) { if (checked && cutoffDischargeSample) real.onEvidence('DISCHARGE_CUTOFF_REVIEWED', undefined, undefined, cutoffDischargeSample.sampleId); return; }
		dischargeResultRecorded = checked;
	}

	function confirmDischargeLoadDisconnected(checked: boolean) {
		if (real) { if (checked) real.onEvidence('TEST_LOAD_DISCONNECTED'); return; }
	}

	function confirmSummary(checked: boolean) {
		if (real) { if (checked) real.onEvidence('BASELINE_SUMMARY_REVIEWED'); return; }
		summaryApproved = checked;
	}

	function confirmChargerIsolated(checked: boolean) {
		if (real) { if (checked) real.onEvidence('CHARGER_MCB_OPEN_FOR_COOLDOWN'); return; }
		toggleItem(0, checked);
		if (!checked) {
			checkedItems = { ...checkedItems, '2-1': false, '2-2': false };
			cooldownManualApproved = false;
			cooldownExceptionAccepted = false;
			cooldownManualReason = '';
			updateTicket({ cooldownStartedAt: null, cooldownDurationMinutes: null, cooldownAllowedTemperatureDelta: null, status: 'IN_PROGRESS', currentStep: 2 });
		}
	}

	function startCooldownMonitoring() {
		if (real) { real.onStartProcess('COOL_DOWN_TO_AMBIENT'); return; }
		const duration = Number(cooldownDurationInput);
		const threshold = Number(cooldownThresholdInput);
		if (!Number.isInteger(duration) || duration < 1 || duration > 480 || !Number.isFinite(threshold) || threshold <= 0 || threshold > 5) return;
		updateTicket({ cooldownStartedAt: Date.now(), cooldownDurationMinutes: duration, cooldownAllowedTemperatureDelta: threshold, status: 'COOLING_DOWN', currentStep: 2 });
	}

	function approveCooldownException() {
		cooldownManualApproved = true;
		checkedItems = { ...checkedItems, '2-1': true };
	}

	function scheduleDischarge() {
		if (!dischargeLoadConnected) return;
		dischargeScheduled = true;
		dischargeStartedAt = Date.now();
		dischargeResultRecorded = false;
		dischargedCapacity = ((batteryString?.ratedCapacity ?? 200) * .984).toFixed(1);
		lowestCellVoltage = dischargeCutoff.toFixed(2);
	}

	function saveDischargeSampling() {
		const minutes = Number(dischargeSamplingMinutes);
		if (!real || !Number.isInteger(minutes) || minutes < 1 || minutes > 1440) return;
		real.onConfigureDischargeSampling(minutes);
	}

	function startControlledDischarge() {
		real?.onStartControlledDischarge();
	}

	function completeControlledDischarge() {
		real?.onCompleteProcess('CONTROLLED_DISCHARGE');
	}

	function startRecoveryCharge() {
		if (!recoveryMcbClosed) return;
		recoveryStartedAt = Date.now();
		updateTicket({ recoveryMcbClosed, recoverySettingsVerified, recoveryStartedAt });
	}

	function formatDemoDuration(seconds: number) {
		return `00:${seconds.toString().padStart(2, '0')}`;
	}

	function nextStep() {
		if (!stepReady) return;
		if (real) { real.onContinue(); return; }
		if (selectedIndex === steps.length - 1) {
			demoComplete = true;
			completionDialog = true;
			updateTicket({ status: 'COMPLETED', currentStep: selectedIndex, completedAt: Date.now(), summary: { stringVoltage: floatVoltage.toFixed(1), midpointVoltage, dischargedCapacity, initialSoh: initialSoh.toFixed(1), lowestCellVoltage, stopReason: dischargeStopReason, floatCurrent, internalResistance, ambientTemperature: temperatureText(ambientTemperature), temperatureDelta: temperatureText(cooldownTemperatureDelta), allowedTemperatureDelta: allowedTemperatureDelta.toFixed(1), rippleNoLoad, rippleWithLoad } });
		} else {
			selectedIndex += 1;
			updateTicket({ currentStep: selectedIndex, status: 'IN_PROGRESS' });
		}
	}

	$effect(() => {
		if (!real) return;
		if (navigationEventId !== real.event.calibrationEventId) {
			selectedIndex = initialBaselineStep(real.event);
			navigationEventId = real.event.calibrationEventId;
		}
		checkedItems = {
			'0-0': hasInitialBaselineEvidence(real, 'BATTERY_CHARGER_CONNECTIONS_CHECKED'),
			'0-1': hasInitialBaselineEvidence(real, 'LOAD_MCB_OPEN_CONFIRMED'),
			'0-2': hasInitialBaselineEvidence(real, 'SAFETY_VISUAL_INSPECTION_CONFIRMED'),
			'0-3': hasInitialBaselineEvidence(real, 'OPEN_CIRCUIT_VOLTAGE_REVIEWED'),
			'2-0': hasInitialBaselineEvidence(real, 'CHARGER_MCB_OPEN_FOR_COOLDOWN'),
			'2-1': hasInitialBaselineEvidence(real, 'AMBIENT_TEMPERATURE_REVIEWED'),
			'2-2': hasInitialBaselineEvidence(real, 'COOLDOWN_SAFETY_VALVES_REVIEWED')
		};
		initialSettingsVerified = hasInitialBaselineEvidence(real, 'CHARGE_SETPOINTS_REVIEWED');
		recoveryMcbClosed = hasInitialBaselineEvidence(real, 'RECOVERY_CHARGER_MCB_CLOSED_CONFIRMED');
		recoverySettingsVerified = hasInitialBaselineEvidence(real, 'RECOVERY_CHARGE_SETPOINTS_REVIEWED');
		recoveryFloatConfirmed = hasInitialBaselineEvidence(real, 'RECOVERY_FLOAT_STABILITY_REVIEWED');
		resistanceMeasured = hasInitialBaselineEvidence(real, 'CELL_RESISTANCE_SAMPLE_REVIEWED');
		loadMcbClosed = hasInitialBaselineEvidence(real, 'LOAD_CONNECTED_CONFIRMATION');
		rippleWithLoadMeasured = hasInitialBaselineEvidence(real, 'RIPPLE_AFTER_LOAD');
		chargerOpenedForLoad = hasInitialBaselineEvidence(real, 'CHARGER_MCB_OPEN_CONFIRMATION');
		recoveryBaselineAccepted = hasInitialBaselineEvidence(real, 'VOC_BASELINE_CONFIRMATION');
		dischargeLoadConnected = hasInitialBaselineEvidence(real, 'TEST_LOAD_CONNECTED');
		dischargeScheduled = initialBaselineProcess(real, 'CONTROLLED_DISCHARGE')?.state !== 'NOT_STARTED';
		dischargeResultRecorded = hasInitialBaselineEvidence(real, 'DISCHARGE_CUTOFF_REVIEWED');
		// Preserve an operator edit across unrelated authoritative readbacks (for
		// example TEST_LOAD_CONNECTED). Only adopt a backend value when this is the
		// first readback or the input still equals the previously configured value.
		if (dischargeSamplingLastConfiguredMinutes === null
				|| Number(dischargeSamplingMinutes) === dischargeSamplingLastConfiguredMinutes) {
			dischargeSamplingMinutes = configuredDischargeSamplingMinutes.toString();
		}
		dischargeSamplingLastConfiguredMinutes = configuredDischargeSamplingMinutes;
		summaryApproved = hasInitialBaselineEvidence(real, 'BASELINE_SUMMARY_REVIEWED');
		floatCurrent = realFloatSample?.domainCurrentA == null ? '—' : (Math.abs(realFloatSample.domainCurrentA) * 1000).toFixed(1);
		midpointVoltage = realFloatSample?.midpointVoltageV?.toFixed(3) ?? '—';
		floatCurrentMeasured = hasInitialBaselineEvidence(real, 'CHARGER_OUTPUT_CURRENT');
		midpointMeasured = hasInitialBaselineEvidence(real, 'MIDPOINT_VOLTAGE');
		rippleNoLoadMeasured = hasInitialBaselineEvidence(real, 'RIPPLE_BEFORE_LOAD');
		const noLoadRipple = real.evidence.filter((item) => item.evidenceType === 'RIPPLE_BEFORE_LOAD' && item.numericValue != null).at(-1);
		rippleNoLoad = noLoadRipple?.numericValue == null ? '' : String(noLoadRipple.numericValue);
		const ripple = real.evidence.filter((item) => item.evidenceType === 'RIPPLE_AFTER_LOAD' && item.numericValue != null).at(-1);
		if (ripple?.numericValue != null) rippleWithLoad = String(ripple.numericValue);
	});

	onMount(() => {
		if (real) return;
		const migration: Partial<InitialBaselineDemoTicket> = {};
		if (ticket.floatStableDurationMinutes === undefined) migration.floatStableDurationMinutes = 60;
		if (ticket.floatVoltageToleranceV === undefined) migration.floatVoltageToleranceV = 1;
		if (ticket.floatCurrentMinA === undefined) migration.floatCurrentMinA = 0.1;
		if (ticket.floatCurrentMaxA === undefined) migration.floatCurrentMaxA = 0.2;
		if (ticket.floatStableStartedAt === undefined) migration.floatStableStartedAt = null;
		if (ticket.recoveryMcbClosed === undefined) migration.recoveryMcbClosed = false;
		if (ticket.recoverySettingsVerified === undefined) migration.recoverySettingsVerified = false;
		if (ticket.recoveryStartedAt === undefined) migration.recoveryStartedAt = null;
		if (ticket.recoveryChargeConfirmed === undefined) migration.recoveryChargeConfirmed = false;
		if (ticket.recoveryFloatStartedAt === undefined) migration.recoveryFloatStartedAt = null;
		if (ticket.recoveryFloatStableStartedAt === undefined) migration.recoveryFloatStableStartedAt = null;
		if (ticket.recoveryFloatConfirmed === undefined) migration.recoveryFloatConfirmed = false;
		if (!ticket.recoveryCellResistances?.length) migration.recoveryCellResistances = createRecoveryCellResistances();
		if (ticket.resistanceMeasured === undefined) migration.resistanceMeasured = false;
		if (ticket.floatCurrent === undefined) migration.floatCurrent = floatCurrent;
		if (ticket.floatCurrentMeasured === undefined) migration.floatCurrentMeasured = false;
		if (!ticket.midpointVoltage) migration.midpointVoltage = midpointVoltage;
		if (ticket.midpointMeasured === undefined) migration.midpointMeasured = false;
		if (ticket.rippleNoLoad === undefined) migration.rippleNoLoad = rippleNoLoad;
		if (ticket.rippleNoLoadMeasured === undefined) migration.rippleNoLoadMeasured = false;
		if (ticket.loadConnectedForRipple === undefined) migration.loadConnectedForRipple = false;
		if (ticket.rippleWithLoad === undefined) migration.rippleWithLoad = rippleWithLoad;
		if (ticket.rippleWithLoadMeasured === undefined) migration.rippleWithLoadMeasured = false;
		if (ticket.chargerOpenedForVoc === undefined) migration.chargerOpenedForVoc = false;
		if (ticket.vocCaptureStartedAt === undefined) migration.vocCaptureStartedAt = null;
		if (ticket.vocSnapshot === undefined) migration.vocSnapshot = null;
		if (ticket.vocBaselineConfirmed === undefined) migration.vocBaselineConfirmed = false;
		if (Object.keys(migration).length) updateTicket(migration);
		selectedIndex = ticket.status === 'COMPLETED' ? steps.length - 1 : Math.min(ticket.currentStep, steps.length - 1);
		const timer = window.setInterval(() => {
			now = Date.now();
			const patch: Partial<InitialBaselineDemoTicket> = {};
			if (ticket.boostStartedAt && boostReached && ticket.boostConfirmedAt === null) {
				patch.boostConfirmedAt = Date.now();
				patch.status = 'AWAITING_FLOAT_CONFIRMATION';
			}
			if (floatSettled && ticket.floatStableStartedAt == null) {
				patch.floatStableStartedAt = Date.now();
				patch.status = 'FLOAT_STABILIZING';
			}
			if (recoveryChargeComplete && recoveryFloatStartedAt === null) {
				recoveryFloatStartedAt = Date.now();
				patch.recoveryFloatStartedAt = recoveryFloatStartedAt;
			}
			if (recoveryFloatReached && recoveryFloatStableStartedAt === null) {
				recoveryFloatStableStartedAt = Date.now();
				patch.recoveryFloatStableStartedAt = recoveryFloatStableStartedAt;
			}
			if (chargerOpenedForLoad && !ticket.vocSnapshot && ticket.vocCaptureStartedAt != null
				&& now - ticket.vocCaptureStartedAt >= 1000) patch.vocSnapshot = createVocSnapshot(now);
			if (Object.keys(patch).length) updateTicket(patch);
		}, 300);
		return () => window.clearInterval(timer);
	});

</script>

<section class="baseline-page" aria-labelledby="baseline-heading">
	<header class="page-head">
		<div>
			<button class="back-link" onclick={onBack}><ArrowLeft size={16} />Back to events</button>
			<span class="eyebrow">INITIAL BASELINE / {stringName}</span>
			<h2 id="baseline-heading">Initial Baseline</h2>
		</div>
		<span class="guide-badge">{ticket.id}</span>
	</header>
	<div class="demo-banner"><ClipboardCheck size={18} /><span>{readOnly ? 'Completed event record — values are read-only.' : real ? 'Live measurements and process state are read from OpenEMS.' : ticket.status === 'CHARGING' ? 'Charging is running in the background. You can safely leave this page.' : 'Demo ticket is saved on this device. No command is sent to the BMS.'}</span></div>

	<nav class="stepper" aria-label="Initial Baseline steps">
		{#each steps as step, index}
			<button class:active={index === selectedIndex} aria-current={index === selectedIndex ? 'step' : undefined} disabled={(readOnly && index !== steps.length - 1) || Boolean(real && index > activeStepIndex)} onclick={() => { if (!readOnly && (!real || index <= activeStepIndex)) selectedIndex = index; }}>
				<span>{index + 1}</span><strong>{step.title}</strong>
			</button>
		{/each}
	</nav>

		<fieldset class="workspace-panel" aria-live="polite" disabled={!viewingActiveStep}>
		<div class="content-heading"><ClipboardCheck size={21} /><div><span>STEP {selectedIndex + 1} OF {steps.length}</span><h3>{selected.title}</h3></div></div>
		<div class="action-card"><span>WHAT TO DO</span><strong>{selected.action}</strong></div>
			{#if selectedIndex === 1}
				<section class="charge-workflow">
					<div class="charge-targets"><div><span>Vboost target</span><strong>{boostVoltage.toFixed(1)} V</strong><small>{boostVoltagePerCell.toFixed(2)} V/cell × {cellCount} cells</small></div><div><span>Vfloat target</span><strong>{floatVoltage.toFixed(1)} V</strong><small>{floatVoltagePerCell.toFixed(2)} V/cell × {cellCount} cells</small></div><div><span>Current limit</span><strong>{currentLimit.toFixed(1)} A</strong><small>20% of rated capacity</small></div></div>
					<section class="float-settings"><header><div><span>Float stable mode</span><strong>{real ? 'Configure the authoritative Float window before charge starts.' : 'Configure the stable window before charging.'}</strong></div><small>{real ? 'Saved, audited and evaluated by backend' : 'Saved in this demo ticket'}</small></header><div class="float-settings-grid"><label><span>Stable duration</span><div><input type="number" min="1" step="1" bind:value={floatStableDurationInput} disabled={real ? !canConfigureRealFloatStablePolicy : initialSettingsVerified || ticket.boostStartedAt !== null} /><small>min</small></div></label><label><span>Voltage tolerance</span><div><input type="number" min="0.1" step="0.1" bind:value={floatVoltageToleranceInput} disabled={real ? !canConfigureRealFloatStablePolicy : initialSettingsVerified || ticket.boostStartedAt !== null} /><small>V</small></div></label><label><span>Float current range</span><div><input type="number" min="0" step="0.1" bind:value={floatCurrentMinInput} disabled={real ? !canConfigureRealFloatStablePolicy : initialSettingsVerified || ticket.boostStartedAt !== null} /><small>to</small><input type="number" min="0" step="0.1" bind:value={floatCurrentMaxInput} disabled={real ? !canConfigureRealFloatStablePolicy : initialSettingsVerified || ticket.boostStartedAt !== null} /><small>A</small></div></label></div>{#if real}<button class="secondary" disabled={!canConfigureRealFloatStablePolicy || Boolean(floatStableSettingsError) || !realFloatStablePolicyDirty} onclick={() => real?.onConfigureFloatStablePolicy(parsedFloatStableSettings())}>Save Float stable settings</button>{#if realFloatStablePolicyDirty}<p class="settings-error">Save the changed Float policy before verifying the charge settings.</p>{/if}{/if}{#if floatStableSettingsError}<p class="settings-error">{floatStableSettingsError}</p>{/if}</section>
					<label class="charge-confirm"><input type="checkbox" checked={initialSettingsVerified} disabled={Boolean(floatStableSettingsError) || Boolean(realFloatStablePolicyDirty)} onchange={(event) => verifyInitialChargeSettings(event.currentTarget.checked)} /><span><strong>Verify charge settings</strong><small>Targets and Float-stable limits match the approved configuration.</small></span></label>
					{#if initialSettingsVerified}
						<div class="charge-status"><div class="status-head"><div><span>Boost charge</span><strong>{boostReached ? 'Vboost reached' : 'Charging to Vboost'}</strong></div><b>{real ? `${voltageText(displayedBoostVoltage)} V / ${effectiveBoostTargetVoltage.toFixed(1)} V` : `${voltageText(displayedBoostVoltage)} V / ${boostVoltage.toFixed(1)} V`}</b></div>{#if real}<div class="progress"><i style={`width:${realBoostBarWidth}%`}></i></div><div class="live-charge-metrics"><div><span>Processed string voltage</span><strong>{voltageText(displayedBoostVoltage)} V</strong></div><div><span>Nominal target (25 °C)</span><strong>{boostVoltage.toFixed(1)} V</strong><small>{boostVoltagePerCell.toFixed(3)} V/cell × {cellCount}</small></div><div><span>Effective target</span><strong>{effectiveBoostTargetVoltage.toFixed(1)} V</strong><small>{boostProcessedTemperature === null ? 'Waiting for cell temperature' : `Temperature-compensated at ${boostProcessedTemperature.toFixed(1)} °C`}</small></div></div><p class="live-snapshot-note">The bar is the processed string voltage against the temperature-compensated target. The backend alone confirms the target.</p>{#if initialBoostRuntimeStatus}<div class="process-runtime-warning"><AlertTriangle size={17} /><div><strong>Backend process warning{initialBoostRuntimeStatus.recommendation ? ` · ${initialBoostRuntimeStatus.recommendation}` : ''}</strong>{#each initialBoostRuntimeStatus.blockers as blocker}<span><b>{blocker}</b> — {processBlockerMessage(blocker)}</span>{/each}</div></div>{/if}{:else}<div class="status-head estimate-head"><span>Live voltage {voltageText(displayedBoostVoltage)} V</span><b>{boostProgress}% of {effectiveBoostTargetVoltage.toFixed(1)} V</b></div><div class="progress"><i style={`width:${boostProgress}%`}></i></div><p class="estimate-note">Estimated ramp visualization from the live voltage and temperature-adjusted target; the percentage is not a measurement.</p>{/if}{#if !boostReached}<button class="secondary" onclick={startBoostCharge} disabled={Boolean(real) && (real?.busy || initialBoostProcess?.state !== 'NOT_STARTED')}>{real ? initialBoostProcess?.state === 'NOT_STARTED' ? 'Start charge' : initialBoostProcess?.state === 'ACTIVE' ? 'Charging…' : 'Waiting for backend…' : boostProgress > 0 ? 'Charging…' : 'Start demo charge'}</button>{/if}</div>
						{#if boostReached}<label class="charge-confirm"><input type="checkbox" checked={boostConfirmed} onchange={(event) => confirmBoost(event.currentTarget.checked)} /><span><strong>Confirm Vboost reached</strong><small>Measured string voltage has reached the configured target.</small></span></label>{/if}
						{#if real ? initialFloatProcess?.state !== 'NOT_STARTED' : ticket.boostConfirmedAt !== null}<div class:ready={floatSettled} class="charge-status"><div class="status-head"><div><span>Float charge</span><strong>{floatSettled ? 'Vfloat target reached' : 'Charging and settling to Vfloat'}</strong></div><b>{real ? `${voltageText(displayedFloatVoltage)} V / ${effectiveFloatTargetVoltage.toFixed(1)} V` : `${voltageText(displayedFloatVoltage)} V / ${floatVoltage.toFixed(1)} V`}</b></div>{#if real}<div class="progress float-progress"><i style={`width:${realFloatBarWidth}%`}></i></div><div class="live-charge-metrics"><div><span>Processed string voltage</span><strong>{voltageText(displayedFloatVoltage)} V</strong></div><div><span>Nominal target (25 °C)</span><strong>{floatVoltage.toFixed(1)} V</strong><small>{floatVoltagePerCell.toFixed(3)} V/cell × {cellCount}</small></div><div><span>Effective target</span><strong>{effectiveFloatTargetVoltage.toFixed(1)} V</strong><small>{floatProcessedTemperature === null ? 'Waiting for cell temperature' : `Temperature-compensated at ${floatProcessedTemperature.toFixed(1)} °C`}</small></div></div><p class="live-snapshot-note">The bar is the processed string voltage against the temperature-compensated target. The backend alone confirms the target.</p>{#if initialFloatRuntimeStatus}<div class="process-runtime-warning"><AlertTriangle size={17} /><div><strong>Backend process warning{initialFloatRuntimeStatus.recommendation ? ` · ${initialFloatRuntimeStatus.recommendation}` : ''}</strong>{#each initialFloatRuntimeStatus.blockers as blocker}<span><b>{blocker}</b> — {processBlockerMessage(blocker)}</span>{/each}</div></div>{/if}{:else}<div class="progress float-progress"><i style={`width:${floatSettlingProgress}%`}></i></div>{/if}{#if !floatSettled}<div class="waiting"><i></i> Automatic transition · charger output is regulating to Vfloat</div>{/if}</div>{/if}
						{#if real ? initialFloatProcess?.state === 'COMPLETED' : ticket.floatStableStartedAt !== null && ticket.floatStableStartedAt !== undefined}<div class:ready={floatReached} class="float-stable"><div class="status-head"><div><span>Float stable mode</span><strong>{floatReached ? 'Stable window complete' : 'Holding within Float range'}</strong></div><b>{floatStableProgress}%</b></div><div class="progress float-progress"><i style={`width:${floatStableProgress}%`}></i></div><div class="float-metrics"><div><span>Current voltage</span><strong>{voltageText(displayedFloatVoltage)} V</strong><small>Target ± {initialFloatVoltageToleranceV.toFixed(1)} V</small></div><div><span>Current charge</span><strong>{currentText(displayedFloatCurrentA)} A</strong><small>{initialFloatCurrentMinA.toFixed(1)}–{initialFloatCurrentMaxA.toFixed(1)} A</small></div><div><span>Stable duration</span><strong>{floatStableElapsedMinutes} / {floatStableDurationMinutes} min</strong><small>{real ? 'Measured by backend worker' : 'Demo time accelerated'}</small></div></div>{#if initialFloatStableWarning}<div class="float-stable-warning"><AlertTriangle size={17} /><div><strong>{initialFloatStableWarning.serverBlocker ? `Server blocker: ${initialFloatStableWarning.serverBlocker}` : 'Float stable window is waiting for readings in range'}</strong><span>{#if !initialFloatStableWarning.voltageAvailable}Live string voltage is unavailable.{:else if !initialFloatStableWarning.voltageInRange}Live voltage {voltageText(displayedFloatVoltage)} V is outside the compensated Vfloat {effectiveFloatTargetVoltage.toFixed(1)} ± {initialFloatVoltageToleranceV.toFixed(1)} V (nominal {floatVoltage.toFixed(1)} V at 25 °C).{/if}{#if !initialFloatStableWarning.currentAvailable} Live charge current is unavailable.{:else if !initialFloatStableWarning.currentInRange} Live current magnitude {currentText(initialFloatStableWarning.currentMagnitude)} A is outside the configured {initialFloatCurrentMinA.toFixed(2)}–{initialFloatCurrentMaxA.toFixed(2)} A range.{/if}</span><small>{initialFloatStableWarning.serverBlocker ? 'The server reported this blocker; correct the live condition and wait for the next readback.' : 'This explanation is derived from live telemetry and the event configuration; the backend remains authoritative.'}</small></div></div>{/if}</div>{/if}
						{#if floatReached && boostConfirmed}<label class="charge-confirm"><input type="checkbox" checked={floatConfirmed} onchange={(event) => confirmFloat(event.currentTarget.checked)} /><span><strong>Confirm Float condition is stable</strong><small>Review the voltage, current and completed stable window above.</small></span></label>{/if}
					{/if}
				</section>
		{:else if selectedIndex === 2}
			<section class="cooldown-workflow">
				<label class="charge-confirm"><input type="checkbox" checked={checkedItems['2-0'] ?? false} onchange={(event) => confirmChargerIsolated(event.currentTarget.checked)} /><span><strong>Confirm charger DC MCB is open</strong><small>Cool-down monitoring starts only after the charger is isolated.</small></span></label>
				{#if checkedItems['2-0']}
					{#if ticket.cooldownStartedAt == null}<div class="cooldown-setup"><div><span>Monitoring setup</span><strong>Set the maximum monitoring time and the allowed difference from ambient temperature.</strong></div><label><span>Max. time</span><div><input type="number" min="1" max="480" bind:value={cooldownDurationInput} aria-label="Maximum cool-down time in minutes" /><small>min</small></div></label><label><span>Allowed delta</span><div><input type="number" min="0.1" max="5" step="0.1" bind:value={cooldownThresholdInput} aria-label="Allowed temperature difference in degrees Celsius" /><small>°C</small></div></label><button class="secondary" disabled={!Number.isInteger(Number(cooldownDurationInput)) || Number(cooldownDurationInput) < 1 || Number(cooldownDurationInput) > 480 || !Number.isFinite(Number(cooldownThresholdInput)) || Number(cooldownThresholdInput) <= 0 || Number(cooldownThresholdInput) > 5} onclick={startCooldownMonitoring}>Start monitoring</button></div>{:else}
					<div class:failed={!cooldownTemperatureConditionMet && cooldownMonitoringComplete && !cooldownManualApproved} class:ready={cooldownStatusReady} class="temperature-status"><div class="status-head"><div><span>Temperature check</span><strong>{real ? cooldownTemperatureConditionMet ? 'Temperature condition is within the allowed range' : cooldownMonitoringComplete ? 'Maximum monitoring time reached' : 'Cooling down to the allowed range' : cooldownTemperaturePassed ? 'Temperature is within the allowed range' : cooldownManualApproved ? 'Out-of-range result approved' : cooldownMonitoringComplete ? 'Maximum monitoring time reached' : 'Cooling down to the allowed range'}</strong></div><b>{temperatureText(cooldownTemperatureDelta)} °C / {allowedTemperatureDelta.toFixed(1)} °C</b></div><div class="progress cooldown-progress"><i style={`width:${cooldownProgress}%`}></i></div>{#if real}<p class="duration-note"><b>Live snapshot:</b> the bar is a pass/fail condition indicator: full only when the maximum cell-to-ambient delta is within the allowed limit. It does not represent elapsed time or complete the backend process.</p>{:else if !cooldownTemperaturePassed && !cooldownMonitoringComplete}<div class="waiting"><i></i> Monitoring {formatDemoDuration(cooldownElapsedSeconds)} / 00:12 demo · configured limit: {ticket.cooldownDurationMinutes} min</div>{:else if !cooldownTemperaturePassed}<div class="timeout-note">Monitoring stopped after the configured {ticket.cooldownDurationMinutes} minutes. Review the final result below.</div>{/if}<div class="temperature-metrics"><div><span>Ambient</span><strong>{temperatureText(ambientTemperature)} °C</strong></div><div><span>Farthest cell</span><strong>{temperatureText(farthestCellTemperature)} °C</strong></div><div><span>Allowed delta</span><strong>≤ {allowedTemperatureDelta.toFixed(1)} °C</strong></div></div><p class="duration-note"><b>Actual operation:</b> monitoring ends when the configured limit is reached. If the temperature condition is still outside the limit, an operator exception is required to continue.</p></div>
					{/if}
					{#if !cooldownTemperaturePassed && cooldownMonitoringComplete && !cooldownManualApproved && cooldownTemperatureDelta !== null}<div class="manual-approval"><strong>Threshold not reached</strong><span>Measured difference is <b>{cooldownTemperatureDelta.toFixed(1)} °C</b>, exceeding the configured limit of <b>{allowedTemperatureDelta.toFixed(1)} °C</b> by <b>{(cooldownTemperatureDelta - allowedTemperatureDelta).toFixed(1)} °C</b>. You may continue only after accepting this exception.</span><label class="exception-confirm"><input type="checkbox" bind:checked={cooldownExceptionAccepted} /><span>I accept the measured difference of {cooldownTemperatureDelta.toFixed(1)} °C for this baseline.</span></label><input placeholder="Required approval reason" bind:value={cooldownManualReason} /><button class="secondary" disabled={!cooldownExceptionAccepted || !cooldownManualReason.trim()} onclick={approveCooldownException}>Approve exception and continue</button></div>{/if}
					{#if cooldownTemperaturePassed && !cooldownManualApproved}<label class="charge-confirm"><input type="checkbox" checked={checkedItems['2-1'] ?? false} onchange={(event) => toggleItem(1, event.currentTarget.checked)} /><span><strong>Confirm temperature result</strong><small>BMS temperature condition is passed.</small></span></label>{/if}
					{#if checkedItems['2-1']}<label class="charge-confirm"><input type="checkbox" checked={checkedItems['2-2'] ?? false} onchange={(event) => toggleItem(2, event.currentTarget.checked)} /><span><strong>Confirm safety valves are checked</strong><small>Check for leakage, deformation or physical damage before discharge.</small></span></label>{/if}
				{/if}
			</section>
		{:else if selectedIndex === 3}
			<section class="discharge-workflow">
				<div class="discharge-controls"><label>Discharge profile<select bind:value={dischargeProfile} disabled={Boolean(real) || dischargeScheduled}>{#if real}<option value={real.event.configuration.dischargeMethod === 'C5' ? '0.2C5' : '0.1C10'}>{real.event.configuration.dischargeMethod === 'C5' ? '0.2C5 — 5 h' : '0.1C10 — 10 h'}</option>{:else}<option value="0.1C10">0.1C10 — 10 h</option><option value="0.2C5">0.2C5 — 5 h</option>{/if}</select></label><label>Test current (A)<input value={dischargeCurrent.toFixed(1)} readonly /></label><label>Cut-off / cell (VDC)<input value={dischargeCutoff.toFixed(2)} readonly /></label><label>Sampling interval (calibration min)<input type="number" min="1" max="1440" step="1" bind:value={dischargeSamplingMinutes} disabled={real ? displayedDischargePhase !== 'WAITING_FOR_LOAD' || !dischargeStageIsAuthoritativeCurrent || real.busy : dischargeScheduled} /><small>{real ? `${effectiveDischargeSamplingSeconds} wall-clock seconds at ${realDemoTimeScaleFactor}×` : 'Demo ticket setting'}</small></label></div>
				<div class="safety-banner"><AlertTriangle size={18} /><div><strong>Stop condition</strong><span>Stop at the first cell reaching {dischargeCutoff.toFixed(2)} V/cell, or sooner if a safety alarm occurs.</span></div></div>
					{#if real}
						{#if displayedDischargePhase === 'WAITING_FOR_LOAD'}
							<p class="duration-note"><b>Physical preparation:</b> keep the default sampling interval or save a changed value, then connect the approved test load. Start advances the persisted WAITING_FOR_LOAD stage and starts CONTROLLED_DISCHARGE as two versioned backend mutations.</p>
							<button class="secondary schedule-discharge" disabled={real.busy || !dischargeSamplingDirty || !dischargeSamplingValid} onclick={saveDischargeSampling}>Save sampling interval</button>
						{#if dischargeSamplingDirty}<p class="settings-error">Save the changed sampling interval before starting discharge.</p>{/if}
						<label class="charge-confirm"><input type="checkbox" checked={dischargeLoadConnected} onchange={(event) => confirmDischargeLoad(event.currentTarget.checked)} disabled={real.busy || !dischargeStageIsAuthoritativeCurrent} /><span><strong>Confirm standard load is connected</strong><small>Connect the approved test load before continuing to the discharge stage.</small></span></label>
					{/if}
					{#if dischargeLoadConnected || displayedDischargePhase === 'DISCHARGE' || displayedDischargePhase === 'LOAD_DISCONNECT'}
						<section class="selected-discharge"><header><div><span>Controlled discharge</span><strong>{controlledDischargeProcess?.state ?? 'NOT_STARTED'}{dischargeRecommendation ? ` · ${dischargeRecommendation}` : ''}</strong></div><b>{displayedDischargeCurrent?.toFixed(3) ?? '—'} A · {latestDischargeSample?.rawUsedAh?.toFixed(2) ?? '—'} Ah</b></header>
							{#if showLiveDischargePreview}<p class="discharge-source-note"><b>Live pre-start preview.</b> These values come from the current BMS snapshot and are not calibration samples. After Start, this panel switches entirely to persisted discharge samples.</p>{/if}
							<div class="live-charge-metrics"><div><span>{showLiveDischargePreview ? 'Live string voltage' : 'Persisted string voltage'}</span><strong>{displayedDischargeStringVoltage?.toFixed(3) ?? '—'} V</strong></div><div><span>{showLiveDischargePreview ? 'Live lowest cell voltage' : 'Persisted lowest cell voltage'}</span><strong>{displayedDischargeLowestCellVoltage?.toFixed(3) ?? '—'} V</strong></div><div><span>Depth of discharge</span><strong>{latestDischargeSample?.dodPct?.toFixed(2) ?? '—'}%</strong></div></div>
							<DischargeTrendChart cutoffPerCell={dischargeCutoff} values={realDischargeTrend} />
							{#if !latestDischargeSample}<p class="duration-note"><b>Waiting for persisted discharge data.</b> The chart and official discharge metrics appear after the process starts and the configured sampling interval elapses.</p>{/if}
						</section>
						{#if dischargeBlockers.length}<div class="process-runtime-warning"><AlertTriangle size={17} /><div><strong>Backend process blockers</strong>{#each dischargeBlockers as blocker}<span><b>{blocker}</b> — {processBlockerMessage(blocker)}</span>{/each}</div></div>{/if}
						{#if !controlledDischargeProcess}<div class="process-runtime-warning"><AlertTriangle size={17} /><div><strong>Controlled discharge process is unavailable</strong><span>Reload the event and verify that the backend created CONTROLLED_DISCHARGE for this workflow.</span></div></div>{/if}
						{#if (displayedDischargePhase === 'WAITING_FOR_LOAD' || displayedDischargePhase === 'DISCHARGE') && controlledDischargeProcess?.state === 'NOT_STARTED'}
							<button class="secondary schedule-discharge" disabled={!canStartControlledDischarge} title={startControlledDischargeDisabledReason ?? undefined} onclick={startControlledDischarge}><Play size={15} />Start discharge process</button>
							{#if startControlledDischargeDisabledReason}<p class="start-disabled-reason"><AlertTriangle size={15} /><span><b>Start is blocked:</b> {startControlledDischargeDisabledReason}</span></p>{/if}
							{#if dischargeRevalidationRequired && dischargeRevalidateAction?.enabled}
								<div class="stage-revalidation-action"><div><strong>Physical-stage revalidation required</strong><span>OpenEMS restarted during this stage. Confirm the physical topology before discharge can start.</span></div><button class="secondary warning-text" disabled={real.busy} onclick={() => requestFooterAction(dischargeRevalidateAction)}>Revalidate physical stage</button></div>
							{/if}
						{/if}
						{#if controlledDischargeProcess?.state === 'ACTIVE' && dischargeRecommendation === 'READY_TO_COMPLETE'}<button class="secondary schedule-discharge" disabled={real.busy || !cutoffDischargeSample} onclick={completeControlledDischarge}>Complete discharge process</button>{/if}
						{#if controlledDischargeProcess?.state === 'COMPLETED'}<label class="charge-confirm"><input type="checkbox" checked={dischargeResultRecorded} disabled={real.busy || !cutoffDischargeSample} onchange={(event) => confirmDischargeResult(event.currentTarget.checked)} /><span><strong>Confirm persisted discharge result</strong><small>{cutoffDischargeSample ? `Cut-off sample #${cutoffDischargeSample.sampleId}, ${(cutoffDischargeSample.rawUsedAh ?? 0).toFixed(2)} Ah.` : 'Waiting for a valid persisted cut-off sample.'}</small></span></label>{/if}
						{#if displayedDischargePhase === 'LOAD_DISCONNECT'}
							<label class="charge-confirm"><input type="checkbox" checked={hasInitialBaselineEvidence(real, 'TEST_LOAD_DISCONNECTED')} disabled={real.busy} onchange={(event) => confirmDischargeLoadDisconnected(event.currentTarget.checked)} /><span><strong>Confirm test load is disconnected</strong><small>Physically isolate the test load before recovery charging.</small></span></label>
						{/if}
					{/if}
				{:else}
				<label class="charge-confirm"><input type="checkbox" checked={dischargeLoadConnected} onchange={(event) => confirmDischargeLoad(event.currentTarget.checked)} disabled={dischargeScheduled} /><span><strong>Confirm standard load is connected</strong><small>Connect the approved test load before scheduling the discharge event.</small></span></label>
				{#if !dischargeScheduled}<button class="secondary schedule-discharge" disabled={!dischargeLoadConnected || !Number(dischargeSamplingMinutes)} onclick={scheduleDischarge}><Play size={15} />Schedule discharge event</button>{:else}
					<section class="selected-discharge"><header><div><span>Selected discharge event</span><strong>{dischargeComplete ? 'Cut-off reached / demo' : 'Running / demo'}</strong></div><b>{dischargeCurrent.toFixed(1)} A · {demoDischargedCapacity} Ah</b></header><DischargeTrendChart demo={true} cutoffPerCell={dischargeCutoff} progress={dischargeProgress} />{#if !dischargeComplete}<div class="discharge-running"><i></i><span>Discharging {formatDemoDuration(Math.min(12, Math.floor(dischargeProgress * .12)))} / 00:12 demo</span><b>{demoDischargedCapacity} Ah used</b></div>{/if}</section>
					{#if dischargeComplete}<div class="discharge-results"><label>Discharged capacity (Ah)<input type="number" min="0" bind:value={dischargedCapacity} /></label><label>Lowest cell voltage (VDC)<input type="number" step="0.01" bind:value={lowestCellVoltage} /></label><label>Stop reason<select bind:value={dischargeStopReason}><option value="CELL_CUTOFF">Cell reached configured cut-off</option><option value="OPERATOR_STOP">Operator stopped test</option><option value="SAFETY_ALARM">Safety alarm</option></select></label></div>
					<label class="charge-confirm"><input type="checkbox" checked={dischargeResultRecorded} onchange={(event) => confirmDischargeResult(event.currentTarget.checked)} /><span><strong>Confirm discharge result</strong><small>Capacity, lowest cell voltage and stop reason have been recorded.</small></span></label>{/if}
				{/if}
				{/if}
			</section>
			{:else if selectedIndex === 4}
				<InitialBaselineStageFive model={stageFiveModel} actions={stageFiveActions} />
		{:else if selectedIndex === 5}
			<section class="summary-workflow">
				<div class="summary-heading"><div><span>INITIAL BASELINE EVENT</span><strong>{ticket.id}</strong></div><span>Ready for review</span></div>
				<div class="summary-grid"><article><span>String voltage</span><strong>{summaryValues.stringVoltage} V</strong><small>Float target</small></article><article><span>Midpoint voltage</span><strong>{summaryValues.midpointVoltage} V</strong><small>Baseline</small></article><article><span>Discharged capacity</span><strong>{summaryValues.dischargedCapacity} Ah</strong><small>At cut-off</small></article><article><span>Initial SOH</span><strong>{summaryValues.initialSoh}%</strong><small>From discharge test</small></article><article><span>Lowest cell voltage</span><strong>{summaryValues.lowestCellVoltage} V</strong><small>{summaryValues.stopReason.replaceAll('_', ' ')}</small></article><article><span>Float current</span><strong>{summaryValues.floatCurrent} mA</strong><small>Baseline</small></article><article><span>Cell / block resistance</span><strong>{summaryValues.internalResistance} mΩ</strong><small>Baseline</small></article><article><span>Temperature condition</span><strong>{summaryValues.ambientTemperature} °C</strong><small>Δ {summaryValues.temperatureDelta} °C / ≤ {summaryValues.allowedTemperatureDelta} °C</small></article><article><span>AC ripple</span><strong>{summaryValues.rippleNoLoad} / {summaryValues.rippleWithLoad} V</strong><small>No load / with load</small></article></div>
				{#if !readOnly}<label class="charge-confirm summary-confirm"><input type="checkbox" checked={summaryApproved} onchange={(event) => confirmSummary(event.currentTarget.checked)} /><span><strong>Confirm Initial Baseline summary</strong><small>I have reviewed the event results and accept this data as the Initial Baseline reference.</small></span></label>{/if}
			</section>
		{:else}
			{#if selectedIndex === 0 && real}
				<section class="float-settings demo-time-scale"><header><div><span>Demo time scale</span><strong>Choose before any physical process starts.</strong></div><small>Saved and audited by backend</small></header><div class="float-settings-grid"><label><span>Float stable window</span><select value={realDemoTimeScaleFactor} disabled={!canConfigureRealDemoTimeScale} onchange={(event) => real?.onConfigureDemoTimeScale(Number(event.currentTarget.value) === 60 ? 60 : 1)}><option value={1}>1× — real time</option><option value={60}>60× — 1 real second = 1 calibration minute</option></select><small>Applies to Float stable windows and Initial Baseline discharge Ah only. Telemetry freshness and threshold checks stay real time.</small></label></div></section>
			{/if}
			<div class="content-grid">
				<section class="progressive-checklist"><h4>Operator confirmation</h4><p>Complete the current item to unlock the next one.</p><ul>{#each selected.checklist as item, index}{#if isChecklistItemVisible(index)}<li class:complete={checkedItems[`${selectedIndex}-${index}`]}><span class="item-number">{index + 1}</span><label><input type="checkbox" checked={checkedItems[`${selectedIndex}-${index}`] ?? false} onchange={(event) => toggleItem(index, event.currentTarget.checked)} /><CheckCircle2 size={16} /><span>{item}</span></label></li>{/if}{/each}</ul></section>
			</div>
		{/if}
		<section class="record-card"><h4>Data to record</h4><div class="record-list">{#each selected.records as item}<span>{item}</span>{/each}</div></section>
	</fieldset>

	{#if demoComplete}<div class="complete-banner"><CheckCircle2 size={18} /><span>Demo complete. The baseline report is ready for review.</span></div>{/if}
	{#if !readOnly}<footer class="page-footer"><div class="footer-navigation"><button class="secondary" disabled={selectedIndex === 0} onclick={() => selectedIndex -= 1}>Back</button>{#if real}<button class="secondary" disabled={viewingActiveStep} onclick={() => selectedIndex = activeStepIndex}>Go to active stage</button>{/if}</div><div class="footer-actions">{#if real?.canRedoStage}<button class="secondary danger-text" disabled={real.busy} onclick={() => redoConfirmation = true}>Redo stage</button>{/if}{#if real}{#each real.event.allowedActions.filter((action) => action.actionCode === 'REVALIDATE_STAGE' || action.actionCode === 'ABORT_EVENT') as action}<button class="secondary" class:warning-text={action.intent === 'WARNING'} class:danger-text={action.intent === 'DANGER'} disabled={real.busy || !action.enabled} title={action.disabledReason ?? undefined} onclick={() => requestFooterAction(action)}>{action.label}</button>{/each}{/if}<button class="primary" disabled={!viewingActiveStep || !stepReady || Boolean(real?.busy)} onclick={nextStep}>{selectedIndex === steps.length - 1 ? (real ? 'Save' : 'Finish demo') : 'Next step'}</button></div></footer>{:else}<footer class="page-footer"><span class="history-note">Completed {ticket.completedAt ? new Date(ticket.completedAt).toLocaleString() : ''}</span><button class="primary" onclick={onBack}>Back to events</button></footer>{/if}
	{#if redoConfirmation && real}<div class="completion-backdrop" role="presentation"><div class="completion-dialog action-dialog" role="dialog" aria-modal="true" aria-labelledby="redo-stage-title"><AlertTriangle size={28} /><h3 id="redo-stage-title">Redo stage</h3><p>This reopens the latest completed stage on the server and resets later stages. Historical audit rows stay unchanged.</p><label>Required reason<input bind:value={redoReason} disabled={real.busy} placeholder="Explain why this stage must be repeated" /></label><div><button class="secondary" disabled={real.busy} onclick={() => { redoConfirmation = false; redoReason = ''; }}>Cancel</button><button class="secondary danger-text" disabled={real.busy || !redoReason.trim()} onclick={() => { real.onRedoStage(redoReason); redoConfirmation = false; redoReason = ''; }}>Confirm redo stage</button></div></div></div>{/if}
	{#if footerAction && real}<div class="completion-backdrop" role="presentation"><div class="completion-dialog action-dialog" role="dialog" aria-modal="true" aria-labelledby="event-action-title"><AlertTriangle size={28} /><h3 id="event-action-title">{footerAction.label}</h3><p>{footerActionDescription(footerAction)}</p>{#if footerAction.requiresReason}<label>Required reason<input bind:value={footerActionReason} disabled={real.busy} placeholder={footerAction.actionCode === 'ABORT_EVENT' ? 'Explain why this event must be aborted' : 'Explain why this stage must be revalidated'} /></label>{/if}{#if footerAction.requiresAcknowledgement}{#each footerAction.acknowledgementItems as item}<label class="action-ack"><input type="checkbox" disabled={real.busy} checked={footerAcknowledgedItems.includes(item)} onchange={(event) => footerAcknowledgedItems = event.currentTarget.checked ? [...new Set([...footerAcknowledgedItems, item])] : footerAcknowledgedItems.filter((value) => value !== item)} />Acknowledge {item.replaceAll('_', ' ')}</label>{/each}{/if}<div><button class="secondary" disabled={real.busy} onclick={() => footerAction = null}>Cancel</button><button class="secondary" class:warning-text={footerAction.intent === 'WARNING'} class:danger-text={footerAction.intent === 'DANGER'} disabled={real.busy || !actionReady(footerAction)} onclick={confirmFooterAction}>Confirm {footerAction.label}</button></div></div></div>{/if}
	{#if completionDialog}<div class="completion-backdrop" role="presentation"><div class="completion-dialog" role="dialog" aria-modal="true" aria-labelledby="completion-title"><CheckCircle2 size={28} /><h3 id="completion-title">Initial Baseline completed</h3><p>The event summary has been saved. You can view it again from Events as a read-only record.</p><button class="primary" onclick={onBack}>Return to events</button></div></div>{/if}
</section>

<style>
	.baseline-page{width:100%;color:#33425d}.page-head{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;margin-bottom:12px}.back-link{display:inline-flex;align-items:center;gap:7px;margin:0 0 12px;padding:0;border:0;color:#4164a8;background:transparent;font:inherit;font-size:13px;cursor:pointer}.back-link:focus-visible,.stepper button:focus-visible,.secondary:focus-visible,.primary:focus-visible{outline:2px solid #1749ad;outline-offset:2px}.eyebrow{display:block;margin-bottom:6px;color:#3860ad;font-size:11px;font-weight:600;letter-spacing:.09em}.page-head h2{margin:0;color:#172b4d;font-size:25px;font-weight:500}.guide-badge{padding:7px 9px;border-radius:7px;color:#4164a8;background:#eef4ff;font-size:11px;font-weight:600;white-space:nowrap}.demo-banner,.complete-banner{display:flex;align-items:center;gap:9px;margin-bottom:16px;padding:11px 13px;border-radius:9px;color:#315e9e;background:#eff6ff;font-size:12px}.complete-banner{margin:16px 0 0;color:#28734b;background:#edf9f1}.stepper{display:grid;grid-template-columns:repeat(6,minmax(132px,1fr));overflow-x:auto;margin-bottom:16px;border:1px solid #edf1f6;border-radius:11px;background:#fff;box-shadow:0 5px 18px rgba(35,54,89,.025)}.stepper button{display:grid;grid-template-columns:25px 1fr;align-items:center;gap:7px;min-width:132px;padding:12px 10px;border:0;border-right:1px solid #edf0f5;color:#718096;background:#fff;font:inherit;text-align:left;cursor:pointer}.stepper button:last-child{border-right:0}.stepper button span{display:grid;width:23px;height:23px;place-items:center;border:1px solid #d7dfeb;border-radius:50%;font-size:11px}.stepper button strong{font-size:11px;font-weight:500;line-height:1.2}.stepper button.active{color:#1749ad;background:#f2f6ff}.stepper button.active span{border-color:#1749ad;color:#fff;background:#1749ad}.workspace-panel{min-inline-size:0;margin:0;padding:22px;border:1px solid #edf1f6;border-radius:12px;background:#fff;box-shadow:0 12px 30px rgba(35,54,89,.055)}.content-heading{display:flex;align-items:center;gap:10px;margin-bottom:18px;color:#315b9f}.content-heading div{display:grid;gap:3px}.content-heading span{color:#7590ba;font-size:10px;font-weight:600;letter-spacing:.08em}.content-heading h3{margin:0;color:#273853;font-size:18px;font-weight:500}.action-card{display:grid;gap:6px;padding:15px 16px;border-radius:10px;color:#294f91;background:#f0f5fd}.action-card span{font-size:10px;font-weight:600;letter-spacing:.06em}.action-card strong{font-size:14px;font-weight:500;line-height:1.5}.content-grid{display:grid;grid-template-columns:1.15fr .85fr;gap:12px;margin-top:12px}.content-grid section,.record-card{padding:15px 16px;border-radius:10px;background:#f7f9fc}.content-grid h4,.record-card h4{margin:0 0 11px;color:#40516d;font-size:12px;font-weight:600}.content-grid ul{display:grid;gap:9px;margin:0;padding:0;list-style:none}.content-grid li{color:#52647e;font-size:13px;line-height:1.4}.content-grid li label{display:flex;align-items:flex-start;gap:8px;cursor:pointer}.content-grid li input{width:16px;height:16px;flex:none;margin:1px 0 0;accent-color:#1749ad}.content-grid li :global(svg){flex:none;margin-top:1px;color:#aab5c4}.content-grid li.complete{color:#3d6c55}.content-grid li.complete :global(svg){color:#4f8a6a}.live-card{background:#f5f8fc!important}.live-head{display:flex;align-items:center;justify-content:space-between;gap:8px}.live-head span{padding:4px 6px;border-radius:999px;color:#28734b;background:#e8f7ee;font-size:9px;font-weight:600}.live-metrics{display:grid;gap:7px}.live-metrics div{display:grid;grid-template-columns:1fr auto;gap:2px 8px;padding:8px 0;border-top:1px solid #e6edf5}.live-metrics span{color:#7b899d;font-size:11px}.live-metrics strong{color:#30415d;font-size:13px;font-weight:500}.live-metrics small{grid-column:1/-1;color:#4e8a68;font-size:10px}.record-card{margin-top:12px}.record-list{display:flex;flex-wrap:wrap;gap:7px}.record-list span{padding:6px 8px;border-radius:6px;color:#526b95;background:#edf3fb;font-size:11px}.page-footer,.footer-navigation,.footer-actions{display:flex;gap:10px}.page-footer{justify-content:space-between;margin-top:16px}.primary,.secondary{display:inline-flex;align-items:center;justify-content:center;min-height:39px;padding:0 14px;border-radius:8px;font:inherit;font-size:14px;font-weight:500;cursor:pointer}.primary{border:0;color:#fff;background:#1749ad}.secondary{border:0;color:#40516f;background:#f4f7fb}.primary:disabled,.secondary:disabled{opacity:.55;cursor:not-allowed}.secondary:hover:not(:disabled){background:#eaf0f8}@media(max-width:1100px){.stepper{grid-template-columns:repeat(6,150px)}}@media(max-width:650px){.page-head{flex-direction:column}.guide-badge{align-self:flex-start}.workspace-panel{padding:16px}.content-grid{grid-template-columns:1fr}.page-footer{gap:10px;flex-direction:column}.footer-navigation,.footer-actions{width:100%}.page-footer button{flex:1}}
	.charge-workflow{display:grid;gap:11px}.charge-targets{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.charge-targets div{display:grid;gap:5px;padding:13px 14px;border-radius:9px;background:#f5f8fc}.charge-targets span,.charge-status span{color:#718096;font-size:11px}.charge-targets strong{color:#30415d;font-size:16px;font-weight:500}.charge-targets small{color:#7b899d;font-size:10px}.charge-confirm{display:flex;align-items:flex-start;gap:10px;padding:13px 14px;border-radius:9px;color:#52647e;background:#f7f9fc;cursor:pointer}.charge-confirm input{width:17px;height:17px;flex:none;margin:1px 0 0;accent-color:#1749ad}.charge-confirm span{display:grid;gap:3px}.charge-confirm strong{color:#40516d;font-size:13px;font-weight:500}.charge-confirm small{color:#7b899d;font-size:11px;line-height:1.4}.charge-status{display:grid;gap:10px;padding:14px;border-radius:9px;background:#f0f5fd}.charge-status.ready{background:#edf9f1}.status-head{display:flex;align-items:center;justify-content:space-between;gap:12px}.status-head div{display:grid;gap:3px}.status-head strong{color:#294f91;font-size:14px;font-weight:500}.charge-status.ready .status-head strong,.charge-status.ready .status-head b{color:#28734b}.status-head b{color:#315b9f;font-size:13px;font-weight:500}.live-charge-metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.live-charge-metrics div{display:grid;gap:3px;padding:9px 10px;border-radius:7px;background:rgba(255,255,255,.6)}.live-charge-metrics span{color:#718096;font-size:10px}.live-charge-metrics strong{color:#294f91;font-size:14px;font-weight:500}.live-charge-metrics small{color:#718096;font-size:10px}.live-snapshot-note,.estimate-note{margin:0;color:#657994;font-size:11px;line-height:1.4}.estimate-head{padding-top:1px}.progress{height:6px;overflow:hidden;border-radius:99px;background:#dce7f8}.progress i{display:block;height:100%;border-radius:inherit;background:#3267c4;transition:width .2s ease}.charge-status .secondary{justify-self:start;min-height:32px;font-size:12px}.waiting{display:flex;align-items:center;gap:7px;color:#5e7598;font-size:12px}.waiting i{width:8px;height:8px;border-radius:50%;background:#4778ce;animation:pulse 1.1s ease-in-out infinite}@keyframes pulse{50%{opacity:.3;transform:scale(.7)}}@media(max-width:650px){.charge-targets,.live-charge-metrics{grid-template-columns:1fr}.status-head{align-items:flex-start;flex-direction:column;gap:5px}}
	.progressive-checklist{grid-column:1/-1}.progressive-checklist>p{margin:-3px 0 12px;color:#7b899d;font-size:11px}.progressive-checklist li{display:flex;align-items:flex-start;gap:9px;padding:10px 0;border-top:1px solid #e7edf4}.progressive-checklist .item-number{display:grid;width:20px;height:20px;flex:none;place-items:center;border-radius:50%;color:#5875a3;background:#eaf1fb;font-size:10px;font-weight:600}.progressive-checklist li.complete .item-number{color:#fff;background:#4f8a6a}.progressive-checklist li label{flex:1}
	.float-progress{background:#dceee3}.float-progress i{background:#4f8a6a}.cooldown-progress{background:#dceee3}.cooldown-progress i{background:#4f8a6a}
	.float-settings{overflow:hidden;border-radius:11px;background:#f6f8fb}.float-settings header{display:flex;justify-content:space-between;gap:12px;padding:13px 14px;border-bottom:1px solid #e6edf5}.float-settings header div{display:grid;gap:3px}.float-settings header span,.float-settings header small{color:#718096;font-size:11px}.float-settings header strong{color:#40516d;font-size:13px;font-weight:500}.float-settings-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;padding:14px}.float-settings-grid label{display:grid;gap:5px;color:#718096;font-size:11px}.float-settings-grid label>div{display:flex;align-items:center;gap:6px}.float-settings-grid input{min-width:0;width:100%;min-height:37px;padding:0 9px;border:1px solid #dce4ef;border-radius:7px;color:#34465f;background:#fff;font:inherit}.settings-error{margin:0;padding:0 14px 12px;color:#a13a32;font-size:11px}.float-stable{display:grid;gap:10px;padding:16px;border-radius:11px;background:#f0f5fd}.float-stable.ready{background:#edf9f1}.float-metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:9px}.float-metrics>div{display:grid;gap:4px;padding:10px;border-radius:8px;background:rgba(255,255,255,.72)}.float-metrics span,.float-metrics small{color:#718096;font-size:10px}.float-metrics strong{color:#30415d;font-size:14px;font-weight:500}@media(max-width:650px){.float-settings-grid,.float-metrics{grid-template-columns:1fr}}
	.discharge-workflow{display:grid;gap:11px}.discharge-controls,.discharge-results{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.discharge-results{grid-template-columns:repeat(3,1fr)}.discharge-controls label,.discharge-results label{display:grid;gap:5px;color:#718096;font-size:11px}.discharge-controls input,.discharge-controls select,.discharge-results input,.discharge-results select{width:100%;min-height:38px;padding:0 10px;border:1px solid #dce4ef;border-radius:7px;color:#34465f;background:#fbfcfe;font:inherit;font-size:13px}.discharge-controls input[readonly]{color:#566983;background:#f3f6fa}.safety-banner{display:flex;align-items:flex-start;gap:9px;padding:12px 14px;border-radius:9px;color:#9d473c;background:#fff5f3}.safety-banner svg{flex:none;margin-top:1px}.safety-banner div{display:grid;gap:3px}.safety-banner strong{font-size:13px;font-weight:500}.safety-banner span{font-size:11px;line-height:1.4}.schedule-discharge{justify-self:start;min-height:35px;font-size:12px}.selected-discharge{overflow:hidden;border-radius:9px;background:#f7f9fc}.selected-discharge>header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px}.selected-discharge>header div{display:grid;gap:3px}.selected-discharge>header span{color:#718096;font-size:11px}.selected-discharge>header strong{color:#28734b;font-size:13px;font-weight:500}.selected-discharge>header b{color:#405a7e;font-size:12px;font-weight:500}.discharge-source-note{margin:0;padding:10px 14px;border-top:1px solid #e7edf4;color:#526c91;background:#edf4ff;font-size:11px;line-height:1.45}.start-disabled-reason{display:flex;align-items:flex-start;gap:7px;margin:0;color:#92531d;font-size:11px;line-height:1.4}.start-disabled-reason :global(svg){flex:none;margin-top:1px}.discharge-running{display:flex;align-items:center;gap:8px;padding:11px 14px;border-top:1px solid #e7edf4;color:#607695;font-size:11px}.discharge-running i{width:8px;height:8px;border-radius:50%;background:#4778ce;animation:pulse 1.1s ease-in-out infinite}.discharge-running b{margin-left:auto;color:#3e639e;font-size:12px;font-weight:500}@media(max-width:800px){.discharge-controls{grid-template-columns:1fr 1fr}.discharge-results{grid-template-columns:1fr}}@media(max-width:650px){.discharge-controls{grid-template-columns:1fr}.selected-discharge>header{align-items:flex-start;flex-direction:column}}
	.stage-revalidation-action{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:12px 14px;border:1px solid #ecd9ad;border-radius:9px;color:#7d5726;background:#fff8e9}.stage-revalidation-action>div{display:grid;gap:3px}.stage-revalidation-action strong{font-size:12px;font-weight:600}.stage-revalidation-action span{font-size:11px;line-height:1.4}.stage-revalidation-action button{flex:none}@media(max-width:650px){.stage-revalidation-action{align-items:stretch;flex-direction:column}.stage-revalidation-action button{align-self:flex-start}}
	.recovery-workflow{display:grid;gap:11px}.baseline-measurements{overflow:hidden;border-radius:9px;background:#f5f8fc}.baseline-measurements header{display:flex;align-items:start;justify-content:space-between;gap:12px;padding:13px 14px;border-bottom:1px solid #e6edf5}.baseline-measurements header div{display:grid;gap:3px}.baseline-measurements header span{color:#718096;font-size:11px}.baseline-measurements header strong{color:#40516d;font-size:13px;font-weight:500}.baseline-measurements header small{padding:4px 7px;border-radius:99px;color:#396b50;background:#e6f5eb;font-size:10px}.baseline-measurement-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;padding:13px 14px}.baseline-measurement-grid label{display:grid;grid-template-columns:1fr 17px;gap:5px 8px;align-items:center;color:#5f6f86;font-size:11px}.baseline-measurement-grid label>span{grid-column:1/-1}.baseline-measurement-grid label input[type=number],.loaded-ripple>input{width:100%;min-height:37px;padding:0 9px;border:1px solid #dce4ef;border-radius:7px;color:#34465f;background:#fff;font:inherit;font-size:13px}.baseline-measurement-grid label input[type=checkbox]{width:16px;height:16px;accent-color:#1749ad}.baseline-measurement-grid label small{grid-column:1/-1;color:#8793a5;font-size:10px}.loaded-ripple{display:grid;grid-template-columns:1fr 115px auto;align-items:end;gap:10px;padding:13px 14px;border-radius:9px;background:#f5f8fc;color:#5f6f86;font-size:11px}.loaded-ripple>span{align-self:center}.loaded-ripple label{display:flex;align-items:center;gap:6px;min-height:37px;white-space:nowrap;font-size:11px}.loaded-ripple label input{width:16px;height:16px;accent-color:#1749ad}@media(max-width:800px){.baseline-measurement-grid{grid-template-columns:1fr}.loaded-ripple{grid-template-columns:1fr 120px}}@media(max-width:650px){.loaded-ripple{grid-template-columns:1fr}}
	.summary-workflow{display:grid;gap:12px}.summary-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:13px 14px;border-radius:9px;color:#315b9f;background:#f0f5fd}.summary-heading div{display:grid;gap:4px}.summary-heading div span{font-size:10px;font-weight:600;letter-spacing:.07em}.summary-heading strong{font-size:13px;font-weight:500}.summary-heading>span{padding:5px 8px;border-radius:99px;color:#28734b;background:#e5f5eb;font-size:10px;font-weight:500}.summary-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:9px}.summary-grid article{display:grid;gap:4px;padding:12px;border-radius:8px;background:#f7f9fc}.summary-grid span,.summary-grid small{color:#7b899d;font-size:10px}.summary-grid strong{color:#34465f;font-size:15px;font-weight:500}.summary-confirm{background:#f0f5fd}@media(max-width:800px){.summary-grid{grid-template-columns:repeat(2,1fr)}}@media(max-width:500px){.summary-heading{align-items:flex-start;flex-direction:column}.summary-grid{grid-template-columns:1fr}}
	.stepper button:disabled{cursor:default;opacity:.62}.history-note{align-self:center;color:#7b899d;font-size:12px}.completion-backdrop{position:fixed;inset:0;z-index:50;display:grid;place-items:center;padding:20px;background:rgba(21,39,71,.32)}.completion-dialog{display:grid;justify-items:center;gap:10px;width:min(390px,100%);padding:28px;border-radius:14px;color:#40516d;background:#fff;box-shadow:0 20px 55px rgba(18,35,66,.24);text-align:center}.completion-dialog :global(svg){color:#3d8b5b}.completion-dialog h3{margin:0;color:#263958;font-size:20px;font-weight:500}.completion-dialog p{margin:0;color:#718096;font-size:13px;line-height:1.5}.completion-dialog .primary{margin-top:6px}
	/* Align the guided workflow with the calmer BMS page language: clearer groups, softer surfaces, less visual noise. */
	.workspace-panel{padding:24px;border-color:#edf1f6;box-shadow:0 10px 26px rgba(35,54,89,.04)}
	.action-card{margin-bottom:18px;border-radius:12px;background:#f4f7fc}
	.charge-workflow,.cooldown-workflow,.discharge-workflow,.recovery-workflow,.summary-workflow{gap:14px}
	.charge-targets div,.charge-confirm,.charge-status,.temperature-status,.cooldown-setup,.discharge-controls,.discharge-results,.loaded-ripple,.baseline-measurements,.summary-heading,.summary-grid article{border-radius:11px}
	.charge-targets div,.charge-confirm,.discharge-controls,.discharge-results,.loaded-ripple,.baseline-measurements,.summary-grid article{background:#f6f8fb}
	.charge-confirm{transition:background .16s ease,box-shadow .16s ease}
	.charge-confirm:hover{background:#f1f5fa;box-shadow:inset 0 0 0 1px #e6edf6}
	.charge-status{padding:16px}.temperature-status{padding:16px}.record-card{margin-top:18px;background:#f6f8fb}.record-list span{border-radius:999px;background:#eaf0f8}.summary-grid{gap:10px}.summary-grid article{min-height:75px;padding:14px}
	.discharge-controls label,.discharge-results label,.baseline-measurement-grid label{font-weight:400}.discharge-controls input,.discharge-controls select,.discharge-results input,.discharge-results select,.baseline-measurement-grid label input[type=number],.loaded-ripple>input{border-color:transparent;background:#fff;box-shadow:inset 0 0 0 1px #e4eaf2}.discharge-controls input:focus,.discharge-controls select:focus,.discharge-results input:focus,.discharge-results select:focus,.baseline-measurement-grid label input[type=number]:focus,.loaded-ripple>input:focus{outline:none;box-shadow:inset 0 0 0 1px #7e9fd3,0 0 0 3px rgba(50,99,174,.1)}
	.cooldown-workflow{display:grid;gap:11px}.cooldown-setup{display:grid;grid-template-columns:1fr auto auto auto;align-items:end;gap:12px;padding:14px;border-radius:9px;background:#f4f7fc}.cooldown-setup>div{display:grid;gap:4px}.cooldown-setup span{color:#718096;font-size:11px}.cooldown-setup strong{color:#40516d;font-size:13px;font-weight:500;line-height:1.4}.cooldown-setup label{display:grid;gap:5px}.cooldown-setup label>div{display:flex;align-items:center;gap:6px}.cooldown-setup input{width:66px;min-height:37px;padding:0 9px;border:1px solid #d7dfeb;border-radius:7px;color:#30415d;background:#fff;font:inherit;font-size:13px}.cooldown-setup small{color:#7b899d;font-size:10px}.cooldown-setup .secondary{min-height:37px;font-size:12px}.temperature-status{display:grid;gap:12px;padding:14px;border-radius:9px;background:#edf9f1}.temperature-status.failed{background:#fff4f2}.temperature-metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:9px}.temperature-metrics div{display:grid;gap:4px;padding:10px;border-radius:7px;background:rgba(255,255,255,.72)}.temperature-metrics span{color:#718096;font-size:10px}.temperature-metrics strong{color:#30415d;font-size:13px;font-weight:500}.duration-note,.timeout-note{margin:0;color:#6e7d93;font-size:11px;line-height:1.45}.duration-note b{color:#52647e;font-weight:500}.timeout-note{padding:8px 10px;border-radius:7px;color:#a74c3e;background:rgba(255,255,255,.55)}.manual-approval{display:grid;gap:9px;padding:14px;border-radius:9px;color:#815523;background:#fff8ea}.manual-approval strong{font-size:13px;font-weight:500}.manual-approval span{font-size:11px;line-height:1.45}.manual-approval input{width:100%;min-height:37px;padding:0 10px;border:1px solid #e5cf9e;border-radius:7px;color:#40516f;background:#fff;font:inherit;font-size:12px}.exception-confirm{display:flex;align-items:flex-start;gap:8px;padding:9px 10px;border-radius:7px;color:#6f4b20;background:rgba(255,255,255,.58);font-size:11px;line-height:1.4;cursor:pointer}.exception-confirm input{width:15px;height:15px;flex:none;margin:1px 0 0;accent-color:#b67a21}.manual-approval .secondary{justify-self:start;min-height:32px;font-size:12px}@media(max-width:650px){.cooldown-setup{grid-template-columns:1fr;align-items:stretch}.cooldown-setup label{justify-content:start}.temperature-metrics{grid-template-columns:1fr}}
	.footer-actions{display:flex;justify-content:flex-end;gap:8px}.warning-text{color:#946019}.danger-text{color:#a13a32}.float-stable-warning,.process-runtime-warning{display:flex;align-items:flex-start;gap:9px;padding:11px 12px;border-radius:8px;color:#87541d;background:#fff8e8}.float-stable-warning :global(svg),.process-runtime-warning :global(svg){flex:none;margin-top:1px}.float-stable-warning div,.process-runtime-warning div{display:grid;gap:3px}.float-stable-warning strong,.process-runtime-warning strong{font-size:12px;font-weight:600}.float-stable-warning span,.float-stable-warning small,.process-runtime-warning span{font-size:11px;line-height:1.4}.float-stable-warning small{color:#806b50}.process-runtime-warning span b{font-weight:600}.action-dialog{justify-items:stretch;text-align:left}.action-dialog :global(svg){justify-self:center;color:#a56b22}.action-dialog label{display:grid;gap:5px;color:#52647e;font-size:12px}.action-dialog input:not([type=checkbox]){width:100%;min-height:37px;padding:0 10px;border:1px solid #d7dfeb;border-radius:7px;color:#30415d;background:#fff;font:inherit}.action-dialog>div{display:flex;justify-content:flex-end;gap:8px}.action-dialog .action-ack{display:flex;align-items:flex-start;gap:8px;line-height:1.4}.action-dialog .action-ack input{width:16px;height:16px;margin:0;accent-color:#b67a21}@media(max-width:650px){.footer-actions{width:100%;flex-wrap:wrap}.footer-actions button{flex:1}}
</style>
