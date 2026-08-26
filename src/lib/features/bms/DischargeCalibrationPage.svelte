<script lang="ts">
	import { onMount } from 'svelte';
	import { AlertTriangle, BatteryCharging, CheckCircle2, ClipboardList, Play, RefreshCw, ShieldAlert } from '@lucide/svelte';
	import CalibrationEventManagement from './CalibrationEventManagement.svelte';
	import CalibrationEventReport from './CalibrationEventReport.svelte';
	import InitialBaselinePreview from './InitialBaselinePreview.svelte';
	import { initialBaselineStep, type InitialBaselineRealAdapter } from './initial-baseline-real';
	import BmsCompactCellVoltageTable from './BmsCompactCellVoltageTable.svelte';
	import { createInitialBaselineDemoTicket, loadInitialBaselineDemoTicket, removeInitialBaselineDemoTicket as clearInitialBaselineDemoTicket, saveInitialBaselineDemoTicket, type InitialBaselineDemoTicket } from './initial-baseline-demo';
	import { formatCalibrationTime } from '$lib/services/calibration-time';
	import {
		appendCalibrationEvidence,
		configureCalibrationFloatStablePolicy,
		configureCalibrationDemoTimeScale,
		configureCalibrationDischargeSampling,
		createCalibrationEvent,
		executeCalibrationStageAction,
		getCalibrationEvent,
		getDischargeConfig,
		getBmsStringTelemetry,
		listBmsStrings,
		listCalibrationEvents,
		loadCalibrationHistory,
		loadCalibrationSamples,
		monthlyInspectionAssessment,
		redoCalibrationStage,
		startCalibrationEvent,
		startCalibrationProcess,
		completeCalibrationProcess,
		type BatteryString,
		type BmsStringTelemetry,
		type CalibrationAllowedAction,
		type CalibrationEventDetail,
		type CalibrationEventSummary,
		type CalibrationStage, type CalibrationManualEvidence, type CalibrationSample,
		type DischargeCurrentDirection
	} from '$lib/services/bms-api';

	let strings = $state<BatteryString[]>([]);
	let selectedStringIndex = $state(0);
	let currentDirection = $state<DischargeCurrentDirection>('NEGATIVE');
	let events = $state<CalibrationEventSummary[]>([]);
	let selectedEventId = $state(0);
	let event = $state<CalibrationEventDetail | null>(null);
	let liveTelemetry = $state<BmsStringTelemetry | null>(null);
	let initialBaselineEvidence = $state<CalibrationManualEvidence[]>([]);
	let initialBaselineSamples = $state<CalibrationSample[]>([]);
	let cellVoltagesExpanded = $state(false);
	let loading = $state(true);
	let mutating = $state(false);
	let refreshing = $state(false);
	let error = $state('');
	let notice = $state('');
	let evidenceValues = $state<Record<string, string>>({});
	let evidenceStatuses = $state<Record<string, 'PASS' | 'FAIL'>>({});
	let actionReason = $state('');
	let acknowledgedItems = $state<string[]>([]);
	let viewedStageId = $state<number | null>(null);
	let pendingDangerAction = $state<CalibrationAllowedAction | null>(null);
	let redoConfirmation = $state(false);
	let redoReason = $state('');
	let workflowOpen = $state(false);
	let reportOpen = $state(false);
	let baselinePreviewOpen = $state(false);
	let initialBaselineTicket = $state<InitialBaselineDemoTicket | null>(null);
	let selectedCreateType = $state<'INITIAL_BASELINE' | 'MONTHLY_INSPECTION'>('MONTHLY_INSPECTION');
	let selectedString = $derived(strings.find((item) => item.stringIndex === selectedStringIndex) ?? null);
	let currentStage = $derived(event?.stages.find((stage) => stage.calibrationStageId === event?.currentStageId) ?? null);
	let viewedStage = $derived(event?.stages.find((stage) => stage.calibrationStageId === viewedStageId) ?? currentStage);
	let continueAction = $derived(event?.allowedActions.find((action) => action.actionCode === 'COMPLETE_STAGE') ?? null);
	let viewingCurrentStage = $derived(!!viewedStage && viewedStage.calibrationStageId === event?.currentStageId);
	let stageIsMutable = $derived(viewingCurrentStage && !event?.closedAt && !!viewedStage
		&& !['NOT_STARTED', 'COMPLETED', 'SKIPPED', 'FAILED'].includes(viewedStage.state));
	let canRedoViewedStage = $derived(!!event && !!viewedStage && !!currentStage && !event.closedAt
		&& ['ACTIVE', 'BLOCKED', 'REVALIDATION_REQUIRED'].includes(event.status)
		&& viewedStage.state === 'COMPLETED' && viewedStage.order < currentStage.order);
	let initialBaselineRedoStage = $derived(event?.eventType === 'INITIAL_BASELINE' && currentStage
		? event.stages.filter((stage) => stage.state === 'COMPLETED' && stage.order < currentStage.order).at(-1) ?? null
		: null);
	let canRedoInitialBaselineStage = $derived(!!event && !!currentStage && !!initialBaselineRedoStage && !event.closedAt
		&& ['ACTIVE', 'BLOCKED', 'REVALIDATION_REQUIRED'].includes(event.status));
	let realInitialBaselineTicket = $derived(event?.eventType === 'INITIAL_BASELINE' ? mapRealInitialBaselineTicket(event, initialBaselineEvidence, initialBaselineSamples) : null);
	let realInitialBaselineAdapter = $derived<InitialBaselineRealAdapter | null>(event?.eventType === 'INITIAL_BASELINE' ? {
		event, evidence: initialBaselineEvidence, samples: initialBaselineSamples, telemetry: liveTelemetry, busy: loading || mutating,
		onEvidence: recordRealInitialBaselineEvidence, onStartProcess: startRealInitialBaselineProcess,
		onConfigureDemoTimeScale: configureRealInitialBaselineDemoTimeScale,
		onConfigureDischargeSampling: configureRealInitialBaselineDischargeSampling,
		onConfigureFloatStablePolicy: configureRealInitialBaselineFloatStablePolicy,
		onStartControlledDischarge: startRealInitialBaselineControlledDischarge,
		onCompleteProcess: completeRealInitialBaselineProcess, onContinue: continueRealInitialBaseline,
		onExecuteAction: executeRealInitialBaselineAction, onRedoStage: redoRealInitialBaselineStage,
		canRedoStage: canRedoInitialBaselineStage
	} : null);

	onMount(() => {
		void initialise();
		const timer = window.setInterval(() => { void refreshFromServer(); }, 2000);
		return () => window.clearInterval(timer);
	});

	async function initialise() {
		loading = true;
		error = '';
		try {
			const [availableStrings, config] = await Promise.all([listBmsStrings(), getDischargeConfig()]);
			strings = availableStrings;
			currentDirection = config.dischargeCurrentDirection;
			selectedStringIndex = strings[0]?.stringIndex ?? 0;
			initialBaselineTicket = selectedStringIndex ? loadInitialBaselineDemoTicket(selectedStringIndex) : null;
			if (selectedStringIndex) await loadLatest();
		} catch (cause) {
			error = message(cause);
		} finally {
			loading = false;
		}
	}

	async function selectString() {
		workflowOpen = false;
		reportOpen = false;
		baselinePreviewOpen = false;
		initialBaselineTicket = selectedStringIndex ? loadInitialBaselineDemoTicket(selectedStringIndex) : null;
		event = null;
		liveTelemetry = null;
		events = [];
		selectedEventId = 0;
		viewedStageId = null;
		notice = '';
		error = '';
		if (selectedStringIndex) await loadLatest();
	}

	async function loadLatest() {
		loading = true;
		error = '';
		try {
			[events, liveTelemetry] = await Promise.all([
				listCalibrationEvents(selectedStringIndex), getBmsStringTelemetry(selectedStringIndex)
			]);
			const latest = events[0];
			if (latest) {
				applyEvent(await getCalibrationEvent(latest.calibrationEventId), true);
			} else {
				event = null;
				selectedEventId = 0;
				viewedStageId = null;
			}
		} catch (cause) {
			error = message(cause);
		} finally {
			loading = false;
		}
	}

	async function selectEvent() {
		if (!selectedEventId || loading || mutating) return;
		loading = true;
		error = '';
		notice = '';
		try {
			const detail = await getCalibrationEvent(selectedEventId);
			applyEvent(detail, true);
			workflowOpen = opensStageWorkflow(detail);
			reportOpen = detail.closedAt !== null;
		} catch (cause) {
			selectedEventId = event?.calibrationEventId ?? 0;
			error = message(cause);
		} finally {
			loading = false;
		}
	}

	function applyEvent(detail: CalibrationEventDetail, resetViewedStage = false, syncReadback = true) {
		event = detail;
		selectedEventId = detail.calibrationEventId;
		const existing = events.findIndex((item) => item.calibrationEventId === detail.calibrationEventId);
		events = existing < 0 ? [detail, ...events] : events.map((item, index) => index === existing ? detail : item);
		if (resetViewedStage) {
			viewedStageId = detail.currentStageId;
			pendingDangerAction = null;
		} else if (pendingDangerAction) {
			pendingDangerAction = detail.allowedActions.find((action) => action.actionCode === pendingDangerAction?.actionCode) ?? null;
		}
		if (syncReadback && detail.eventType === 'INITIAL_BASELINE') void syncInitialBaselineReadback(detail);
	}

	async function syncInitialBaselineReadback(detail: CalibrationEventDetail) {
		try {
			const [history, samples] = await Promise.all([
				loadCalibrationHistory(detail.calibrationEventId), loadCalibrationSamples(detail.calibrationEventId)
			]);
			if (event?.calibrationEventId !== detail.calibrationEventId || event.eventVersion !== detail.eventVersion) return;
			initialBaselineEvidence = history.evidence;
			initialBaselineSamples = samples;
		} catch (cause) {
			if (event?.calibrationEventId === detail.calibrationEventId) error = message(cause);
		}
	}

	async function createDraft() {
		if (!selectedStringIndex || mutating) return;
		mutating = true;
		error = '';
		notice = '';
		try {
			const created = selectedCreateType === 'INITIAL_BASELINE'
				? await createCalibrationEvent({ stringIndex: selectedStringIndex, eventType: 'INITIAL_BASELINE', currentDirection, dischargeMethod: 'C10', dischargeEndpointMode: 'FULL_CUTOFF' })
				: await createCalibrationEvent({ stringIndex: selectedStringIndex, eventType: 'MONTHLY_INSPECTION', currentDirection });
			applyEvent(created, true);
			workflowOpen = false;
			notice = `Draft event ${created.calibrationEventId} was created.`;
		} catch (cause) {
			error = message(cause);
		} finally {
			mutating = false;
		}
	}

	function changeCreateType(eventType: 'INITIAL_BASELINE' | 'MONTHLY_INSPECTION') {
		selectedCreateType = eventType;
	}

	function createSelectedEvent(eventType: 'INITIAL_BASELINE' | 'MONTHLY_INSPECTION') {
		void createDraft();
	}

	function updateInitialBaselineTicket(ticket: InitialBaselineDemoTicket) {
		initialBaselineTicket = ticket;
		saveInitialBaselineDemoTicket(ticket);
	}

	function startInitialBaselineDemo() {
		if (!selectedString) return;
		const existing = loadInitialBaselineDemoTicket(selectedString.stringIndex);
		initialBaselineTicket = existing ?? createInitialBaselineDemoTicket(selectedString.stringIndex, selectedString.stringName);
		saveInitialBaselineDemoTicket(initialBaselineTicket);
		baselinePreviewOpen = true;
		workflowOpen = false;
		reportOpen = false;
		error = '';
	}

	function resumeInitialBaselineTicket() {
		if (!initialBaselineTicket) return;
		baselinePreviewOpen = true;
		reportOpen = false;
		workflowOpen = false;
	}

	function removeInitialBaselineTicket() {
		if (!initialBaselineTicket) return;
		clearInitialBaselineDemoTicket(initialBaselineTicket.stringIndex);
		initialBaselineTicket = null;
		notice = 'Initial Baseline demo ticket was removed.';
	}

	async function startEvent() {
		if (!event || event.status !== 'DRAFT' || loading || mutating) return;
		const previous = event;
		mutating = true;
		error = '';
		notice = '';
		try {
			const started = await startCalibrationEvent(previous.calibrationEventId, previous.eventVersion);
			applyEvent(started, true);
			workflowOpen = opensStageWorkflow(started);
			notice = `Event ${event.calibrationEventId} started at version ${event.eventVersion}.`;
		} catch (cause) {
			await recoverAfterMutationFailure(cause, previous);
		} finally {
			mutating = false;
		}
	}

	async function startDraftFromManagement(calibrationEventId: number) {
		if (loading || mutating) return;
		loading = true;
		error = '';
		notice = '';
		try {
			const draft = event?.calibrationEventId === calibrationEventId
				? event
				: await getCalibrationEvent(calibrationEventId);
			applyEvent(draft, true);
			// startEvent owns the mutation guard; loading only protects the lookup.
			loading = false;
			await startEvent();
		} catch (cause) {
			error = message(cause);
		} finally {
			loading = false;
		}
	}

	function changeString(value: number) {
		selectedStringIndex = value;
		void selectString();
	}

	function changeSelectedEvent(value: number) {
		selectedEventId = value;
		void selectEvent();
	}

	function returnToManagement() {
		workflowOpen = false;
		reportOpen = false;
		baselinePreviewOpen = false;
		viewCurrentStage();
	}

	async function reloadEvent() {
		if (!event || loading) return;
		loading = true;
		error = '';
		notice = '';
		try {
			const [detail, telemetry] = await Promise.all([
				getCalibrationEvent(event.calibrationEventId), getBmsStringTelemetry(selectedStringIndex)
			]);
			applyEvent(detail);
			liveTelemetry = telemetry;
			if (!opensStageWorkflow(detail)) workflowOpen = false;
			notice = 'Event state reloaded from the server.';
		} catch (cause) {
			error = message(cause);
		} finally {
			loading = false;
		}
	}

	async function refreshFromServer() {
		if (!event || loading || mutating || refreshing || event.closedAt) return;
		const eventId = event.calibrationEventId;
		refreshing = true;
		try {
			const [refreshed, telemetry] = await Promise.all([
				getCalibrationEvent(eventId), getBmsStringTelemetry(selectedStringIndex)
			]);
			liveTelemetry = telemetry;
			if (event?.calibrationEventId === eventId && !loading && !mutating) {
				applyEvent(refreshed);
				if (!opensStageWorkflow(refreshed)) workflowOpen = false;
			}
		} catch {
			// A background refresh must not replace an actionable operator error.
		} finally {
			refreshing = false;
		}
	}

	async function recoverAfterMutationFailure(cause: unknown, previous: CalibrationEventDetail) {
		const failure = message(cause);
		try {
			applyEvent(await getCalibrationEvent(previous.calibrationEventId));
		} catch {
			event = previous;
		}
		error = failure;
	}

	function viewStage(stage: CalibrationStage) {
		if (stage.calibrationStageId === event?.currentStageId || stage.state === 'COMPLETED' || stage.state === 'SKIPPED') {
			viewedStageId = stage.calibrationStageId;
			redoConfirmation = false;
			redoReason = '';
		}
	}

	function viewPreviousStage() {
		if (!event || !viewedStage) return;
		const previous = event.stages.filter((stage) => stage.order < viewedStage.order && (stage.state === 'COMPLETED' || stage.state === 'SKIPPED')).at(-1);
		if (previous) viewedStageId = previous.calibrationStageId;
	}

	function viewCurrentStage() {
		if (event?.currentStageId) viewedStageId = event.currentStageId;
		redoConfirmation = false;
		redoReason = '';
	}

	function requestRedoStage() {
		redoConfirmation = true;
	}

	function cancelRedoStage() {
		redoConfirmation = false;
		redoReason = '';
	}

	async function redoViewedStage() {
		if (!event || !viewedStage || !canRedoViewedStage || !redoReason.trim() || mutating) return;
		const previous = event;
		mutating = true;
		error = '';
		notice = '';
		try {
			applyEvent(await redoCalibrationStage(event.calibrationEventId, viewedStage.calibrationStageId,
				event.eventVersion, redoReason), true);
			redoConfirmation = false;
			redoReason = '';
			notice = `Stage reopened by the server at event version ${event.eventVersion}.`;
		} catch (cause) {
			await recoverAfterMutationFailure(cause, previous);
		} finally {
			mutating = false;
		}
	}

	function evidenceTypes(stage: CalibrationStage | null) {
		if (!stage) return [];
		return ({
			PREREQUISITES: ['PREREQUISITES_CONFIRMATION'],
			INITIAL_CHARGE: ['CHARGER_BOOST_CONFIRMATION'],
			PRE_DISCHARGE_FLOAT: ['CHARGER_FLOAT_CONFIRMATION'],
			WAITING_FOR_LOAD: ['LOAD_CONNECTED_CONFIRMATION'],
			LOAD_DISCONNECT: ['LOAD_DISCONNECTED_CONFIRMATION'],
			RECHARGE: ['CHARGER_BOOST_CONFIRMATION'],
			POST_RECHARGE_FLOAT: ['CHARGER_FLOAT_CONFIRMATION'],
			BASELINE_CAPTURE: ['MIDPOINT_VOLTAGE', 'RIPPLE_BEFORE_LOAD', 'RIPPLE_AFTER_LOAD', 'CHARGER_OUTPUT_VOLTAGE', 'CHARGER_OUTPUT_CURRENT'],
			MONTHLY_INSPECTION: ['HVAC_INSPECTION', 'CONNECTOR_INSPECTION', 'CORROSION_INSPECTION', 'CASE_INSPECTION', 'GROUND_IMBALANCE_INSPECTION'],
			SIX_MONTH_INSPECTION: ['RIPPLE_BEFORE_LOAD', 'RIPPLE_AFTER_LOAD', 'LINKED_PERIODIC_CAPACITY_RECORD'],
			COMPLETION: ['RETURN_TO_SERVICE_CONFIRMATION']
		} as Record<string, string[]>)[stage.type] ?? [];
	}

	function recordedEvidence(stage: CalibrationStage | null) {
		const value = stage?.properties?.manualEvidenceTypes;
		return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
	}

	function legacyEvidenceTypes(stage: CalibrationStage | null) {
		const editable = new Set(evidenceTypes(stage));
		return recordedEvidence(stage).filter((type) => !editable.has(type));
	}

	function missingEvidenceFor(stage: CalibrationStage | null) {
		if (!event || !stage) return [];
		const owned = new Set(evidenceTypes(stage));
		return event.missingEvidence.filter((type) => owned.has(type));
	}

	async function recordEvidence(evidenceType: string) {
		if (!event || !currentStage || !stageIsMutable || mutating) return;
		mutating = true;
		error = '';
		notice = '';
		try {
			const input = evidenceValues[evidenceType]?.trim();
			applyEvent(await appendCalibrationEvidence({
				calibrationEventId: event.calibrationEventId,
				calibrationStageId: currentStage.calibrationStageId,
				expectedEventVersion: event.eventVersion,
				evidenceType,
				status: evidenceStatuses[evidenceType] ?? 'PASS',
				...(evidenceType === 'MIDPOINT_VOLTAGE' && input ? { numericValue: Number(input), unit: 'V' } : { textValue: input || 'Confirmed' })
			}));
			evidenceValues = { ...evidenceValues, [evidenceType]: '' };
			notice = `${evidenceType} was saved at event version ${event.eventVersion}.`;
		} catch (cause) {
			await recoverAfterMutationFailure(cause, event);
		} finally {
			mutating = false;
		}
	}

	function mapRealInitialBaselineTicket(detail: CalibrationEventDetail, evidence: CalibrationManualEvidence[], samples: CalibrationSample[]): InitialBaselineDemoTicket {
		const seed = createInitialBaselineDemoTicket(selectedStringIndex, selectedString?.stringName ?? detail.configuration.stringKey);
		const has = (type: string) => evidence.some((item) => item.evidenceType === type && ['PASS', 'RECORDED'].includes(item.status));
		const process = (type: string) => detail.processes.find((item) => item.type === type);
		const completed = (type: string) => process(type)?.state === 'COMPLETED';
		const vocProcess = process('VOC_BASELINE_CAPTURE');
		const voc = vocProcess?.state === 'COMPLETED' ? samples.filter((item) => item.calibrationProcessId === vocProcess.calibrationProcessId
			&& item.processAttemptNumber === vocProcess.attemptNumber && item.persistenceReason === 'FINAL_SNAPSHOT').sort((a, b) => a.sampleId - b.sampleId).at(-1) : null;
		const ripple = evidence.filter((item) => item.evidenceType === 'RIPPLE_AFTER_LOAD' && item.numericValue != null).at(-1)?.numericValue;
		return {
			...seed, id: `#${detail.calibrationEventId}`, currentStep: initialBaselineStep(detail),
			status: detail.closedAt ? 'COMPLETED' : 'IN_PROGRESS', completedAt: detail.closedAt ? Date.parse(detail.closedAt) : null,
			floatStableDurationMinutes: detail.configuration.floatStableDurationMinutes,
			floatVoltageToleranceV: detail.configuration.floatVoltageToleranceV,
			floatCurrentMinA: detail.configuration.floatCurrentMinA,
			floatCurrentMaxA: detail.configuration.floatCurrentMaxA,
			initialSettingsVerified: has('CHARGE_SETPOINTS_REVIEWED'),
			boostStartedAt: process('BOOST_CHARGE_TO_VBOOST')?.state === 'NOT_STARTED' ? null : 1,
			boostConfirmed: has('BOOST_TARGET_REVIEWED'), boostConfirmedAt: completed('BOOST_CHARGE_TO_VBOOST') ? 1 : null,
			floatStableStartedAt: process('FLOAT_SETTLEMENT_TO_VFLOAT')?.state === 'NOT_STARTED' ? null : 1,
			floatConfirmed: has('FLOAT_MODE_REVIEWED'), cooldownStartedAt: process('COOL_DOWN_TO_AMBIENT')?.state === 'NOT_STARTED' ? null : 1,
			recoveryMcbClosed: has('RECOVERY_CHARGER_MCB_CLOSED_CONFIRMED'), recoverySettingsVerified: has('RECOVERY_CHARGE_SETPOINTS_REVIEWED'),
			recoveryStartedAt: process('RECOVERY_CHARGE_TO_VBOOST')?.state === 'NOT_STARTED' ? null : 1,
			recoveryFloatStartedAt: process('RECOVERY_FLOAT_STABILIZATION')?.state === 'NOT_STARTED' ? null : 1,
			recoveryFloatStableStartedAt: process('RECOVERY_FLOAT_STABILIZATION')?.state === 'NOT_STARTED' ? null : 1,
			recoveryFloatConfirmed: has('RECOVERY_FLOAT_STABILITY_REVIEWED'), resistanceMeasured: has('CELL_RESISTANCE_SAMPLE_REVIEWED'),
			loadConnectedForRipple: has('LOAD_CONNECTED_CONFIRMATION'), rippleWithLoad: ripple == null ? '' : String(ripple),
			rippleWithLoadMeasured: has('RIPPLE_AFTER_LOAD'), chargerOpenedForVoc: has('CHARGER_MCB_OPEN_CONFIRMATION'),
			vocCaptureStartedAt: voc?.measurementTime ? Date.parse(voc.measurementTime) : null,
			vocSnapshot: voc ? { capturedAt: Date.parse(voc.measurementTime ?? voc.createdAt ?? '') || Date.now(), stringVoltageV: voc.stringVoltageV ?? 0,
				cells: voc.cells.map((cell) => ({ cellId: cell.cellIndex, voltageV: cell.voltageV ?? 0 })) } : null,
			vocBaselineConfirmed: has('VOC_BASELINE_CONFIRMATION')
		};
	}

	async function recordRealInitialBaselineEvidence(type: string, value?: number, unit?: string, sampleId?: number) {
		if (!event || !currentStage || event.eventType !== 'INITIAL_BASELINE' || mutating) return;
		const previous = event;
		mutating = true;
		error = '';
		try {
			const updated = await appendCalibrationEvidence({ calibrationEventId: event.calibrationEventId,
				calibrationStageId: currentStage.calibrationStageId, expectedEventVersion: event.eventVersion,
				evidenceType: type, status: 'PASS', ...(value !== undefined ? { numericValue: value, unit } : { textValue: 'Confirmed' }),
				...(sampleId !== undefined ? { calibrationSampleId: sampleId } : {}) });
			applyEvent(updated, false, false);
			// Keep the checkbox and dependent controls tied to persisted readback. In
			// particular, the discharge panel appears only after TEST_LOAD_CONNECTED
			// can be read from the append-only evidence history.
			await syncInitialBaselineReadback(updated);
		} catch (cause) { await recoverAfterMutationFailure(cause, previous); }
		finally { mutating = false; }
	}

	async function configureRealInitialBaselineDemoTimeScale(factor: 1 | 60) {
		if (!event || !currentStage || event.eventType !== 'INITIAL_BASELINE'
			|| currentStage.type !== 'PREREQUISITES' || mutating) return;
		const previous = event;
		mutating = true;
		error = '';
		try {
			applyEvent(await configureCalibrationDemoTimeScale({
				calibrationEventId: event.calibrationEventId,
				calibrationStageId: currentStage.calibrationStageId,
				expectedEventVersion: event.eventVersion,
				demoTimeScaleFactor: factor
			}));
		} catch (cause) { await recoverAfterMutationFailure(cause, previous); }
		finally { mutating = false; }
	}

	async function configureRealInitialBaselineDischargeSampling(minutes: number) {
		if (!event || !currentStage || event.eventType !== 'INITIAL_BASELINE'
			|| currentStage.type !== 'WAITING_FOR_LOAD' || mutating) return;
		const previous = event;
		mutating = true;
		error = '';
		try {
			applyEvent(await configureCalibrationDischargeSampling({
				calibrationEventId: event.calibrationEventId,
				calibrationStageId: currentStage.calibrationStageId,
				expectedEventVersion: event.eventVersion,
				dischargeSamplingIntervalMinutes: minutes
			}));
		} catch (cause) { await recoverAfterMutationFailure(cause, previous); }
		finally { mutating = false; }
	}

	async function configureRealInitialBaselineFloatStablePolicy(policy: {
		durationMinutes: number; voltageToleranceV: number; currentMinA: number; currentMaxA: number;
	}) {
		if (!event || !currentStage || event.eventType !== 'INITIAL_BASELINE'
			|| currentStage.type !== 'INITIAL_CHARGE' || mutating) return;
		const previous = event;
		mutating = true;
		error = '';
		try {
			applyEvent(await configureCalibrationFloatStablePolicy({
				calibrationEventId: event.calibrationEventId,
				calibrationStageId: currentStage.calibrationStageId,
				expectedEventVersion: event.eventVersion,
				floatStableDurationMinutes: policy.durationMinutes,
				floatVoltageToleranceV: policy.voltageToleranceV,
				floatCurrentMinA: policy.currentMinA,
				floatCurrentMaxA: policy.currentMaxA
			}));
		} catch (cause) { await recoverAfterMutationFailure(cause, previous); }
		finally { mutating = false; }
	}

	async function mutateRealInitialBaselineProcess(type: string, complete: boolean) {
		if (!event || !currentStage || mutating) return;
		const process = event.processes.find((item) => item.type === type && item.calibrationStageId === currentStage.calibrationStageId);
		if (!process || (!complete && process.state !== 'NOT_STARTED') || (complete && process.state !== 'ACTIVE')) return;
		const previous = event;
		mutating = true; error = '';
		try {
			applyEvent(complete
				? await completeCalibrationProcess(event.calibrationEventId, currentStage.calibrationStageId, process.calibrationProcessId, event.eventVersion)
				: await startCalibrationProcess(event.calibrationEventId, currentStage.calibrationStageId, process.calibrationProcessId, event.eventVersion));
		} catch (cause) { await recoverAfterMutationFailure(cause, previous); }
		finally { mutating = false; }
	}

	function startRealInitialBaselineProcess(type: string) { void mutateRealInitialBaselineProcess(type, false); }

	async function startRealInitialBaselineControlledDischarge() {
		if (!event || !currentStage || event.eventType !== 'INITIAL_BASELINE' || mutating) return;
		if (!['WAITING_FOR_LOAD', 'DISCHARGE'].includes(currentStage.type)) return;
		const previous = event;
		let accepted = event;
		mutating = true;
		error = '';
		notice = '';
		try {
			if (currentStage.type === 'WAITING_FOR_LOAD') {
				const complete = event.allowedActions.find((action) => action.actionCode === 'COMPLETE_STAGE');
				if (!complete?.enabled) return;
				accepted = await executeCalibrationStageAction(event.calibrationEventId,
					currentStage.calibrationStageId, complete.actionCode, event.eventVersion);
			}
			const dischargeStage = accepted.stages.find((stage) => stage.calibrationStageId === accepted.currentStageId);
			const process = accepted.processes.find((item) => item.type === 'CONTROLLED_DISCHARGE'
				&& item.calibrationStageId === dischargeStage?.calibrationStageId);
			if (dischargeStage?.type !== 'DISCHARGE' || process?.state !== 'NOT_STARTED') {
				throw new Error('Backend did not expose a startable CONTROLLED_DISCHARGE process.');
			}
			const started = await startCalibrationProcess(accepted.calibrationEventId,
				dischargeStage.calibrationStageId, process.calibrationProcessId, accepted.eventVersion);
			// Do not render an intermediate lifecycle. Both versioned mutations have
			// succeeded, so only the final authoritative response is applied.
			applyEvent(started, true);
			notice = `Controlled discharge started at event version ${started.eventVersion}.`;
		} catch (cause) {
			const failure = message(cause);
			try {
				applyEvent(await getCalibrationEvent(previous.calibrationEventId), true);
			} catch {
				// If stage completion succeeded but the follow-up call or reload failed,
				// retain the newest response we actually received, never the stale input.
				applyEvent(accepted, true);
			}
			error = failure;
		} finally {
			mutating = false;
		}
	}
	function completeRealInitialBaselineProcess(type: string) { void mutateRealInitialBaselineProcess(type, true); }
	function continueRealInitialBaseline() {
		const action = event?.allowedActions.find((item) => item.actionCode === 'COMPLETE_STAGE');
		if (action) void executeAction(action);
	}

	async function executeRealInitialBaselineAction(action: CalibrationAllowedAction, reason: string, acknowledged: string[]) {
		if (!event || !currentStage || event.eventType !== 'INITIAL_BASELINE' || mutating || !action.enabled
			|| (action.requiresReason && !reason.trim())
			|| (action.requiresAcknowledgement && !action.acknowledgementItems.every((item) => acknowledged.includes(item)))) return;
		const previous = event;
		mutating = true;
		error = '';
		notice = '';
		try {
			applyEvent(await executeCalibrationStageAction(event.calibrationEventId, currentStage.calibrationStageId,
				action.actionCode, event.eventVersion, reason, acknowledged), true);
		} catch (cause) { await recoverAfterMutationFailure(cause, previous); }
		finally { mutating = false; }
	}

	async function redoRealInitialBaselineStage(reason: string) {
		if (!event || !initialBaselineRedoStage || !canRedoInitialBaselineStage || !reason.trim() || mutating) return;
		const previous = event;
		mutating = true;
		error = '';
		notice = '';
		try {
			applyEvent(await redoCalibrationStage(event.calibrationEventId, initialBaselineRedoStage.calibrationStageId,
				event.eventVersion, reason), true);
		} catch (cause) { await recoverAfterMutationFailure(cause, previous); }
		finally { mutating = false; }
	}

	function actionReady(action: CalibrationAllowedAction) {
		return action.enabled && (!action.requiresReason || actionReason.trim().length > 0)
			&& (!action.requiresAcknowledgement || action.acknowledgementItems.every((item) => acknowledgedItems.includes(item)));
	}

	function toggleAcknowledgement(item: string, checked: boolean) {
		acknowledgedItems = checked ? [...new Set([...acknowledgedItems, item])] : acknowledgedItems.filter((value) => value !== item);
	}

	async function executeAction(action: CalibrationAllowedAction) {
		if (!event || !currentStage || !stageIsMutable || mutating || !actionReady(action)) return;
		mutating = true;
		error = '';
		notice = '';
		try {
			const detail = await executeCalibrationStageAction(event.calibrationEventId, currentStage.calibrationStageId,
				action.actionCode, event.eventVersion, actionReason, acknowledgedItems);
			applyEvent(detail, true);
			workflowOpen = opensStageWorkflow(detail);
			reportOpen = detail.closedAt !== null;
			actionReason = '';
			acknowledgedItems = [];
			notice = `${action.label} succeeded. The server returned event version ${event.eventVersion}.`;
		} catch (cause) {
			await recoverAfterMutationFailure(cause, event);
		} finally {
			mutating = false;
		}
	}

	function requestAction(action: CalibrationAllowedAction) {
		if (!actionReady(action)) return;
		if (action.intent === 'DANGER') {
			pendingDangerAction = action;
			return;
		}
		void executeAction(action);
	}

	function confirmDangerAction() {
		if (pendingDangerAction) void executeAction(pendingDangerAction);
	}

	function detailLines(value: unknown): string[] {
		if (value == null) return [];
		if (Array.isArray(value)) return value.map((item) => typeof item === 'string' ? item : JSON.stringify(item));
		if (typeof value === 'object') return Object.entries(value).map(([key, item]) => `${key}: ${typeof item === 'string' ? item : JSON.stringify(item)}`);
		return [String(value)];
	}

	function telemetrySequenceMismatch(monthly: ReturnType<typeof monthlyInspectionAssessment>) {
		return liveTelemetry?.calculation.snapshotSequence == null || monthly.snapshotSequence === null
			|| liveTelemetry.calculation.snapshotSequence !== monthly.snapshotSequence;
	}

	function liveCellsIncomplete() {
		if (!liveTelemetry) return true;
		const expected = selectedString?.cellQty ?? liveTelemetry.cellQty;
		if (!Number.isInteger(expected) || expected < 1 || liveTelemetry.cells.length !== expected) return true;
		const cells = new Map(liveTelemetry.cells.map((cell) => [cell.id, cell]));
		for (let cellId = 1; cellId <= expected; cellId += 1) {
			const cell = cells.get(cellId);
			if (!cell || cell.voltage === null || !Number.isFinite(cell.voltage) || cell.availabilityWarning) return true;
		}
		return false;
	}

	function metric(value: unknown, digits = 3) {
		return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : 'N/A';
	}

	function resultLabel(value: boolean | undefined) {
		return value === true ? 'PASS' : value === false ? 'FAIL' : 'N/A';
	}

	function stageLabel(stage: CalibrationStage) {
		return ({ PREREQUISITES: 'Prerequisites', INITIAL_CHARGE: 'Initial charge', PRE_DISCHARGE_FLOAT: 'Pre-discharge float', WAITING_FOR_LOAD: 'Waiting for load', DISCHARGE: 'Discharge', LOAD_DISCONNECT: 'Load disconnect', RECHARGE: 'Recharge', POST_RECHARGE_FLOAT: 'Post-recharge float', BASELINE_CAPTURE: 'Baseline capture', MONTHLY_INSPECTION: 'Monthly inspection', SIX_MONTH_INSPECTION: 'Six-month inspection', COMPLETION: 'Completion' } as Record<string, string>)[stage.type] ?? stage.type.replaceAll('_', ' ');
	}

	function opensStageWorkflow(detail: CalibrationEventDetail) {
		return !detail.closedAt && ['ACTIVE', 'BLOCKED', 'REVALIDATION_REQUIRED'].includes(detail.status);
	}

	function message(cause: unknown) {
		return cause instanceof Error ? cause.message : 'The calibration request failed.';
	}
</script>

<section class="page">
	{#if !baselinePreviewOpen}<header class="page-head">
		<div>
			<h2><ClipboardList size={25} />Calibration Event</h2>
			<p>{workflowOpen ? 'Stage state, tasks, actions, and version always come from the backend.' : reportOpen ? 'Completed event report.' : 'Create, find, and review calibration events.'}</p>
		</div>
		{#if workflowOpen}<button class="secondary" disabled={loading || mutating} onclick={returnToManagement}>Back to Event Management</button>{/if}
	</header>{/if}

	{#if error}<div class="banner error"><AlertTriangle size={18} /><span>{error}</span></div>{/if}
	{#if notice}<div class="banner notice"><CheckCircle2 size={18} /><span>{notice}</span></div>{/if}


	{#if !workflowOpen && !reportOpen && !baselinePreviewOpen}
		<CalibrationEventManagement {strings} {selectedStringIndex} {events} {selectedEventId} {currentDirection} {selectedCreateType} {initialBaselineTicket} {loading} {mutating}
			onStringChange={changeString} onCreateTypeChange={changeCreateType} onEventSelect={changeSelectedEvent} onStartDraft={startDraftFromManagement} onCreate={createSelectedEvent} onDemo={startInitialBaselineDemo} onResumeInitialBaseline={resumeInitialBaselineTicket} onRemoveInitialBaseline={removeInitialBaselineTicket} onReload={loadLatest} />
	{/if}

	{#if baselinePreviewOpen}
		{#if initialBaselineTicket}<InitialBaselinePreview stringName={selectedString?.stringName ?? 'Battery string'} batteryString={selectedString} ticket={initialBaselineTicket} onTicketChange={updateInitialBaselineTicket} onBack={returnToManagement} />{/if}
	{:else if workflowOpen && event?.eventType === 'INITIAL_BASELINE' && realInitialBaselineTicket && realInitialBaselineAdapter}
		{#key event.calibrationEventId}<InitialBaselinePreview stringName={selectedString?.stringName ?? event.configuration.stringKey} batteryString={selectedString} ticket={realInitialBaselineTicket} real={realInitialBaselineAdapter} onTicketChange={() => {}} onBack={returnToManagement} />{/key}
	{:else if reportOpen && event?.closedAt}
		<CalibrationEventReport {event} onBack={returnToManagement} />
	{:else if !workflowOpen && loading && !event}
		<section class="panel empty"><RefreshCw size={23} class="spinning" /><strong>Loading calibration state…</strong></section>
	{:else if !workflowOpen && !event}
		<section class="panel empty"><BatteryCharging size={28} /><strong>No Calibration Event found</strong><span>Create a Monthly Inspection draft to begin a new lifecycle.</span></section>
	{:else if workflowOpen && event}
		<article class="panel event-summary">
			<div class="section-head"><div><span class="eyebrow">EVENT #{event.calibrationEventId}</span><h3>{selectedString?.stringName ?? event.configuration.stringKey}</h3></div><span class:active={event.status === 'ACTIVE'} class="status">{event.status}</span></div>
			<dl>
				<div><dt>Event type</dt><dd>{event.eventType}</dd></div>
				<div><dt>Event version</dt><dd>{event.eventVersion}</dd></div>
				<div><dt>Current stage</dt><dd>{currentStage ? stageLabel(currentStage) : 'Not started'}</dd></div>
				<div><dt>Created by</dt><dd>{event.createdByName}</dd></div>
			</dl>
			{#if event.status === 'DRAFT'}<button class="primary start" disabled={loading || mutating} onclick={startEvent}><Play size={17} />Start event at version {event.eventVersion}</button>{/if}
		</article>

		{#if event.stages.length === 0}
			<div class="draft-state"><span>Draft</span><p>No current stage. Starting the event creates its server-defined ordered process.</p></div>
		{:else}
			<div class="workflow-heading"><div><span class="eyebrow">{event.eventType.replaceAll('_', ' ')} WORKFLOW</span><strong>The backend owns every stage transition.</strong></div><span class="stage-counter">Stage {(viewedStage?.order ?? 0) + 1} of {event.stages.length}</span></div>
			<nav class="stepper" aria-label="Calibration event stages" style={`--stage-count: ${event.stages.length}`}>
				{#each event.stages as stage}
					<button class:active={stage.calibrationStageId === (viewedStage?.calibrationStageId ?? event.currentStageId)} class:done={stage.state === 'COMPLETED' || stage.state === 'SKIPPED'} disabled={stage.calibrationStageId !== event.currentStageId && stage.state !== 'COMPLETED' && stage.state !== 'SKIPPED'} onclick={() => viewStage(stage)}>
						<span>{stage.state === 'COMPLETED' ? '✓' : stage.order + 1}</span><div><strong>{stageLabel(stage)}</strong><small>{stage.state}</small></div>
					</button>
				{/each}
			</nav>
		{/if}

		{#if event.blockers.length || currentStage?.blockerCode || detailLines(currentStage?.blockerDetail).length}
			<section class="panel blocker-panel">
				<div class="section-head"><div><h3><ShieldAlert size={19} />Current stage blocked</h3><p>The newest backend evaluation controls this status. Invalid samples remain available as audit history.</p></div></div>
				{#if currentStage?.blockerCode}<strong class="blocker-code">{currentStage.blockerCode}</strong>{/if}
				<ul>{#each [...new Set([...event.blockers, ...detailLines(currentStage?.blockerDetail)])] as blocker}<li>{blocker}</li>{/each}</ul>
			</section>
		{/if}

		{#if viewedStage}
			<section class="workspace-panel">
				<div class="section-head"><div><span class="eyebrow">STAGE {viewedStage.order + 1}</span><h3>{stageLabel(viewedStage)}</h3><p>{stageIsMutable ? `Record the required evidence, then use ${viewedStage.type === 'COMPLETION' ? 'Save' : 'Continue'} when the backend enables completion.` : 'Read-only view of a persisted stage.'}</p></div><span class="status">{viewedStage.state}</span></div>
				{#if stageIsMutable && missingEvidenceFor(viewedStage).length}<div class="missing"><strong>Missing evidence</strong><span>{missingEvidenceFor(viewedStage).join(', ')}</span></div>{/if}
				{#if viewedStage.properties?.recommendation || viewedStage.type === 'MONTHLY_INSPECTION'}
					<div class="automatic-status"><strong>Automatic measurement status</strong><span>{String(viewedStage.properties?.recommendation ?? viewedStage.blockerCode ?? 'Waiting for measurement')}</span></div>
				{/if}
				{#if viewedStage.type === 'MONTHLY_INSPECTION'}
					{@const monthly = monthlyInspectionAssessment(viewedStage.properties)}
					<section class="monthly-live">
						<div class="live-heading"><div><h4>Live Monthly measurements</h4><p>Calculated by the backend from snapshot #{monthly.snapshotSequence ?? 'N/A'}. Cell voltages are read from the shared live string-detail API.</p></div><span class:failed={!liveTelemetry?.calculation.calculatorAvailable || liveTelemetry.calculation.snapshotStale}>{!liveTelemetry?.calculation.calculatorAvailable ? 'UNAVAILABLE' : liveTelemetry.calculation.snapshotStale ? 'STALE' : 'LIVE'}</span></div>
						{#if telemetrySequenceMismatch(monthly)}
							<div class="live-warning">The cell list is snapshot #{liveTelemetry?.calculation.snapshotSequence}; derived checks are snapshot #{monthly.snapshotSequence}. Waiting for the next synchronized refresh.</div>
						{/if}
						<div class="monthly-metrics">
							<article><span>Midpoint voltage</span><strong>{metric(monthly.midpointVoltageV)} V</strong><small>Cells 1..{Math.floor((selectedString?.cellQty ?? liveTelemetry?.cellQty ?? 0) / 2)}</small></article>
							<article><span>Total string voltage</span><strong>{metric(monthly.stringVoltageV)} V</strong><small>Backend snapshot total</small></article>
							<article class:failed={monthly.floatCurrentPass === false}><span>Float current</span><strong>{metric(monthly.floatCurrentA)} A</strong><small>{resultLabel(monthly.floatCurrentPass ?? undefined)} · absolute magnitude &lt; 0.200 A</small></article>
							<article class:failed={monthly.comparisonResult === 'FAIL'}><span>Previous Monthly comparison</span><strong>{monthly.comparisonResult === 'UNAVAILABLE' ? 'Not available' : monthly.comparisonResult === 'NOT_COMPARABLE_ZERO' ? 'Not comparable' : `${metric(monthly.relativeDeviationPercent, 1)}%`}</strong><small>{monthly.previousMonthlyEventId ? `Event #${monthly.previousMonthlyEventId} · limit ≤ 30%` : 'No completed previous Monthly measurement'}</small></article>
							<article class:failed={monthly.ambientTemperaturePass === false}><span>Ambient temperature</span><strong>{metric(monthly.ambientTemperatureC, 1)} °C</strong><small>{resultLabel(monthly.ambientTemperaturePass ?? undefined)} · limit ≤ 33 °C</small></article>
						</div>
						<div class="cell-voltage-head"><div><strong>Every cell voltage</strong><span>{liveTelemetry?.cells.filter((cell) => cell.voltage !== null).length ?? 0}/{selectedString?.cellQty ?? liveTelemetry?.cellQty ?? 0} available</span></div><button class="cell-toggle" type="button" aria-expanded={cellVoltagesExpanded} aria-controls="monthly-cell-voltages" aria-label={cellVoltagesExpanded ? 'Collapse cell voltage list' : 'Expand cell voltage list'} onclick={() => cellVoltagesExpanded = !cellVoltagesExpanded}>{cellVoltagesExpanded ? 'Collapse' : 'Expand'}</button></div>
						{#if !liveTelemetry?.calculation.calculatorAvailable || liveTelemetry.calculation.snapshotStale || liveCellsIncomplete()}
							<div class="live-warning">Cell voltage data is incomplete or stale. The backend does not calculate a partial midpoint and keeps the stage blocked.</div>
						{/if}
						<div id="monthly-cell-voltages">
							{#if cellVoltagesExpanded}<BmsCompactCellVoltageTable cells={liveTelemetry?.cells ?? []} ariaLabel="Live Monthly cell voltage" emptyMessage="No live cell voltage is available." title="Cell Data · Voltage" expectedCount={selectedString?.cellQty ?? liveTelemetry?.cellQty ?? 0} />{/if}
						</div>
					</section>
				{/if}
				<div class="evidence-list">
					{#each evidenceTypes(viewedStage) as evidenceType}
						<div class="evidence-row">
							<div><strong>{evidenceType.replaceAll('_', ' ')}</strong><small>{recordedEvidence(viewedStage).includes(evidenceType) ? 'RECORDED' : 'NOT RECORDED'}</small></div>
							{#if evidenceType.includes('INSPECTION')}
								<select aria-label={`${evidenceType} status`} disabled={!stageIsMutable || mutating} value={evidenceStatuses[evidenceType] ?? 'PASS'} onchange={(e) => evidenceStatuses = { ...evidenceStatuses, [evidenceType]: e.currentTarget.value as 'PASS' | 'FAIL' }}><option value="PASS">Pass</option><option value="FAIL">Fail</option></select>
							{:else}
								<input aria-label={`${evidenceType} value`} disabled={!stageIsMutable || mutating} type={evidenceType === 'MIDPOINT_VOLTAGE' ? 'number' : 'text'} step="any" placeholder={evidenceType === 'MIDPOINT_VOLTAGE' ? 'Voltage (V)' : 'Optional note'} value={evidenceValues[evidenceType] ?? ''} oninput={(e) => evidenceValues = { ...evidenceValues, [evidenceType]: e.currentTarget.value }} />
							{/if}
							<button class="secondary" disabled={!stageIsMutable || mutating || recordedEvidence(viewedStage).includes(evidenceType) || (evidenceType === 'MIDPOINT_VOLTAGE' && !evidenceValues[evidenceType]?.trim())} onclick={() => recordEvidence(evidenceType)}>Save</button>
						</div>
					{/each}
					{#each legacyEvidenceTypes(viewedStage) as evidenceType}
						<div class="evidence-row legacy-evidence">
							<div><strong>{evidenceType.replaceAll('_', ' ')}</strong><small>HISTORICAL EVIDENCE · READ ONLY</small></div>
							<span>Preserved in the append-only event audit; this evidence type is no longer collected for this stage.</span>
						</div>
					{/each}
				</div>

				{#if stageIsMutable}
					{#if event.allowedActions.some((action) => action.requiresReason)}<label class="reason">Reason<input disabled={mutating} bind:value={actionReason} placeholder="Required for fail or abort" /></label>{/if}
					<div class="action-notes">
						{#each event.allowedActions as action}
							{#if action.disabledReason}<p><strong>{action.label}:</strong> {action.disabledReason}</p>{/if}
							{#if action.requiresAcknowledgement}{#each action.acknowledgementItems as item}<label class="ack"><input disabled={mutating} type="checkbox" checked={acknowledgedItems.includes(item)} onchange={(e) => toggleAcknowledgement(item, e.currentTarget.checked)} />Acknowledge {item.replaceAll('_', ' ')}</label>{/each}{/if}
						{/each}
					</div>
					{#if pendingDangerAction}
						<div class="danger-confirm"><ShieldAlert size={18} /><span>Confirm {pendingDangerAction.label.toLowerCase()}. This action changes the persisted lifecycle and may be final.</span><button class="secondary" disabled={mutating || !actionReady(pendingDangerAction)} onclick={confirmDangerAction}>Confirm</button><button class="secondary" disabled={mutating} onclick={() => pendingDangerAction = null}>Cancel</button></div>
					{/if}
				{/if}
				{#if !stageIsMutable && (viewedStage.acceptedAction || viewedStage.acceptedAt || viewedStage.completedAt)}
					<dl class="terminal-audit">
						<div><dt>Accepted action</dt><dd>{viewedStage.acceptedAction ?? '—'}</dd></div>
						<div><dt>Actor</dt><dd>{viewedStage.acceptedActor ?? viewedStage.completedBy ?? '—'}</dd></div>
						<div><dt>Accepted at</dt><dd>{formatCalibrationTime(viewedStage.acceptedAt ?? viewedStage.completedAt)}</dd></div>
						{#if viewedStage.acceptedReason}<div><dt>Reason</dt><dd>{viewedStage.acceptedReason}</dd></div>{/if}
						{#if viewedStage.acknowledgedGaps.length}<div><dt>Acknowledged gaps</dt><dd>{viewedStage.acknowledgedGaps.join(', ')}</dd></div>{/if}
					</dl>
				{/if}
				{#if canRedoViewedStage}
					<div class="redo-stage">
						<strong>Redo this stage</strong><span>This reopens the selected stage on the server and resets every later stage. Historical audit rows remain unchanged.</span>
						{#if redoConfirmation}
							<label>Required reason<input bind:value={redoReason} disabled={mutating} placeholder="Explain why this stage must be repeated" /></label>
							<div><button class="secondary" disabled={mutating} onclick={cancelRedoStage}>Cancel</button><button class="secondary danger-text" disabled={mutating || !redoReason.trim()} onclick={redoViewedStage}>Confirm redo stage</button></div>
						{:else}
							<button class="secondary danger-text" disabled={mutating} onclick={requestRedoStage}>Redo stage</button>
						{/if}
					</div>
				{/if}
			</section>
			<footer class="wizard-footer">
				<div><button class="secondary" disabled={viewedStage.order === 0} onclick={viewPreviousStage}>Back</button>{#if !viewingCurrentStage && event.currentStageId}<button class="secondary" onclick={viewCurrentStage}>Return to current stage</button>{/if}<button class="secondary" disabled={loading || mutating} onclick={reloadEvent}><RefreshCw size={16} />Reload</button></div>
				<div>{#each event.allowedActions.filter((action) => action.actionCode !== 'COMPLETE_STAGE') as action}<button class:danger-text={action.intent === 'DANGER'} class="secondary" disabled={!stageIsMutable || mutating || !actionReady(action)} title={action.disabledReason ?? undefined} onclick={() => requestAction(action)}>{action.label}</button>{/each}<button class="primary next" disabled={!stageIsMutable || mutating || !continueAction || !actionReady(continueAction)} onclick={() => continueAction && executeAction(continueAction)}>{viewedStage.type === 'COMPLETION' ? 'Save' : 'Continue'}</button></div>
			</footer>
		{/if}
	{/if}
</section>

<style>
	.redo-stage{display:grid;gap:9px;margin-top:16px;padding:13px;border:1px solid #efcfaa;border-radius:8px;color:#79521d;background:#fff9ef}.redo-stage>span{font-size:12px}.redo-stage>div{display:flex;justify-content:flex-end;gap:8px}.redo-stage>button{justify-self:start}
	.cell-voltage-head>div{display:grid;gap:3px}.cell-toggle{min-height:32px;padding:0 10px;border:1px solid #ccd7e6;border-radius:7px;color:#36557f;background:#fff;font:inherit;font-size:12px;font-weight:600;cursor:pointer}.cell-toggle:focus-visible{outline:2px solid #1749ad;outline-offset:2px}
	.monthly-live{margin-top:18px;overflow:hidden;border:1px solid #dfe7f2;border-radius:10px}.live-heading,.cell-voltage-head{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:14px 15px;background:#f8fbff}.live-heading h4{margin:0;color:#30415d;font-size:15px}.live-heading p{margin:4px 0 0;color:#78879c;font-size:12px}.live-heading>span{padding:5px 8px;border-radius:12px;color:#28734b;background:#e8f7ee;font-size:10px;font-weight:700}.live-heading>span.failed{color:#9b3030;background:#fff0ef}.monthly-metrics{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:1px;background:#e8edf4}.monthly-metrics article{display:grid;gap:5px;min-height:94px;padding:13px;background:#fff}.monthly-metrics article.failed{background:#fff5f4}.monthly-metrics span,.monthly-metrics small{color:#7b899d;font-size:11px}.monthly-metrics strong{color:#30415d;font-size:16px}.monthly-metrics article.failed strong,.monthly-metrics article.failed small{color:#a13a32}.live-warning{padding:10px 14px;border-top:1px solid #ecdcae;border-bottom:1px solid #ecdcae;color:#795a22;background:#fff9e9;font-size:12px}.cell-voltage-head{border-top:1px solid #e8edf4;color:#40536f;font-size:13px}.cell-voltage-head span{color:#7d8a9d}@media(max-width:1100px){.monthly-metrics{grid-template-columns:repeat(3,1fr)}}@media(max-width:620px){.monthly-metrics{grid-template-columns:1fr}.live-heading{align-items:flex-start}.monthly-live{margin-right:-6px;margin-left:-6px}}
	.page { width: 100%; color: #33425d; }
	.page-head, .section-head, .workflow-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; }
	.page-head { margin-bottom: 20px; }
	.eyebrow { display: block; margin-bottom: 6px; color: #3860ad; font-size: 11px; font-weight: 700; letter-spacing: .09em; }
	.page-head h2, .blocker-panel h3 { display: flex; align-items: center; gap: 9px; }
	.page-head h2 { margin: 0; color: #172b4d; font-size: 25px; font-weight: 600; }
	.page-head p, .section-head p { max-width: 760px; margin: 7px 0 0; color: #718096; font-size: 14px; line-height: 1.45; }
	.panel, .workspace-panel { border: 1px solid #e0e7f1; border-radius: 12px; background: #fff; box-shadow: 0 7px 22px rgba(35,54,89,.04); }
	.event-summary, .workspace-panel, .blocker-panel { padding: 20px; }
	.section-head h3 { margin: 0; color: #273853; font-size: 17px; }
	.status, .stage-counter { padding: 5px 8px; border-radius: 6px; color: #39567f; background: #edf3fb; font-size: 11px; font-weight: 700; letter-spacing: .04em; }
	.status.active { color: #18724a; background: #e7f7ef; }
	label { display: grid; gap: 7px; color: #53627a; font-size: 12px; font-weight: 600; }
	select, input { width: 100%; min-height: 41px; padding: 0 11px; border: 1px solid #d8e0eb; border-radius: 8px; color: #2d405e; background: #fff; font: inherit; font-size: 13px; }
	.primary, .secondary { display: inline-flex; align-items: center; justify-content: center; gap: 7px; min-height: 41px; padding: 0 14px; border-radius: 8px; font: inherit; font-size: 14px; font-weight: 600; cursor: pointer; }
	.primary { border: 0; color: #fff; background: #1749ad; }
	.secondary { border: 1px solid #d7dfeb; color: #40516f; background: #fff; }
	.primary:disabled, .secondary:disabled { opacity: .5; cursor: not-allowed; }
	.banner { display: flex; align-items: center; gap: 9px; margin-bottom: 14px; padding: 12px 14px; border-radius: 9px; font-size: 13px; }
	.banner.error { border: 1px solid #f0c7c7; color: #9b3030; background: #fff3f3; }
	.banner.notice { border: 1px solid #bee5cf; color: #23724b; background: #effbf4; }
	.event-summary { margin-top: 18px; }
	.event-summary dl { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: 10px; margin: 18px 0; }
	.event-summary dl div { display: grid; gap: 5px; padding: 11px; border: 1px solid #edf1f6; border-radius: 8px; background: #f9fbfe; }
	.event-summary dt, .terminal-audit dt { color: #718096; font-size: 12px; }
	.event-summary dd, .terminal-audit dd { margin: 0; color: #2e415e; font-size: 13px; font-weight: 600; }
	.start { width: 100%; }
	.workflow-heading { align-items: center; margin: 20px 0 10px; }
	.workflow-heading strong { color: #53627a; font-size: 13px; }
	.stage-counter { white-space: nowrap; }
	.stepper { display: grid; grid-template-columns: repeat(var(--stage-count, 1), minmax(112px,1fr)); overflow-x: auto; margin-bottom: 16px; border: 1px solid #dfe6f0; border-radius: 11px; background: #fff; }
	.stepper button { display: grid; grid-template-columns: 25px 1fr; align-items: center; gap: 7px; min-width: 112px; padding: 12px 10px; border: 0; border-right: 1px solid #edf0f5; color: #718096; background: #fff; font: inherit; text-align: left; cursor: pointer; }
	.stepper button:last-child { border-right: 0; }
	.stepper button:disabled { cursor: not-allowed; opacity: .62; }
	.stepper button span { display: grid; width: 23px; height: 23px; place-items: center; border: 1px solid #d7dfeb; border-radius: 50%; font-size: 11px; }
	.stepper button div { display: grid; gap: 3px; }
	.stepper button strong { font-size: 11px; font-weight: 500; line-height: 1.2; }
	.stepper button small { font-size: 9px; }
	.stepper button.active { color: #1749ad; background: #f2f6ff; }
	.stepper button.active span, .stepper button.done span { border-color: #1749ad; color: #fff; background: #1749ad; }
	.stepper button.done { color: #4065a8; }
	.draft-state, .empty { display: grid; place-items: center; gap: 8px; padding: 42px 20px; color: #718096; text-align: center; }
	.draft-state { margin-top: 18px; border: 1px dashed #ccd7e5; border-radius: 9px; }
	.draft-state p, .empty span { margin: 0; font-size: 13px; }
	.empty { margin-top: 18px; }
	.empty strong { color: #3c506d; }
	.blocker-panel { margin: 18px 0; border-color: #eabcbc; background: #fff7f7; }
	.blocker-panel h3, .blocker-code { color: #973838; }
	.blocker-panel ul { margin: 9px 0 0; padding-left: 20px; color: #7e4242; font-size: 13px; }
	.workspace-panel { min-height: 360px; }
	.missing, .automatic-status { display: grid; gap: 4px; margin-top: 16px; padding: 11px; border-radius: 8px; font-size: 12px; }
	.missing { color: #795722; background: #fff7e8; }
	.automatic-status { color: #35587d; background: #eef5fc; }
	.terminal-audit { display: grid; margin: 18px 0 0; padding: 0 11px; border: 1px solid #e4eaf2; border-radius: 8px; }
	.terminal-audit div { display: flex; justify-content: space-between; gap: 18px; padding: 11px 0; border-bottom: 1px solid #edf1f6; }
	.terminal-audit div:last-child { border-bottom: 0; }
	.terminal-audit dd { text-align: right; }
	.evidence-list { display: grid; gap: 10px; margin-top: 18px; }
	.evidence-row { display: grid; grid-template-columns: minmax(210px,1.4fr) minmax(150px,1fr) auto; align-items: center; gap: 10px; padding: 11px; border: 1px solid #e4eaf2; border-radius: 8px; }
	.evidence-row > div { display: grid; gap: 3px; }
	.evidence-row strong { font-size: 12px; }
	.evidence-row small { color: #738198; font-size: 10px; }
	.legacy-evidence { grid-template-columns: minmax(210px,1.4fr) minmax(250px,2fr); background: #f8fafd; }
	.legacy-evidence > span { color: #6e7d92; font-size: 12px; }
	.reason { max-width: 560px; margin-top: 18px; }
	.action-notes { display: grid; gap: 5px; margin-top: 14px; }
	.action-notes p { margin: 0; color: #9b3030; font-size: 11px; }
	.ack { display: flex; align-items: center; gap: 7px; font-weight: 400; }
	.ack input { width: auto; min-height: auto; }
	.danger-confirm { display: flex; align-items: center; gap: 9px; margin-top: 14px; padding: 11px; border: 1px solid #efc8c8; border-radius: 8px; color: #8c3434; background: #fff7f7; font-size: 12px; }
	.danger-confirm span { margin-right: auto; }
	.danger-confirm .secondary { min-height: 34px; }
	.wizard-footer { display: flex; justify-content: space-between; gap: 12px; margin-top: 16px; }
	.wizard-footer > div { display: flex; flex-wrap: wrap; gap: 9px; }
	.wizard-footer > div:last-child { justify-content: flex-end; }
	.danger-text { color: #9b3030; }
	.next { min-width: 120px; }
	:global(.spinning) { animation: spin 1s linear infinite; }
	@keyframes spin { to { transform: rotate(360deg); } }
	@media (max-width: 1100px) {
		.event-summary dl { grid-template-columns: 1fr 1fr; }
	}
	@media (max-width: 620px) {
		.page-head, .section-head, .workflow-heading { display: grid; }
		.page-head .secondary { width: 100%; }
		.event-summary dl { grid-template-columns: 1fr; }
		.event-summary, .workspace-panel, .blocker-panel { padding: 16px; }
		.stepper { grid-template-columns: repeat(var(--stage-count, 1), 150px); }
		.evidence-row { grid-template-columns: 1fr; }
		.legacy-evidence { grid-template-columns: 1fr; }
		.danger-confirm, .wizard-footer { align-items: stretch; flex-direction: column; }
		.wizard-footer > div, .wizard-footer > div:last-child { display: grid; grid-template-columns: 1fr 1fr; }
		.wizard-footer .next { grid-column: 1 / -1; }
		.terminal-audit div { display: grid; gap: 5px; }
		.terminal-audit dd { text-align: left; }
	}
	/* Keep the operational workspace calm: surface separation comes from tone, not heavy outlines. */
	.panel,.workspace-panel{border-color:#edf1f6;box-shadow:0 12px 30px rgba(35,54,89,.055)}
	.page-head h2,.section-head h3{font-weight:500}
	.eyebrow{font-weight:600}
	.status,.stage-counter{font-weight:600}
	label,.primary,.secondary{font-weight:500}
	select,input{border-color:#e4eaf2;border-radius:9px;background-color:#fbfcfe;box-shadow:inset 0 1px 2px rgba(35,54,89,.025);transition:border-color .16s ease,box-shadow .16s ease,background-color .16s ease}
	select{appearance:none;padding-right:38px;background-image:linear-gradient(45deg,transparent 50%,#71809a 50%),linear-gradient(135deg,#71809a 50%,transparent 50%);background-position:calc(100% - 17px) 18px,calc(100% - 12px) 18px;background-size:5px 5px,5px 5px;background-repeat:no-repeat}
	select:hover,input:hover{border-color:#c7d4e5;background-color:#fff}
	select:focus,input:focus{outline:none;border-color:#7e9fd3;background-color:#fff;box-shadow:0 0 0 3px rgba(50,99,174,.12)}
	select option{color:#2d405e;background:#fff;font-weight:400}
	.secondary{border-color:transparent;background:#f4f7fb}
	.secondary:hover:not(:disabled){background:#eaf0f8}
	.event-summary dl div,.monthly-live,.redo-stage{border-color:transparent;background:#f7f9fc}
	.monthly-live{box-shadow:inset 0 0 0 1px #edf1f6}
	.live-heading,.cell-voltage-head{background:#f5f8fc}
	.evidence-row{border-color:transparent;background:#f7f9fc}
	.stepper{border-color:#edf1f6;box-shadow:0 5px 18px rgba(35,54,89,.025)}
</style>
