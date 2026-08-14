<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { AlertTriangle, ArrowLeft, ArrowRight, BatteryCharging, Check, CheckCircle2, ClipboardCheck, Clock3, FileText, Gauge, Play, Plus, Power, RefreshCw, ShieldCheck, Thermometer, X } from '@lucide/svelte';
	import EventTable from './DischargeEventTable.svelte';
	import DischargeTrendChart from './DischargeTrendChart.svelte';
	import {
		activateBaselineEvent, createDischargeEvent, deleteDischargeEvent, getDischargeConfig, hasBmsSession,
		listBmsStrings, listDischargeEvents, stopDischargeEvent,
		type BatteryString, type DischargeConfig, type DischargeEvent
	} from '$lib/services/bms-api';

	type CalibrationStage = 'PRECHECK' | 'INITIAL_CHARGE' | 'COOLDOWN' | 'DISCHARGE' | 'RECOVERY' | 'CAPTURE' | 'REVIEW';
	type ChecklistItem = { id: string; label: string; required?: boolean; checked: boolean };
	type MeasurementSource = 'BMS' | 'MANUAL_METER' | 'CALCULATED';
	type Measurement = { label: string; value: string; unit: string; source: MeasurementSource; required?: boolean };

	const stages: { id: CalibrationStage; label: string; short: string; detail: string }[] = [
		{ id: 'PRECHECK', label: 'Safety & pre-check', short: '1', detail: 'Confirm the physical system is safe before charging.' },
		{ id: 'INITIAL_CHARGE', label: 'Initial charge', short: '2', detail: 'Record boost and float charging settings.' },
		{ id: 'COOLDOWN', label: 'Cool-down', short: '3', detail: 'Verify temperature and the visual condition after charge.' },
		{ id: 'DISCHARGE', label: 'Controlled discharge', short: '4', detail: 'Follow the discharge to the configured cut-off.' },
		{ id: 'RECOVERY', label: 'Recovery charge', short: '5', detail: 'Recharge before taking the reference measurements.' },
		{ id: 'CAPTURE', label: 'Baseline capture', short: '6', detail: 'Capture all measurements at a full-charge condition.' },
		{ id: 'REVIEW', label: 'Review & approve', short: '7', detail: 'Check completeness and approve the immutable baseline.' }
	];

	let strings = $state<BatteryString[]>([]);
	let events = $state<DischargeEvent[]>([]);
	let config = $state<DischargeConfig>({ id: 1, dischargeCurrentDirection: 'NEGATIVE', automaticMode: true, automaticStartCurrentA: 20, automaticStopCurrentA: 0, sampleIntervalSeconds: 1800, timeScaleFactor: 1, invalidSampleLimit: 5, risingVoltageSampleLimit: 5, updatedAt: null });
	let view = $state<'overview' | 'wizard' | 'report'>('overview');
	let stageIndex = $state(0);
	let selectedStringIndex = $state<number>(0);
	let demoMode = $state(false);
	let saving = $state(false);
	let notice = $state('');
	let error = $state('');
	let operatorName = $state('');
	let reviewerName = $state('');
	let reportApproved = $state(false);
	let dischargeEventId = $state<number | null>(null);
	let activeBaseline = $state<DischargeEvent | null>(null);
	let startTime = $state(localDate());
	let initialChargeRunning = $state(false);
	let initialChargeAtTarget = $state(false);
	let initialChargeConfirmed = $state(false);
	let initialChargeProgress = $state(0);
	let chargerMcbOpen = $state(false);
	let cooldownRunning = $state(false);
	let cooldownStable = $state(false);
	let cooldownConfirmed = $state(false);
	let cooldownProgress = $state(0);
	let cooldownTargetTemperature = $state(31);
	let recoveryDurationHours = $state(6);
	let recoveryRunning = $state(false);
	let recoveryCompleteByTime = $state(false);
	let recoveryProgress = $state(0);
	let sampleCaptured = $state(false);
	let sampleAccepted = $state(false);
	let loadMcbClosed = $state(false);
	let floatMcbClosed = $state(false);
	let dischargeTab = $state<'event' | 'history'>('event');
	let standardLoadConnected = $state(false);
	let testLoadDisconnected = $state(false);
	let recoveryMcbClosed = $state(false);
	let chargerMcbOpenedAfterSample = $state(false);
	let floatVoltageVerified = $state(false);
	let loadedRippleCaptured = $state(false);
	let simulationTimer: ReturnType<typeof setInterval> | null = null;
	let precheck = $state<ChecklistItem[]>([
		{ id: 'connections', label: 'Battery interconnections and charger connections have been inspected.', required: true, checked: false },
		{ id: 'isolate-load', label: 'DC MCB supplying the load is open and the load is isolated.', required: true, checked: false },
		{ id: 'voc', label: 'Open-circuit voltage for every cell/block and the full string was recorded.', required: true, checked: false },
		{ id: 'physical', label: 'No leakage, deformation, damaged safety valve, or mechanical damage was observed.', required: true, checked: false }
	]);
	let cooldown = $state<ChecklistItem[]>([
		{ id: 'temperature', label: 'Each cell/block temperature has returned close to ambient temperature.', required: true, checked: false },
		{ id: 'valve', label: 'Safety valves show no deformation, leakage, or physical intervention.', required: true, checked: false }
	]);
	let recovery = $state<ChecklistItem[]>([
		{ id: 'boost-recovery', label: 'Boost recharge was completed for 4–8 hours, followed by float charge until full.', required: true, checked: false },
		{ id: 'stable', label: 'String voltage and charging current are stable for baseline measurement.', required: true, checked: false }
	]);
	let charge = $state({ boostVoltage: 251, floatVoltage: 236, currentLimit: 40, capacityAh: 200, cellCount: 106, ambientTemperature: 30 });
	let discharge = $state({ current: 20, cRate: '0.1C10', cutoffPerCell: 1.8, expectedHours: 10, sampleMinutes: 30, usedAh: '', minimumCellVoltage: '', stopReason: '' });
	let measurements = $state<Measurement[]>([
		{ label: 'String voltage', value: '', unit: 'VDC', source: 'BMS', required: true },
		{ label: 'Midpoint voltage', value: '', unit: 'VDC', source: 'BMS', required: true },
		{ label: 'Float current', value: '', unit: 'mA', source: 'BMS', required: true },
		{ label: 'Charger output voltage', value: '', unit: 'VDC', source: 'BMS', required: true },
		{ label: 'Ambient temperature', value: '', unit: '°C', source: 'BMS', required: true },
		{ label: 'Ripple AC — no load', value: '', unit: 'mVAC', source: 'MANUAL_METER', required: true },
		{ label: 'Ripple AC — connected load', value: '', unit: 'mVAC', source: 'MANUAL_METER', required: true }
	]);
	let cellMeasurements = $state<{ cell: number; voltage: string; temperature: string; resistance: string; source: MeasurementSource }[]>([]);

	let selectedString = $derived(strings.find((item) => item.stringIndex === selectedStringIndex) ?? null);
	let stage = $derived(stages[stageIndex]);
	let precheckComplete = $derived(precheck.every((item) => !item.required || item.checked));
	let cooldownComplete = $derived(cooldown.every((item) => !item.required || item.checked));
	let recoveryComplete = $derived(recovery.every((item) => !item.required || item.checked));
	let initialChargeReady = $derived(initialChargeAtTarget && initialChargeConfirmed);
	let cooldownReady = $derived(chargerMcbOpen && cooldownRunning && cooldownStable && cooldownConfirmed && cooldownComplete);
	let recoveryReady = $derived(testLoadDisconnected && recoveryMcbClosed && recoveryRunning && recoveryCompleteByTime && sampleCaptured && sampleAccepted && chargerMcbOpenedAfterSample && loadMcbClosed && loadedRippleCaptured && floatVoltageVerified && floatMcbClosed && recoveryComplete);
	let captureComplete = $derived(measurements.every((item) => !item.required || item.value.trim() !== '') && cellMeasurements.length > 0 && cellMeasurements.every((cell) => cell.voltage && cell.temperature && cell.resistance));
	let reportSoH = $derived(discharge.usedAh && charge.capacityAh ? Math.min(100, Number(discharge.usedAh) / charge.capacityAh * 100) : null);
	let currentEvents = $derived(events.filter((event) => event.strId === (selectedString ? `str${selectedString.stringIndex}` : '')));

	onMount(() => { void loadAll(); });
	onDestroy(() => { if (simulationTimer) clearInterval(simulationTimer); });

	async function loadAll() {
		try {
			if (!hasBmsSession()) { loadDemoData(); return; }
			demoMode = false;
			[strings, events, config] = await Promise.all([listBmsStrings(), listDischargeEvents(), getDischargeConfig()]);
			selectedStringIndex ||= strings[0]?.stringIndex ?? 0;
			activeBaseline = events.find((event) => event.strId === `str${selectedStringIndex}` && event.activeBaseline && event.status === 'SUCCESS') ?? null;
			applyStringProfile();
		} catch (cause) { error = message(cause); }
	}

	function loadDemoData() {
		demoMode = true;
		strings = [{ id: 'str1', stringIndex: 1, stringName: 'Demo VRLA String A', cellBrand: 'Vision', cellModel: '6FM200D-X', cellQty: 106, ratedCapacity: 200, cutoffVoltage: 190.8, floatVoltage: 236, boostVoltage: 251, rNew: 1450, highResistanceThreshold: 2200, highTemperatureThreshold: 40, lowVoltageThreshold: 1.8, highVoltageThreshold: 2.45, serialPortId: 'demo' }];
		selectedStringIndex = 1;
		applyStringProfile();
	}

	function fillDemoEvidence() {
		precheck = precheck.map((item) => ({ ...item, checked: true }));
		cooldown = cooldown.map((item) => ({ ...item, checked: true }));
		recovery = recovery.map((item) => ({ ...item, checked: true }));
		operatorName = 'Nguyễn Minh Kỹ thuật';
		reviewerName = 'Trần An Reviewer';
		initialChargeRunning = false; initialChargeAtTarget = false; initialChargeConfirmed = false; initialChargeProgress = 0;
		chargerMcbOpen = false; cooldownRunning = false; cooldownStable = false; cooldownConfirmed = false; cooldownProgress = 0;
		recoveryRunning = false; recoveryCompleteByTime = false; recoveryProgress = 0; sampleCaptured = false; sampleAccepted = false; loadMcbClosed = false; floatMcbClosed = false;
		standardLoadConnected = false; testLoadDisconnected = false; recoveryMcbClosed = false; chargerMcbOpenedAfterSample = false; floatVoltageVerified = false; loadedRippleCaptured = false;
		discharge.usedAh = '196.8';
		discharge.minimumCellVoltage = '1.80';
		discharge.stopReason = 'CELL_CUTOFF';
		measurements = [
			{ label: 'String voltage', value: '236.1', unit: 'VDC', source: 'BMS', required: true },
			{ label: 'Midpoint voltage', value: '118.0', unit: 'VDC', source: 'BMS', required: true },
			{ label: 'Float current', value: '72', unit: 'mA', source: 'BMS', required: true },
			{ label: 'Charger output voltage', value: '236.2', unit: 'VDC', source: 'BMS', required: true },
			{ label: 'Ambient temperature', value: '29.6', unit: '°C', source: 'BMS', required: true },
			{ label: 'Ripple AC — no load', value: '14', unit: 'mVAC', source: 'MANUAL_METER', required: true },
			{ label: 'Ripple AC — connected load', value: '21', unit: 'mVAC', source: 'MANUAL_METER', required: true }
		];
		cellMeasurements = Array.from({ length: Math.min(charge.cellCount, 12) }, (_, index) => ({ cell: index + 1, voltage: (2.227 + ((index % 4) * .002)).toFixed(3), temperature: (29.8 + ((index % 3) * .2)).toFixed(1), resistance: String(1420 + (index * 9)), source: 'BMS' as MeasurementSource }));
	}

	function applyStringProfile() {
		if (!selectedString) return;
		charge.capacityAh = selectedString.ratedCapacity || 200;
		charge.cellCount = selectedString.cellQty || 106;
		discharge.current = Math.round(charge.capacityAh * .1);
		discharge.cRate = '0.1C10';
		discharge.cutoffPerCell = 1.8;
		discharge.expectedHours = 10;
		cellMeasurements = Array.from({ length: Math.min(charge.cellCount, 12) }, (_, index) => ({ cell: index + 1, voltage: '', temperature: '', resistance: '', source: 'BMS' }));
	}

	function chooseDischargeProfile() {
		const isFast = discharge.cRate === '0.2C5';
		discharge.current = Math.round(charge.capacityAh * (isFast ? .2 : .1));
		discharge.cutoffPerCell = isFast ? 1.75 : 1.8;
		discharge.expectedHours = isFast ? 5 : 10;
	}

	function beginCalibration() {
		view = 'wizard'; stageIndex = 0; notice = ''; error = ''; reportApproved = false; dischargeEventId = null;
		applyStringProfile();
		if (demoMode) fillDemoEvidence();
	}

	function backToOverview() { view = 'overview'; notice = ''; error = ''; }
	function next() { if (canContinue()) stageIndex = Math.min(stageIndex + 1, stages.length - 1); }
	function previous() { stageIndex = Math.max(stageIndex - 1, 0); }
	function canContinue() {
		if (stage.id === 'PRECHECK') return precheckComplete && operatorName.trim().length > 0;
		if (stage.id === 'INITIAL_CHARGE') return initialChargeReady;
		if (stage.id === 'COOLDOWN') return cooldownReady;
		if (stage.id === 'RECOVERY') return recoveryReady;
		if (stage.id === 'CAPTURE') return captureComplete;
		return true;
	}

	function startInitialCharge() {
		initialChargeRunning = true;
		if (demoMode) { runDemoTimer('initial'); notice = 'Demo initial charge is running. The target confirmation will unlock when progress reaches 100%.'; return; }
		notice = 'Initial charge was recorded as started. Await BMS confirmation that boost target and float transition were reached.';
	}
	function markInitialChargeAtTarget() { initialChargeAtTarget = true; notice = 'Charge targets have been reached. Confirm the reading to unlock the cool-down stage.'; }
	function startCooldown() {
		if (!chargerMcbOpen) { error = 'Confirm that the charger DC MCB is open before starting the cool-down wait.'; return; }
		cooldownRunning = true;
		if (demoMode) { runDemoTimer('cooldown'); notice = 'Demo cool-down is running. Temperature stability will be available at completion.'; return; }
		notice = 'Cool-down wait started. Await the temperature stability condition before confirming.';
	}
	function markCooldownStable() { cooldownStable = true; notice = 'Temperature is within the configured near-ambient band. Confirm the inspection to continue.'; }
	function startRecoveryCharge() {
		if (!testLoadDisconnected || !recoveryMcbClosed) { error = 'Confirm that the test load is disconnected and the charger DC MCB is closed for recovery charge first.'; return; }
		recoveryRunning = true;
		if (demoMode) { runDemoTimer('recovery'); notice = `Demo ${recoveryDurationHours}-hour recovery charge is running on an accelerated clock.`; return; }
		notice = `Recovery charge started for ${recoveryDurationHours} hours. Await completion before capturing the baseline sample.`;
	}
	function markRecoveryTimeComplete() { recoveryCompleteByTime = true; notice = 'Recovery duration is complete. Capture the baseline sample, then accept it.'; }
	function captureRecoverySample() { sampleCaptured = true; notice = 'No-load baseline sample has been captured. Review and accept the readings before restoring the load.'; }
	function runDemoTimer(phase: 'initial' | 'cooldown' | 'recovery') {
		if (simulationTimer) clearInterval(simulationTimer);
		const setProgress = (value: number) => {
			if (phase === 'initial') initialChargeProgress = value;
			else if (phase === 'cooldown') cooldownProgress = value;
			else recoveryProgress = value;
		};
		setProgress(0);
		simulationTimer = setInterval(() => {
			const value = phase === 'initial' ? initialChargeProgress : phase === 'cooldown' ? cooldownProgress : recoveryProgress;
			const nextValue = Math.min(100, value + 5);
			setProgress(nextValue);
			if (nextValue < 100) return;
			if (simulationTimer) clearInterval(simulationTimer);
			simulationTimer = null;
			if (phase === 'initial') initialChargeAtTarget = true;
			else if (phase === 'cooldown') cooldownStable = true;
			else recoveryCompleteByTime = true;
			notice = phase === 'initial' ? 'Demo: Vboost was reached and the charger transitioned to Vfloat. Confirm the result to continue.' : phase === 'cooldown' ? 'Demo: temperature is now stable near ambient. Confirm the result to continue.' : 'Demo: recovery duration is complete. Capture and accept the baseline sample.';
		}, 250);
	}

	async function startDischarge() {
		if (!selectedString) return;
		saving = true; error = '';
		try {
			if (demoMode) {
				dischargeEventId = -1;
				notice = 'Demo discharge completed: 196.8 Ah to 1.80 V/cell. Continue to the recovery charge step.';
				return;
			}
			if (!hasBmsSession()) {
				notice = 'The workflow is ready. Connect to the BMS to start and record the controlled discharge.';
				return;
			}
			const event = await createDischargeEvent(`str${selectedString.stringIndex}`, new Date(startTime), charge.capacityAh, config.automaticMode, discharge.current, 'BASELINE_CALIBRATION', 'NOMINAL_CAPACITY');
			dischargeEventId = (event as { id?: number })?.id ?? null;
			notice = 'Controlled discharge was requested from the BMS. Review live samples and stop at the configured cut-off.';
			await loadAll();
		} catch (cause) { error = message(cause); } finally { saving = false; }
	}

	function continueToRecovery() {
		if (!standardLoadConnected) { error = 'Confirm that the standard discharge load was connected before completing the discharge result.'; return; }
		if (!discharge.usedAh || !discharge.minimumCellVoltage || !discharge.stopReason) { error = 'Record discharged capacity, lowest cell voltage, and stop reason before continuing.'; return; }
		error = ''; stageIndex += 1;
	}

	async function approveBaseline() {
		if (!reviewerName.trim()) { error = 'Enter the reviewer name before approving the baseline.'; return; }
		if (!captureComplete) { error = 'Complete all required baseline measurements before approval.'; return; }
		saving = true; error = '';
		try {
			const event = events.find((item) => item.id === dischargeEventId) ?? currentEvents.find((item) => item.status === 'SUCCESS');
			if (event && hasBmsSession()) {
				await activateBaselineEvent(`str${selectedStringIndex}`, event.id);
				await loadAll();
			}
			reportApproved = true;
			view = 'report';
			notice = event ? 'Baseline approved and activated.' : 'Baseline report approved locally. Activation will be available when the backend baseline API is connected.';
		} catch (cause) { error = message(cause); } finally { saving = false; }
	}

	async function stop(event: DischargeEvent) { try { await stopDischargeEvent(event.id); await loadAll(); } catch (cause) { error = message(cause); } }
	async function remove(event: DischargeEvent) { if (!confirm(`Delete discharge event ${event.id}?`)) return; try { await deleteDischargeEvent(event.id); await loadAll(); } catch (cause) { error = message(cause); } }
	async function activate(event: DischargeEvent) { try { await activateBaselineEvent(`str${selectedStringIndex}`, event.id); await loadAll(); } catch (cause) { error = message(cause); } }
	async function refresh() { await loadAll(); notice = 'Calibration data refreshed.'; }
	function localDate() { const date = new Date(), pad = (value: number) => String(value).padStart(2, '0'); return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`; }
	function message(cause: unknown) { return cause instanceof Error ? cause.message : 'Request failed.'; }
</script>

{#if view === 'overview'}
	<section class="page">
		<header class="page-head"><div><span class="eyebrow">BMS / COMMISSIONING</span><h2><BatteryCharging size={25} />Baseline Calibration</h2><p>Create a controlled, auditable reference baseline before a VRLA string enters service.</p></div><button class="secondary" onclick={refresh}><RefreshCw size={16} />Refresh</button></header>
		{#if demoMode}<div class="demo-banner"><span>DEMO MODE</span><div><strong>Sample VRLA data is being used.</strong><small>No BMS request will be sent; you can complete the full wizard and approval report safely.</small></div><button class="secondary" onclick={beginCalibration}><Play size={15}/>Start guided demo</button></div>{/if}
		{#if notice}<div class="notice"><Check size={16} />{notice}</div>{/if}{#if error}<div class="error"><AlertTriangle size={16} />{error}</div>{/if}
		<section class="panel setup"><div class="section-heading"><div><h3>Start a baseline calibration</h3><p>The wizard follows the initial charge, controlled discharge, recovery, and baseline capture procedure.</p></div><span class="required">Required before activation</span></div><div class="setup-grid"><label>Battery string<select bind:value={selectedStringIndex} onchange={applyStringProfile}><option value={0}>Select a configured string</option>{#each strings as item}<option value={item.stringIndex}>str{item.stringIndex} — {item.stringName}</option>{/each}</select></label><div class="readonly"><span>Rated capacity</span><strong>{selectedString?.ratedCapacity ?? '—'} Ah</strong></div><div class="readonly"><span>Existing baseline</span><strong>{activeBaseline ? `Event ${activeBaseline.id}` : 'None active'}</strong></div><button class="primary" disabled={!selectedStringIndex} onclick={beginCalibration}><Plus size={17} />New baseline</button></div></section>
		<section class="reference-grid"><article><ShieldCheck size={20}/><div><strong>Safety-led workflow</strong><span>Mandatory pre-checks and operator acknowledgement are captured before any test starts.</span></div></article><article><Gauge size={20}/><div><strong>Per-cell evidence</strong><span>Baseline voltage, temperature and resistance are recorded after recharge.</span></div></article><article><FileText size={20}/><div><strong>Traceable approval</strong><span>Only a reviewed, complete report can become the active reference baseline.</span></div></article></section>
		<section class="panel history"><div class="section-heading"><div><h3>Discharge event history</h3><p>Existing BMS discharge events remain available while the dedicated baseline API is being added.</p></div></div><EventTable items={currentEvents} onselect={() => undefined} onstop={stop} onremove={remove} onactivate={activate}/></section>
	</section>
{:else if view === 'wizard'}
	<section class="page wizard-page">
		<header class="page-head"><div><button class="back-link" onclick={backToOverview}><ArrowLeft size={16}/>All calibrations</button><span class="eyebrow">INITIAL BASELINE / {selectedString?.stringName ?? 'STRING'}</span><h2>{stage.label}</h2><p>{stage.detail}</p></div><div class="stage-counter">Step {stageIndex + 1} of {stages.length}</div></header>
		{#if demoMode}<div class="demo-banner compact"><span>DEMO MODE</span><div><strong>Simulated evidence is pre-filled.</strong><small>Adjust any value to explore the review flow.</small></div></div>{/if}
		{#if notice}<div class="notice"><Check size={16} />{notice}</div>{/if}{#if error}<div class="error"><AlertTriangle size={16} />{error}</div>{/if}
		<nav class="stepper" aria-label="Baseline calibration steps">{#each stages as item, index}<button class:active={index === stageIndex} class:done={index < stageIndex} onclick={() => { if (index <= stageIndex) stageIndex = index; }} aria-current={index === stageIndex ? 'step' : undefined}><span>{index < stageIndex ? '✓' : item.short}</span><strong>{item.label}</strong></button>{/each}</nav>
		<section class="workspace-panel">
			{#if stage.id === 'PRECHECK'}
				<div class="content-heading"><ClipboardCheck size={22}/><div><h3>Confirm safe test conditions</h3><p>These actions are physical checks. The BMS records the acknowledgement; it does not operate MCBs or connect the test load.</p></div></div>
				<div class="form-grid"><label>Operator name<input bind:value={operatorName} placeholder="Person performing the test" /></label><label>Planned discharge start<input type="datetime-local" bind:value={startTime}/></label></div><div class="checklist">{#each precheck as item}<label><input type="checkbox" bind:checked={item.checked}/><span>{item.label}</span>{#if item.required}<em>Required</em>{/if}</label>{/each}</div>
			{:else if stage.id === 'INITIAL_CHARGE'}
				<div class="content-heading"><BatteryCharging size={22}/><div><h3>Initial charge profile</h3><p>Values are prefilled for the current string; confirm them against the battery manufacturer datasheet before proceeding.</p></div></div>
				<div class="form-grid three"><label>Cell/block count<input type="number" min="1" bind:value={charge.cellCount}/></label><label>Rated capacity (Ah)<input type="number" min="1" bind:value={charge.capacityAh} oninput={chooseDischargeProfile}/></label><label>Ambient temperature (°C)<input type="number" bind:value={charge.ambientTemperature}/></label><label>Boost voltage Vboost (VDC)<input type="number" bind:value={charge.boostVoltage}/></label><label>Float voltage Vfloat (VDC)<input type="number" bind:value={charge.floatVoltage}/></label><label>Charge-current limit (A)<input type="number" bind:value={charge.currentLimit}/></label></div><div class="info-callout"><AlertTriangle size={17}/><span>The displayed 251 V / 236 V / 40 A values are reference values for a 106-cell, 200 Ah example at 30°C—not universal defaults.</span></div>
				<div class="phase-card"><div class="phase-status"><span class:ready={initialChargeAtTarget}>{initialChargeAtTarget ? 'TARGET REACHED' : initialChargeRunning ? 'CHARGING' : 'NOT STARTED'}</span><div><strong>Boost → Float confirmation</strong><small>Continue only after the measured string voltage reached Vboost and the charger has transitioned to Vfloat.</small></div></div>{#if demoMode && initialChargeRunning}<div class="simulation-progress"><div><span>Simulated charger progress</span><strong>{initialChargeProgress}%</strong></div><i><b style={`width:${initialChargeProgress}%`}></b></i></div>{/if}<div class="phase-actions"><button class="secondary" disabled={initialChargeRunning} onclick={startInitialCharge}><Play size={15}/>Start initial charge</button><button class="secondary" disabled={!initialChargeRunning || initialChargeAtTarget} onclick={markInitialChargeAtTarget}><Gauge size={15}/>Record targets reached</button><label class="confirm-check"><input type="checkbox" bind:checked={initialChargeConfirmed} disabled={!initialChargeAtTarget}/>I confirm the actual readings meet the configured charge targets.</label></div></div>
			{:else if stage.id === 'COOLDOWN'}
				<div class="content-heading"><Thermometer size={22}/><div><h3>Isolate charger and cool down</h3><p>Open the charger DC MCB first. Then wait until cell/block temperature is close to the target ambient value and confirm the result.</p></div></div><div class="form-grid three"><label>Ambient temperature reference (°C)<input type="number" bind:value={charge.ambientTemperature}/></label><label>Near-ambient target (°C)<input type="number" step=".1" bind:value={cooldownTargetTemperature}/></label><div class="readonly"><span>Target delta</span><strong>≤ {Math.abs(cooldownTargetTemperature - charge.ambientTemperature).toFixed(1)} °C</strong></div></div><div class="mcb-card"><Power size={20}/><div><strong>Charger DC MCB</strong><span>This is a physical operation. Confirm it only after the charger has been isolated.</span></div><label class="confirm-check"><input type="checkbox" bind:checked={chargerMcbOpen}/>Charger DC MCB is open</label></div><div class="phase-card"><div class="phase-status"><span class:ready={cooldownStable}>{cooldownStable ? 'STABLE' : cooldownRunning ? 'WAITING' : 'NOT STARTED'}</span><div><strong>Temperature stability wait</strong><small>Backend telemetry should compare every cell/block temperature with the configured target before enabling this confirmation.</small></div></div>{#if demoMode && cooldownRunning}<div class="simulation-progress"><div><span>Simulated cool-down progress</span><strong>{cooldownProgress}%</strong></div><i><b style={`width:${cooldownProgress}%`}></b></i></div>{/if}<div class="phase-actions"><button class="secondary" disabled={cooldownRunning || !chargerMcbOpen} onclick={startCooldown}><Clock3 size={15}/>Start cool-down wait</button><button class="secondary" disabled={!cooldownRunning || cooldownStable} onclick={markCooldownStable}><Thermometer size={15}/>Record temperature stable</button><label class="confirm-check"><input type="checkbox" bind:checked={cooldownConfirmed} disabled={!cooldownStable}/>I confirm temperatures are near ambient.</label></div></div><div class="checklist">{#each cooldown as item}<label><input type="checkbox" bind:checked={item.checked}/><span>{item.label}</span>{#if item.required}<em>Required</em>{/if}</label>{/each}</div>
			{:else if stage.id === 'DISCHARGE'}
				<div class="content-heading"><Play size={22}/><div><h3>Controlled discharge</h3><p>Discharge monitoring follows the original BMS workspace: configure an event, watch its selected event data, then confirm the terminal result.</p></div></div>
				<div class="discharge-tabs"><button class:active={dischargeTab === 'event'} onclick={() => dischargeTab = 'event'}>Discharge Event</button><button class:active={dischargeTab === 'history'} onclick={() => dischargeTab = 'history'}>Discharge Event History</button></div>
				{#if dischargeTab === 'event'}
					<div class="event-controls"><label>String<select bind:value={selectedStringIndex} onchange={applyStringProfile}>{#each strings as item}<option value={item.stringIndex}>str{item.stringIndex} — {item.stringName}</option>{/each}</select></label><label>Start time<input type="datetime-local" bind:value={startTime}/></label><label>Discharge profile<select bind:value={discharge.cRate} onchange={chooseDischargeProfile}><option value="0.1C10">0.1C10 — 10 h</option><option value="0.2C5">0.2C5 — 5 h</option></select></label><label>Test current (A)<input type="number" min="1" bind:value={discharge.current}/></label><label>Cut-off/cell (VDC)<input type="number" step=".01" bind:value={discharge.cutoffPerCell}/></label><label>Sampling interval (min)<input type="number" min="1" bind:value={discharge.sampleMinutes}/></label><button class="primary" disabled={saving} onclick={startDischarge}><Play size={16}/>Schedule event</button></div>
					<div class="safety-banner"><AlertTriangle size={19}/><div><strong>Stop condition</strong><span>Stop at the first cell reaching cut-off: 1.80 V/cell at 0.1C10 or 1.75 V/cell at 0.2C5 unless the manufacturer profile is stricter.</span></div></div><label class="physical-confirm"><input type="checkbox" bind:checked={standardLoadConnected}/><span><strong>Standard load connected</strong><small>I confirm the string is connected to the standard 0.1C10 / 0.2C5 test load before the event starts.</small></span></label>
					<section class="selected-event"><div class="section-heading"><div><h3>Selected discharge event</h3><p>{dischargeEventId ? `Event ${dischargeEventId} is selected.` : 'Schedule an event to bind live BMS samples.'}</p></div><span class:running={!!dischargeEventId} class="event-badge">{dischargeEventId ? 'RUNNING / DEMO' : 'PENDING'}</span></div><div class="event-summary"><span>Start</span><strong>{startTime.replace('T', ' ')}</strong><span>Current</span><strong>{discharge.current} A</strong><span>Cut-off</span><strong>{discharge.cutoffPerCell} V/cell</strong><span>Used Ah</span><strong>{discharge.usedAh || '—'}</strong></div><DischargeTrendChart demo={demoMode && !!dischargeEventId} cutoffPerCell={Number(discharge.cutoffPerCell)} /></section>
					<div class="form-grid three result-grid"><label>Discharged capacity (Ah)<input type="number" min="0" bind:value={discharge.usedAh} placeholder="Record at cut-off"/></label><label>Lowest cell voltage (VDC)<input type="number" step=".01" bind:value={discharge.minimumCellVoltage} placeholder="First cell at cut-off"/></label><label>Stop reason<select bind:value={discharge.stopReason}><option value="">Select reason</option><option value="CELL_CUTOFF">Cell reached configured cut-off</option><option value="OPERATOR_STOP">Operator stopped test</option><option value="SAFETY_ALARM">Safety alarm</option></select></label></div><button class="secondary" onclick={continueToRecovery}>Record result and continue <ArrowRight size={16}/></button>
				{:else}
					<section class="selected-event"><div class="section-heading"><div><h3>Discharge event history</h3><p>Historical baseline calibration and SoH check events for the selected string.</p></div></div><EventTable items={currentEvents} onselect={() => undefined} onstop={stop} onremove={remove} onactivate={activate}/></section>
				{/if}
			{:else if stage.id === 'RECOVERY'}
				<div class="content-heading"><BatteryCharging size={22}/><div><h3>Recovery, baseline measurement and restoration</h3><p>After cut-off, this follows the document order: remove test load → recovery charge → no-load baseline measurement → isolate charger → restore load → capture loaded ripple → return to float operation.</p></div></div><div class="recovery-sequence"><label class="physical-confirm"><input type="checkbox" bind:checked={testLoadDisconnected}/><span><strong>1. Test load disconnected</strong><small>I confirm the discharge load was removed from the battery string.</small></span></label><label class="physical-confirm"><input type="checkbox" bind:checked={recoveryMcbClosed} disabled={!testLoadDisconnected}/><span><strong>2. Charger DC MCB closed for recovery</strong><small>I confirm the charger is connected to start boost/recovery charging.</small></span></label></div><div class="form-grid three"><label>Recovery duration (hours)<input type="number" min="4" max="8" bind:value={recoveryDurationHours}/></label><div class="readonly"><span>Recovery profile</span><strong>Boost 4–8 h → float to full</strong></div><div class="readonly"><span>Current state</span><strong>{recoveryCompleteByTime ? 'Duration complete' : recoveryRunning ? 'Charging' : 'Not started'}</strong></div></div><div class="phase-card"><div class="phase-status"><span class:ready={recoveryCompleteByTime}>{recoveryCompleteByTime ? 'COMPLETE' : recoveryRunning ? 'RUNNING' : 'NOT STARTED'}</span><div><strong>3. Timed recovery charge</strong><small>Run the configured boost recovery duration, then continue float charge until full.</small></div></div>{#if demoMode && recoveryRunning}<div class="simulation-progress"><div><span>Simulated recovery-charge progress</span><strong>{recoveryProgress}%</strong></div><i><b style={`width:${recoveryProgress}%`}></b></i></div>{/if}<div class="phase-actions"><button class="secondary" disabled={recoveryRunning} onclick={startRecoveryCharge}><Clock3 size={15}/>Start recovery timer</button><button class="secondary" disabled={!recoveryRunning || recoveryCompleteByTime} onclick={markRecoveryTimeComplete}><Check size={15}/>Confirm duration complete</button></div></div><div class="checklist">{#each recovery as item}<label><input type="checkbox" bind:checked={item.checked}/><span>{item.label}</span>{#if item.required}<em>Required</em>{/if}</label>{/each}</div><div class="sample-confirm"><div><strong>4. No-load baseline sample</strong><span>Take and accept string/cell voltage, midpoint, float current, charger output, resistance, temperatures and ripple without load.</span></div><button class="secondary" disabled={!recoveryCompleteByTime || sampleCaptured} onclick={captureRecoverySample}><Gauge size={15}/>Take sample values</button><label class="confirm-check"><input type="checkbox" bind:checked={sampleAccepted} disabled={!sampleCaptured}/>I accept the no-load values.</label></div><div class="recovery-sequence"><label class="physical-confirm"><input type="checkbox" bind:checked={chargerMcbOpenedAfterSample} disabled={!sampleAccepted}/><span><strong>5. Charger DC MCB opened after measurement</strong><small>I confirm the charger was isolated after no-load baseline measurement.</small></span></label><label class="physical-confirm"><input type="checkbox" bind:checked={loadMcbClosed} disabled={!chargerMcbOpenedAfterSample}/><span><strong>6. Load MCB closed</strong><small>I confirm the DC MCB supplying the load was restored.</small></span></label><label class="physical-confirm"><input type="checkbox" bind:checked={loadedRippleCaptured} disabled={!loadMcbClosed}/><span><strong>7. Loaded ripple recorded</strong><small>I confirm AC ripple was measured again with the load connected.</small></span></label><label class="physical-confirm"><input type="checkbox" bind:checked={floatVoltageVerified} disabled={!loadedRippleCaptured}/><span><strong>8. Float voltage verified / adjusted</strong><small>I confirm the required Vfloat was checked or adjusted.</small></span></label><label class="physical-confirm"><input type="checkbox" bind:checked={floatMcbClosed} disabled={!floatVoltageVerified}/><span><strong>9. Charger DC MCB closed for float operation</strong><small>I confirm the string is back in normal float-charge operation.</small></span></label></div>
			{:else if stage.id === 'CAPTURE'}
				<div class="content-heading"><Gauge size={22}/><div><h3>Initial baseline report data</h3><p>This step shows the complete set of first-charge/discharge baseline values required by the VRLA procedure.</p></div></div><div class="baseline-discharge"><div><span>Discharged capacity to Vcut-off</span><strong>{discharge.usedAh || '—'} Ah</strong></div><div><span>Initial SOH baseline</span><strong>{reportSoH === null ? '—' : `${reportSoH.toFixed(1)}%`}</strong></div><div><span>Lowest cell at cut-off</span><strong>{discharge.minimumCellVoltage || '—'} VDC</strong></div><div><span>Stop reason</span><strong>{discharge.stopReason || '—'}</strong></div></div><div class="measurement-grid">{#each measurements as item}<label><span>{item.label}{#if item.required}<em>Required</em>{/if}</span><div><input bind:value={item.value} inputmode="decimal" placeholder="—"/><select bind:value={item.source}><option value="BMS">BMS</option><option value="MANUAL_METER">Manual meter</option><option value="CALCULATED">Calculated</option></select><small>{item.unit}</small></div></label>{/each}</div><div class="cell-title"><div><h3>Cell/block baseline: voltage, negative-terminal temperature and resistance</h3><p>Includes the required cell/block voltage, individual temperature, and fully charged internal resistance. Showing the first 12 positions until the complete snapshot API is available.</p></div><span>{charge.cellCount} cells configured</span></div><div class="cell-table"><table><thead><tr><th>Cell / block</th><th>Voltage (VDC)</th><th>Temperature (°C)</th><th>Resistance (µΩ)</th><th>Source</th></tr></thead><tbody>{#each cellMeasurements as cell}<tr><td>{cell.cell}</td><td><input bind:value={cell.voltage} placeholder="—"/></td><td><input bind:value={cell.temperature} placeholder="—"/></td><td><input bind:value={cell.resistance} placeholder="—"/></td><td><select bind:value={cell.source}><option value="BMS">BMS</option><option value="MANUAL_METER">Manual meter</option></select></td></tr>{/each}</tbody></table></div>
			{:else}
				<div class="content-heading"><FileText size={22}/><div><h3>Baseline report review</h3><p>Confirm the report is complete, then approve it as the immutable reference for this string.</p></div></div><div class="review-grid"><article><span>Discharged capacity</span><strong>{discharge.usedAh || '—'} Ah</strong></article><article><span>Initial SOH</span><strong>{reportSoH === null ? '—' : `${reportSoH.toFixed(1)}%`}</strong></article><article><span>Lowest cell voltage</span><strong>{discharge.minimumCellVoltage || '—'} VDC</strong></article><article><span>Baseline readings</span><strong>{measurements.filter((item) => item.value).length}/{measurements.length}</strong></article></div><div class="approval"><CheckCircle2 size={23}/><div><strong>Approval makes the report read-only</strong><span>The current frontend uses the existing discharge-event activation where available. The backend must enforce completeness, approvals, audit history, and immutable snapshots.</span></div></div><label class="reviewer">Reviewer / approver name<input bind:value={reviewerName} placeholder="Person approving this baseline" /></label>
			{/if}
		</section>
		<footer class="wizard-footer"><button class="secondary" disabled={stageIndex === 0} onclick={previous}><ArrowLeft size={16}/>Back</button>{#if stage.id !== 'REVIEW' && stage.id !== 'DISCHARGE'}<button class="primary" disabled={!canContinue()} onclick={next}>Continue <ArrowRight size={16}/></button>{:else if stage.id === 'REVIEW'}<button class="primary" disabled={saving || !captureComplete} onclick={approveBaseline}><CheckCircle2 size={16}/>Approve baseline</button>{/if}</footer>
	</section>
{:else}
	<section class="page report-page"><header class="page-head"><div><span class="eyebrow">BASELINE REPORT / APPROVED</span><h2><CheckCircle2 size={25}/>Initial baseline recorded</h2><p>{selectedString?.stringName ?? 'Battery string'} is ready to use this report as its comparison reference.</p></div><button class="secondary" onclick={backToOverview}>Back to calibrations</button></header><section class="report-card"><div class="report-status"><CheckCircle2 size={26}/><div><strong>{reportApproved ? 'Approved baseline' : 'Draft baseline'}</strong><span>Approved by {reviewerName || '—'} · performed by {operatorName || '—'}</span></div></div><div class="review-grid"><article><span>Capacity</span><strong>{discharge.usedAh || '—'} Ah</strong></article><article><span>SOH baseline</span><strong>{reportSoH === null ? '—' : `${reportSoH.toFixed(1)}%`}</strong></article><article><span>Profile</span><strong>{discharge.cRate}</strong></article><article><span>Cut-off</span><strong>{discharge.cutoffPerCell} V/cell</strong></article></div><h3>Integration status</h3><p class="report-copy">The UX, manual evidence capture, procedure gates, and report review are ready. Activating the record from this screen uses the existing discharge event API when it is available. The future baseline API will persist the full measurement snapshot and audit trail.</p></section></section>
{/if}

<style>
	.page{max-width:1420px;margin:0 auto;color:#33425d}.page-head{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;margin-bottom:20px}.eyebrow{display:block;margin-bottom:6px;color:#3860ad;font-size:11px;font-weight:700;letter-spacing:.09em}.page-head h2{display:flex;align-items:center;gap:9px;margin:0;color:#172b4d;font-size:25px;font-weight:600}.page-head p{max-width:720px;margin:7px 0 0;color:#718096;font-size:15px;line-height:1.45}.primary,.secondary,.back-link{display:inline-flex;align-items:center;justify-content:center;gap:7px;min-height:39px;padding:0 14px;border-radius:8px;font:inherit;font-size:14px;font-weight:500;cursor:pointer}.primary{border:0;color:#fff;background:#1749ad}.primary:hover{background:#123f95}.primary:disabled,.secondary:disabled{opacity:.55;cursor:not-allowed}.secondary{border:1px solid #d7dfeb;color:#40516f;background:#fff}.back-link{min-height:auto;margin:0 0 12px;padding:0;border:0;color:#4164a8;background:transparent;font-size:13px}.demo-banner{display:flex;align-items:center;gap:12px;margin:-4px 0 15px;padding:12px 14px;border:1px solid #bad4fa;border-radius:10px;color:#315e9e;background:#eff6ff}.demo-banner>span{padding:4px 7px;border-radius:5px;color:#fff;background:#3164ab;font-size:10px;font-weight:700;letter-spacing:.06em}.demo-banner div{display:grid;gap:3px}.demo-banner strong{font-size:13px}.demo-banner small{color:#577495;font-size:12px}.demo-banner .secondary{min-height:32px;margin-left:auto;padding:0 10px;font-size:12px}.demo-banner.compact{margin-top:-7px}.panel,.workspace-panel,.report-card{overflow:hidden;border:1px solid #e0e7f1;border-radius:12px;background:#fff;box-shadow:0 7px 22px rgba(35,54,89,.04)}.setup{padding:19px}.section-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:17px}.section-heading h3,.content-heading h3,.cell-title h3{margin:0;color:#273853;font-size:17px;font-weight:600}.section-heading p,.content-heading p,.cell-title p{margin:5px 0 0;color:#7b879b;font-size:13px;line-height:1.45}.required{padding:5px 8px;border-radius:12px;color:#985a05;background:#fff7e9;font-size:11px;white-space:nowrap}.setup-grid{display:grid;grid-template-columns:minmax(200px,1.6fr) 1fr 1fr auto;align-items:end;gap:13px}.setup-grid label,.form-grid label,.reviewer{display:grid;gap:6px;color:#536078;font-size:12px;font-weight:500}.readonly{display:grid;gap:8px;height:64px;padding:10px 12px;border:1px solid #e1e7f0;border-radius:8px;background:#f9fbfe}.readonly span{color:#8490a3;font-size:11px}.readonly strong{color:#30415d;font-size:14px}.setup-grid select,input,select{width:100%;height:39px;padding:0 10px;border:1px solid #d7dfeb;border-radius:7px;color:#273853;background:#fff;font:inherit;font-size:14px}.reference-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin:15px 0}.reference-grid article{display:flex;gap:12px;padding:16px;border:1px solid #dde7f8;border-radius:11px;color:#24509a;background:#f8fbff}.reference-grid div{display:grid;gap:5px}.reference-grid strong{color:#2d4268;font-size:14px}.reference-grid span{color:#718098;font-size:12px;line-height:1.45}.history{margin-top:16px}.history .section-heading{padding:17px 19px;margin:0;border-bottom:1px solid #edf0f4}.notice,.error{display:flex;align-items:center;gap:8px;margin-bottom:14px;padding:10px 12px;border-radius:8px;font-size:13px}.notice{color:#28784e;background:#f2fbf5;border:1px solid #cae7d5}.error{color:#b42318;background:#fff1f0;border:1px solid #f3cac6}.stage-counter{padding:8px 11px;border-radius:7px;color:#42629a;background:#eef4ff;font-size:12px;font-weight:600;white-space:nowrap}.stepper{display:grid;grid-template-columns:repeat(7,minmax(112px,1fr));overflow-x:auto;margin-bottom:16px;border:1px solid #dfe6f0;border-radius:11px;background:#fff}.stepper button{display:grid;grid-template-columns:25px 1fr;align-items:center;gap:7px;min-width:112px;padding:12px 10px;border:0;border-right:1px solid #edf0f5;color:#718096;background:#fff;text-align:left;cursor:pointer}.stepper button:last-child{border-right:0}.stepper button span{display:grid;width:23px;height:23px;place-items:center;border:1px solid #d7dfeb;border-radius:50%;font-size:11px}.stepper button strong{font-size:11px;font-weight:500;line-height:1.2}.stepper button.active{color:#1749ad;background:#f2f6ff}.stepper button.active span,.stepper button.done span{border-color:#1749ad;color:#fff;background:#1749ad}.stepper button.done{color:#4065a8}.workspace-panel{min-height:465px;padding:23px}.content-heading{display:flex;gap:11px;margin-bottom:21px;color:#315b9f}.form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.form-grid.three{grid-template-columns:repeat(3,minmax(0,1fr))}.form-grid.four{grid-template-columns:repeat(4,minmax(0,1fr))}.checklist{display:grid;gap:0;margin-top:10px;border:1px solid #e1e8f2;border-radius:10px;overflow:hidden}.checklist label{display:flex;align-items:center;gap:11px;padding:14px 15px;border-bottom:1px solid #edf0f4;color:#43536d;font-size:14px;line-height:1.35}.checklist label:last-child{border-bottom:0}.checklist input{width:17px;height:17px;flex:none}.checklist em,.measurement-grid em{margin-left:auto;color:#a36510;font-size:10px;font-style:normal;text-transform:uppercase}.info-callout,.safety-banner,.approval{display:flex;gap:10px;margin-top:17px;padding:13px 14px;border-radius:9px;color:#79560d;background:#fff8e8;font-size:13px;line-height:1.45}.safety-banner{align-items:flex-start;color:#a23b32;background:#fff4f2;border:1px solid #f2d1cd}.safety-banner div{display:grid;gap:3px}.safety-banner strong{font-size:13px}.phase-card,.selected-event{margin-top:18px;padding:16px;border:1px solid #dce5f2;border-radius:10px;background:#fbfcff}.phase-status{display:flex;align-items:flex-start;gap:11px}.phase-status>span{min-width:90px;padding:5px 7px;border-radius:5px;color:#7c6a41;background:#fff3d5;font-size:10px;font-weight:700;text-align:center}.phase-status>span.ready{color:#27734a;background:#e6f7eb}.phase-status div{display:grid;gap:3px}.phase-status strong{color:#31445f;font-size:14px}.phase-status small{color:#74839a;font-size:12px;line-height:1.4}.simulation-progress{margin-top:15px}.simulation-progress>div{display:flex;justify-content:space-between;color:#62758f;font-size:12px}.simulation-progress i{display:block;height:8px;margin-top:7px;overflow:hidden;border-radius:6px;background:#e6edf6}.simulation-progress b{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,#3b73cd,#39a36c);transition:width .22s linear}.phase-actions{display:flex;align-items:center;flex-wrap:wrap;gap:11px;margin-top:15px}.confirm-check{display:flex!important;align-items:center;gap:8px;color:#455773;font-size:12px!important}.confirm-check input{width:16px;height:16px}.mcb-card{display:flex;align-items:center;gap:12px;margin-top:16px;padding:13px 14px;border:1px solid #f0dbc0;border-radius:9px;color:#7a5d28;background:#fff9ee}.mcb-card div{display:grid;gap:3px}.mcb-card strong{font-size:14px}.mcb-card span{font-size:12px;line-height:1.4}.mcb-card .confirm-check{margin-left:auto}.discharge-tabs{display:flex;margin-bottom:16px;border-bottom:1px solid #dfe6f0}.discharge-tabs button{height:39px;padding:0 13px;border:0;border-bottom:2px solid transparent;color:#697890;background:transparent;font:inherit;font-size:13px;cursor:pointer}.discharge-tabs button.active{border-color:#1749ad;color:#1749ad;font-weight:600}.event-controls{display:grid;grid-template-columns:repeat(6,minmax(0,1fr)) auto;align-items:end;gap:11px;padding:14px;border:1px solid #e0e7f1;border-radius:10px;background:#f9fbfe}.event-controls label{display:grid;gap:6px;color:#536078;font-size:12px}.event-badge{padding:5px 8px;border-radius:12px;color:#8a6a3b;background:#fff5df;font-size:11px}.event-badge.running{color:#267449;background:#e9f8ef}.event-summary{display:grid;grid-template-columns:repeat(4,auto);gap:8px 15px;margin-top:12px}.event-summary span{color:#8290a4;font-size:11px}.event-summary strong{color:#32445f;font-size:13px}.curve-panel{margin-top:17px;padding:13px;border:1px solid #e1e8f1;border-radius:8px;background:#fff}.curve-heading{display:flex;justify-content:space-between;color:#435672;font-size:12px}.curve-heading span{color:#8793a5}.curve{position:relative;height:126px;margin-top:12px;border-bottom:1px solid #dce4ef;background:repeating-linear-gradient(to bottom,transparent 0,transparent 30px,#edf1f6 31px)}.curve:after{position:absolute;inset:12px 4% 16px;content:"";border-top:3px solid #3c72c7;border-radius:50% 55% 60% 58%;transform:skewY(15deg)}.curve i{position:absolute;z-index:1;width:7px;height:7px;border:2px solid #3c72c7;border-radius:50%;background:#fff}.curve-labels{display:flex;justify-content:space-between;margin-top:6px;color:#8693a6;font-size:11px}.result-grid{margin:18px 0}.sample-confirm{display:flex;align-items:center;gap:14px;margin-top:17px;padding:14px;border:1px solid #dce5f2;border-radius:9px;background:#f9fbff}.sample-confirm div{display:grid;gap:4px;margin-right:auto}.sample-confirm strong{color:#31445f;font-size:14px}.sample-confirm span{color:#77869b;font-size:12px}.mcb-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:16px}.mcb-grid>label{display:flex;align-items:flex-start;gap:10px;padding:14px;border:1px solid #e1e8f2;border-radius:9px;background:#fff}.mcb-grid input{width:17px;height:17px}.mcb-grid span{display:grid;gap:4px;color:#5270a5}.mcb-grid strong{color:#354965;font-size:14px}.mcb-grid small{color:#7e8ca0;font-size:12px;line-height:1.4}.baseline-discharge{display:grid;grid-template-columns:repeat(4,1fr);gap:11px;margin-bottom:17px}.baseline-discharge div{display:grid;gap:6px;padding:13px;border:1px solid #e1e8f3;border-radius:9px;background:#f9fbfe}.baseline-discharge span{color:#7c899b;font-size:11px}.baseline-discharge strong{color:#2d4264;font-size:16px}.measurement-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:11px}.measurement-grid label{display:grid;gap:6px;padding:11px;border:1px solid #e1e7f0;border-radius:8px;color:#536078;font-size:12px}.measurement-grid label>span{display:flex;gap:4px}.measurement-grid label>div{display:grid;grid-template-columns:1fr 118px 50px;gap:7px;align-items:center}.measurement-grid small{color:#8692a3;font-size:11px}.cell-title{display:flex;align-items:end;justify-content:space-between;gap:15px;margin:25px 0 11px}.cell-title>span{color:#76849a;font-size:12px}.cell-table{overflow:auto;border:1px solid #e1e7f0;border-radius:9px}.cell-table table{width:100%;min-width:720px;border-collapse:collapse}.cell-table th,.cell-table td{padding:9px 11px;border-bottom:1px solid #edf1f5;color:#536078;font-size:12px;text-align:left}.cell-table th{color:#718098;background:#f8faff;font-size:10px;text-transform:uppercase}.cell-table tr:last-child td{border-bottom:0}.cell-table input,.cell-table select{height:33px;font-size:12px}.review-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:11px}.review-grid article{display:grid;gap:7px;padding:15px;border:1px solid #e1e8f3;border-radius:9px;background:#f9fbfe}.review-grid span{color:#7c899b;font-size:11px}.review-grid strong{color:#2d4264;font-size:18px;font-weight:600}.approval{align-items:flex-start;margin:20px 0;color:#256548;background:#f2fbf5;border:1px solid #cae7d5}.approval div{display:grid;gap:4px}.approval span{color:#5d7969;font-size:12px}.reviewer{max-width:430px}.wizard-footer{display:flex;justify-content:space-between;margin-top:16px}.report-card{padding:25px;max-width:950px}.report-status{display:flex;align-items:center;gap:12px;margin-bottom:23px;color:#28784e}.report-status div{display:grid;gap:4px}.report-status strong{font-size:18px}.report-status span{color:#688274;font-size:13px}.report-card h3{margin:25px 0 7px;color:#31425e;font-size:16px}.report-copy{max-width:720px;margin:0;color:#6f7d92;font-size:13px;line-height:1.55}@media(max-width:1100px){.setup-grid,.event-controls{grid-template-columns:repeat(2,1fr)}.form-grid.four{grid-template-columns:repeat(2,1fr)}.stepper{grid-template-columns:repeat(7,150px)}.reference-grid{grid-template-columns:1fr}.measurement-grid{grid-template-columns:1fr}.review-grid,.baseline-discharge{grid-template-columns:repeat(2,1fr)}}@media(max-width:650px){.page-head{flex-direction:column}.setup-grid,.form-grid,.form-grid.three,.form-grid.four,.event-controls,.mcb-grid{grid-template-columns:1fr}.workspace-panel{padding:16px}.review-grid,.baseline-discharge{grid-template-columns:1fr}.measurement-grid label>div{grid-template-columns:1fr}.stage-counter{align-self:flex-start}.reference-grid{gap:10px}.cell-title{align-items:flex-start;flex-direction:column}.demo-banner,.sample-confirm{align-items:flex-start;flex-wrap:wrap}.demo-banner .secondary{margin-left:0}.mcb-card{align-items:flex-start;flex-wrap:wrap}.mcb-card .confirm-check{margin-left:0}}
	.physical-confirm{display:flex;align-items:flex-start;gap:10px;margin-top:14px;padding:13px;border:1px solid #e1e8f2;border-radius:9px;color:#4a5c77;background:#fbfcff}.physical-confirm input{width:17px;height:17px;flex:none}.physical-confirm span{display:grid;gap:4px}.physical-confirm strong{color:#354965;font-size:13px}.physical-confirm small{color:#7e8ca0;font-size:12px;line-height:1.4}.recovery-sequence{display:grid;gap:10px;margin-top:16px}
	/* Fill the content region on desktop while retaining the compact layouts below. */
	.page{width:100%;max-width:none;margin:0}
	.report-card{max-width:none}
	@media (max-width:1280px) and (min-width:1101px){.event-controls{grid-template-columns:repeat(3,minmax(0,1fr))}.event-controls .primary{grid-column:span 3}}
</style>
