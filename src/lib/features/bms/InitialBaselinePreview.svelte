<script lang="ts">
	import { onMount } from 'svelte';
	import { AlertTriangle, ArrowLeft, CheckCircle2, ClipboardCheck, Play } from '@lucide/svelte';
	import type { BatteryString } from '$lib/services/bms-api';
	import type { InitialBaselineDemoTicket } from './initial-baseline-demo';
	import DischargeTrendChart from './DischargeTrendChart.svelte';

	type BaselineStep = {
		title: string;
		action: string;
		checklist: string[];
		records: string[];
	};

	let { stringName, batteryString, ticket, onTicketChange, onBack }: { stringName: string; batteryString: BatteryString | null; ticket: InitialBaselineDemoTicket; onTicketChange: (ticket: InitialBaselineDemoTicket) => void; onBack: () => void } = $props();

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
	let checkedItems = $state<Record<string, boolean>>({});
	let demoComplete = $state(false);
	let completionDialog = $state(false);
	let now = $state(Date.now());
	let cellCount = $derived(batteryString?.cellQty ?? 106);
	let boostVoltagePerCell = $derived(batteryString?.boostVoltage ?? 2.37);
	let floatVoltagePerCell = $derived(batteryString?.floatVoltage ?? 2.23);
	let boostVoltage = $derived(boostVoltagePerCell * cellCount);
	let floatVoltage = $derived(floatVoltagePerCell * cellCount);
	let currentLimit = $derived((batteryString?.ratedCapacity ?? 200) * 0.2);
	let dischargeProfile = $state<'0.1C10' | '0.2C5'>('0.1C10');
	let dischargeSamplingMinutes = $state('30');
	let dischargeLoadConnected = $state(false);
	let dischargeScheduled = $state(false);
	let dischargeStartedAt = $state<number | null>(null);
	let dischargeResultRecorded = $state(false);
	let dischargedCapacity = $state('196.8');
	let lowestCellVoltage = $state('1.80');
	let dischargeStopReason = $state('CELL_CUTOFF');
	let recoveryMcbClosed = $state(false);
	let recoverySettingsVerified = $state(false);
	let recoveryStartedAt = $state<number | null>(null);
	let recoveryChargeConfirmed = $state(false);
	let recoveryFloatStartedAt = $state<number | null>(null);
	let recoveryFloatConfirmed = $state(false);
	let resistanceMeasured = $state(false);
	let floatCurrentMeasured = $state(false);
	let midpointMeasured = $state(false);
	let rippleNoLoadMeasured = $state(false);
	let chargerOpenedForLoad = $state(false);
	let loadMcbClosed = $state(false);
	let rippleWithLoadMeasured = $state(false);
	let recoveryBaselineAccepted = $state(false);
	let summaryApproved = $state(false);
	let internalResistance = $state('0.22');
	let floatCurrent = $state('82');
	let midpointVoltage = $state((floatVoltage / 2).toFixed(1));
	let rippleNoLoad = $state('0.6');
	let rippleWithLoad = $state('0.8');
	let dischargeCurrent = $derived((batteryString?.ratedCapacity ?? 200) * (dischargeProfile === '0.2C5' ? 0.2 : 0.1));
	let dischargeCutoff = $derived(dischargeProfile === '0.2C5' ? 1.75 : 1.8);
	let dischargeProgress = $derived(dischargeStartedAt == null ? 0 : Math.min(100, Math.floor((now - dischargeStartedAt) / 120)));
	let dischargeComplete = $derived(dischargeProgress >= 100);
	let demoDischargedCapacity = $derived(((batteryString?.ratedCapacity ?? 200) * .984 * dischargeProgress / 100).toFixed(1));
	let recoveryProgress = $derived(recoveryStartedAt == null ? 0 : Math.min(100, Math.floor((now - recoveryStartedAt) / 120)));
	let recoveryChargeComplete = $derived(recoveryProgress >= 100);
	let recoveryFloatProgress = $derived(recoveryFloatStartedAt == null ? 0 : Math.min(100, Math.floor((now - recoveryFloatStartedAt) / 60)));
	let recoveryFloatComplete = $derived(recoveryFloatProgress >= 100);
	let recoveryStartVoltage = $derived(dischargeCutoff * cellCount);
	let recoveryBoostVoltage = $derived(recoveryStartVoltage + ((boostVoltage - recoveryStartVoltage) * recoveryProgress / 100));
	let recoveryFloatVoltage = $derived(boostVoltage - ((boostVoltage - floatVoltage) * recoveryFloatProgress / 100));
	let initialSoh = $derived(Math.min(100, (Number(dischargedCapacity || 0) / (batteryString?.ratedCapacity ?? 200)) * 100));
	let boostProgress = $derived(ticket.boostStartedAt == null ? 0 : Math.min(100, Math.floor((now - ticket.boostStartedAt) / 120)));
	let boostReached = $derived(boostProgress >= 100);
	let boostConfirmed = $derived(ticket.boostConfirmed);
	let floatProgress = $derived(ticket.boostConfirmedAt == null ? 0 : Math.min(100, Math.floor((now - ticket.boostConfirmedAt) / 60)));
	let floatReached = $derived(floatProgress >= 100);
	let floatConfirmed = $derived(ticket.floatConfirmed);
	let initialSettingsVerified = $derived(ticket.initialSettingsVerified);
	let ambientTemperature = $state(25.5);
	let cooldownThresholdInput = $state(ticket.cooldownAllowedTemperatureDelta?.toString() ?? '0.3');
	let allowedTemperatureDelta = $derived(Number(cooldownThresholdInput) || 0.3);
	let cooldownManualApproved = $state(false);
	let cooldownExceptionAccepted = $state(false);
	let cooldownManualReason = $state('');
	let cooldownDurationInput = $state(ticket.cooldownDurationMinutes?.toString() ?? '30');
	let demoStringVoltage = $derived(floatVoltage + ((boostVoltage - floatVoltage) * boostProgress / 100));
	let demoFloatVoltage = $derived(boostVoltage - ((boostVoltage - floatVoltage) * floatProgress / 100));
	let cooldownProgress = $derived(ticket.cooldownStartedAt == null ? 0 : Math.min(100, Math.floor((now - ticket.cooldownStartedAt) / 120)));
	let cooldownElapsedSeconds = $derived(ticket.cooldownStartedAt == null ? 0 : Math.min(12, Math.floor((now - ticket.cooldownStartedAt) / 1000)));
	// The demo deliberately settles at 0.4 °C above ambient, so the operator can
	// review and approve the out-of-range path. Real values will come from the BMS.
	let farthestCellTemperature = $derived(26.5 - (0.6 * cooldownProgress / 100));
	let cooldownTemperatureDelta = $derived(Math.abs(farthestCellTemperature - ambientTemperature));
	let cooldownTemperaturePassed = $derived(cooldownTemperatureDelta <= allowedTemperatureDelta + 0.000001);
	let readOnly = $derived(ticket.status === 'COMPLETED');
	let summaryValues = $derived(ticket.summary ?? { stringVoltage: floatVoltage.toFixed(1), midpointVoltage, dischargedCapacity, initialSoh: initialSoh.toFixed(1), lowestCellVoltage, stopReason: dischargeStopReason, floatCurrent, internalResistance, ambientTemperature: ambientTemperature.toFixed(1), temperatureDelta: cooldownTemperatureDelta.toFixed(1), allowedTemperatureDelta: allowedTemperatureDelta.toFixed(1), rippleNoLoad, rippleWithLoad });
	let cooldownReady = $derived(!!checkedItems['2-0'] && (cooldownTemperaturePassed || cooldownManualApproved) && !!checkedItems['2-1'] && !!checkedItems['2-2']);
	let stepReady = $derived(selectedIndex === 1
		? initialSettingsVerified && boostReached && boostConfirmed && floatReached && floatConfirmed
		: selectedIndex === 2 ? cooldownReady
		: selectedIndex === 3 ? dischargeLoadConnected && dischargeScheduled && dischargeComplete && dischargeResultRecorded
		: selectedIndex === 4 ? recoveryMcbClosed && recoverySettingsVerified && recoveryChargeComplete && recoveryChargeConfirmed && recoveryFloatComplete && recoveryFloatConfirmed && resistanceMeasured && floatCurrentMeasured && midpointMeasured && rippleNoLoadMeasured && chargerOpenedForLoad && loadMcbClosed && rippleWithLoadMeasured && recoveryBaselineAccepted
		: selectedIndex === 5 ? summaryApproved
		: selected.checklist.every((_, index) => checkedItems[`${selectedIndex}-${index}`]));

	function toggleItem(index: number, checked: boolean) {
		checkedItems = { ...checkedItems, [`${selectedIndex}-${index}`]: checked };
	}

	function isChecklistItemVisible(index: number) {
		return index === 0 || selected.checklist.slice(0, index).every((_, previousIndex) => checkedItems[`${selectedIndex}-${previousIndex}`]);
	}

	function updateTicket(patch: Partial<InitialBaselineDemoTicket>) {
		onTicketChange({ ...ticket, ...patch, updatedAt: Date.now() });
	}

	function startBoostCharge() {
		if (ticket.boostStartedAt || boostReached) return;
		updateTicket({ boostStartedAt: Date.now(), status: 'CHARGING', currentStep: 1 });
	}

	function confirmBoost(checked: boolean) {
		updateTicket({ boostConfirmed: checked, boostConfirmedAt: checked ? Date.now() : null, status: checked ? 'AWAITING_FLOAT_CONFIRMATION' : 'AWAITING_BOOST_CONFIRMATION' });
	}

	function confirmChargerIsolated(checked: boolean) {
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

	function startRecoveryCharge() {
		if (!recoveryMcbClosed) return;
		recoveryStartedAt = Date.now();
	}

	function confirmRecoveryCharge(checked: boolean) {
		recoveryChargeConfirmed = checked;
		recoveryFloatStartedAt = checked ? Date.now() : null;
		if (!checked) recoveryFloatConfirmed = false;
	}

	function formatDemoDuration(seconds: number) {
		return `00:${seconds.toString().padStart(2, '0')}`;
	}

	function nextStep() {
		if (!stepReady) return;
		if (selectedIndex === steps.length - 1) {
			demoComplete = true;
			completionDialog = true;
			updateTicket({ status: 'COMPLETED', currentStep: selectedIndex, completedAt: Date.now(), summary: { stringVoltage: floatVoltage.toFixed(1), midpointVoltage, dischargedCapacity, initialSoh: initialSoh.toFixed(1), lowestCellVoltage, stopReason: dischargeStopReason, floatCurrent, internalResistance, ambientTemperature: ambientTemperature.toFixed(1), temperatureDelta: cooldownTemperatureDelta.toFixed(1), allowedTemperatureDelta: allowedTemperatureDelta.toFixed(1), rippleNoLoad, rippleWithLoad } });
		} else {
			selectedIndex += 1;
			updateTicket({ currentStep: selectedIndex, status: 'IN_PROGRESS' });
		}
	}

	onMount(() => {
		selectedIndex = ticket.status === 'COMPLETED' ? steps.length - 1 : Math.min(ticket.currentStep, steps.length - 1);
		const timer = window.setInterval(() => {
			now = Date.now();
			if (ticket.boostStartedAt && boostReached && ticket.status === 'CHARGING') updateTicket({ status: 'AWAITING_BOOST_CONFIRMATION' });
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
	<div class="demo-banner"><ClipboardCheck size={18} /><span>{readOnly ? 'Completed event record — values are read-only.' : ticket.status === 'CHARGING' ? 'Charging is running in the background. You can safely leave this page.' : 'Demo ticket is saved on this device. No command is sent to the BMS.'}</span></div>

	<nav class="stepper" aria-label="Initial Baseline steps">
		{#each steps as step, index}
			<button class:active={index === selectedIndex} aria-current={index === selectedIndex ? 'step' : undefined} disabled={readOnly && index !== steps.length - 1} onclick={() => { if (!readOnly) selectedIndex = index; }}>
				<span>{index + 1}</span><strong>{step.title}</strong>
			</button>
		{/each}
	</nav>

	<section class="workspace-panel" aria-live="polite">
		<div class="content-heading"><ClipboardCheck size={21} /><div><span>STEP {selectedIndex + 1} OF {steps.length}</span><h3>{selected.title}</h3></div></div>
		<div class="action-card"><span>WHAT TO DO</span><strong>{selected.action}</strong></div>
		{#if selectedIndex === 1}
			<section class="charge-workflow">
				<div class="charge-targets"><div><span>Vboost target</span><strong>{boostVoltage.toFixed(1)} V</strong><small>{boostVoltagePerCell.toFixed(2)} V/cell × {cellCount} cells</small></div><div><span>Vfloat target</span><strong>{floatVoltage.toFixed(1)} V</strong><small>{floatVoltagePerCell.toFixed(2)} V/cell × {cellCount} cells</small></div><div><span>Current limit</span><strong>{currentLimit.toFixed(1)} A</strong><small>20% of rated capacity</small></div></div>
				<label class="charge-confirm"><input type="checkbox" checked={initialSettingsVerified} onchange={(event) => updateTicket({ initialSettingsVerified: event.currentTarget.checked })} /><span><strong>Verify charge settings</strong><small>Targets match the approved Battery String configuration.</small></span></label>
				{#if initialSettingsVerified}
					<div class="charge-status"><div class="status-head"><div><span>Boost charge</span><strong>{boostReached ? 'Vboost reached' : 'Charging to Vboost'}</strong></div><b>{demoStringVoltage.toFixed(1)} V / {boostVoltage.toFixed(1)} V</b></div><div class="progress"><i style={`width:${boostProgress}%`}></i></div>{#if !boostReached}<button class="secondary" onclick={startBoostCharge}>{boostProgress > 0 ? 'Charging…' : 'Start demo charge'}</button>{/if}</div>
					{#if boostReached}<label class="charge-confirm"><input type="checkbox" checked={boostConfirmed} onchange={(event) => confirmBoost(event.currentTarget.checked)} /><span><strong>Confirm Vboost reached</strong><small>Measured string voltage has reached the configured target.</small></span></label>{/if}
					{#if boostConfirmed}<div class:ready={floatReached} class="charge-status"><div class="status-head"><div><span>Float charge</span><strong>{floatReached ? 'Vfloat target reached' : 'Charging and settling to Vfloat'}</strong></div><b>{demoFloatVoltage.toFixed(1)} V / {floatVoltage.toFixed(1)} V</b></div><div class="progress float-progress"><i style={`width:${floatProgress}%`}></i></div>{#if !floatReached}<div class="waiting"><i></i> Charger output is regulating to the Float target</div>{/if}</div>{/if}
					{#if floatReached}<label class="charge-confirm"><input type="checkbox" checked={floatConfirmed} onchange={(event) => updateTicket({ floatConfirmed: event.currentTarget.checked })} /><span><strong>Confirm Float mode</strong><small>Charger voltage has settled at the configured Vfloat target.</small></span></label>{/if}
				{/if}
			</section>
		{:else if selectedIndex === 2}
			<section class="cooldown-workflow">
				<label class="charge-confirm"><input type="checkbox" checked={checkedItems['2-0'] ?? false} onchange={(event) => confirmChargerIsolated(event.currentTarget.checked)} /><span><strong>Confirm charger DC MCB is open</strong><small>Cool-down monitoring starts only after the charger is isolated.</small></span></label>
				{#if checkedItems['2-0']}
					{#if ticket.cooldownStartedAt == null}<div class="cooldown-setup"><div><span>Monitoring setup</span><strong>Set the maximum monitoring time and the allowed difference from ambient temperature.</strong></div><label><span>Max. time</span><div><input type="number" min="1" max="480" bind:value={cooldownDurationInput} aria-label="Maximum cool-down time in minutes" /><small>min</small></div></label><label><span>Allowed delta</span><div><input type="number" min="0.1" max="5" step="0.1" bind:value={cooldownThresholdInput} aria-label="Allowed temperature difference in degrees Celsius" /><small>°C</small></div></label><button class="secondary" disabled={!Number.isInteger(Number(cooldownDurationInput)) || Number(cooldownDurationInput) < 1 || Number(cooldownDurationInput) > 480 || !Number.isFinite(Number(cooldownThresholdInput)) || Number(cooldownThresholdInput) <= 0 || Number(cooldownThresholdInput) > 5} onclick={startCooldownMonitoring}>Start monitoring</button></div>{:else}
					<div class:failed={!cooldownTemperaturePassed && cooldownProgress === 100 && !cooldownManualApproved} class:ready={cooldownTemperaturePassed || cooldownManualApproved} class="temperature-status"><div class="status-head"><div><span>Temperature check</span><strong>{cooldownTemperaturePassed ? 'Temperature is within the allowed range' : cooldownManualApproved ? 'Out-of-range result approved' : cooldownProgress === 100 ? 'Maximum monitoring time reached' : 'Cooling down to the allowed range'}</strong></div><b>{cooldownTemperatureDelta.toFixed(1)} °C / {allowedTemperatureDelta.toFixed(1)} °C</b></div><div class="progress cooldown-progress"><i style={`width:${cooldownProgress}%`}></i></div>{#if !cooldownTemperaturePassed && cooldownProgress < 100}<div class="waiting"><i></i> Monitoring {formatDemoDuration(cooldownElapsedSeconds)} / 00:12 demo · configured limit: {ticket.cooldownDurationMinutes} min</div>{:else if !cooldownTemperaturePassed}<div class="timeout-note">Monitoring stopped after the configured {ticket.cooldownDurationMinutes} minutes. Review the final result below.</div>{/if}<div class="temperature-metrics"><div><span>Ambient</span><strong>{ambientTemperature.toFixed(1)} °C</strong></div><div><span>Farthest cell</span><strong>{farthestCellTemperature.toFixed(1)} °C</strong></div><div><span>Allowed delta</span><strong>≤ {allowedTemperatureDelta.toFixed(1)} °C</strong></div></div><p class="duration-note"><b>Actual operation:</b> monitoring ends when the configured limit is reached. If the temperature condition is still outside the limit, an operator exception is required to continue.</p></div>
					{/if}
					{#if !cooldownTemperaturePassed && cooldownProgress === 100 && !cooldownManualApproved}<div class="manual-approval"><strong>Threshold not reached</strong><span>Measured difference is <b>{cooldownTemperatureDelta.toFixed(1)} °C</b>, exceeding the configured limit of <b>{allowedTemperatureDelta.toFixed(1)} °C</b> by <b>{(cooldownTemperatureDelta - allowedTemperatureDelta).toFixed(1)} °C</b>. You may continue only after accepting this exception.</span><label class="exception-confirm"><input type="checkbox" bind:checked={cooldownExceptionAccepted} /><span>I accept the measured difference of {cooldownTemperatureDelta.toFixed(1)} °C for this baseline.</span></label><input placeholder="Required approval reason" bind:value={cooldownManualReason} /><button class="secondary" disabled={!cooldownExceptionAccepted || !cooldownManualReason.trim()} onclick={approveCooldownException}>Approve exception and continue</button></div>{/if}
					{#if cooldownTemperaturePassed && !cooldownManualApproved}<label class="charge-confirm"><input type="checkbox" checked={checkedItems['2-1'] ?? false} onchange={(event) => toggleItem(1, event.currentTarget.checked)} /><span><strong>Confirm temperature result</strong><small>BMS temperature condition is passed.</small></span></label>{/if}
					{#if checkedItems['2-1']}<label class="charge-confirm"><input type="checkbox" checked={checkedItems['2-2'] ?? false} onchange={(event) => toggleItem(2, event.currentTarget.checked)} /><span><strong>Confirm safety valves are checked</strong><small>Check for leakage, deformation or physical damage before discharge.</small></span></label>{/if}
				{/if}
			</section>
		{:else if selectedIndex === 3}
			<section class="discharge-workflow">
				<div class="discharge-controls"><label>Discharge profile<select bind:value={dischargeProfile} disabled={dischargeScheduled}><option value="0.1C10">0.1C10 — 10 h</option><option value="0.2C5">0.2C5 — 5 h</option></select></label><label>Test current (A)<input value={dischargeCurrent.toFixed(1)} readonly /></label><label>Cut-off / cell (VDC)<input value={dischargeCutoff.toFixed(2)} readonly /></label><label>Sampling interval (min)<input type="number" min="1" bind:value={dischargeSamplingMinutes} disabled={dischargeScheduled} /></label></div>
				<div class="safety-banner"><AlertTriangle size={18} /><div><strong>Stop condition</strong><span>Stop at the first cell reaching {dischargeCutoff.toFixed(2)} V/cell, or sooner if a safety alarm occurs.</span></div></div>
				<label class="charge-confirm"><input type="checkbox" bind:checked={dischargeLoadConnected} disabled={dischargeScheduled} /><span><strong>Confirm standard load is connected</strong><small>Connect the approved test load before scheduling the discharge event.</small></span></label>
				{#if !dischargeScheduled}<button class="secondary schedule-discharge" disabled={!dischargeLoadConnected || !Number(dischargeSamplingMinutes)} onclick={scheduleDischarge}><Play size={15} />Schedule discharge event</button>{:else}
					<section class="selected-discharge"><header><div><span>Selected discharge event</span><strong>{dischargeComplete ? 'Cut-off reached / demo' : 'Running / demo'}</strong></div><b>{dischargeCurrent.toFixed(1)} A · {demoDischargedCapacity} Ah</b></header><DischargeTrendChart demo={true} cutoffPerCell={dischargeCutoff} progress={dischargeProgress} />{#if !dischargeComplete}<div class="discharge-running"><i></i><span>Discharging {formatDemoDuration(Math.min(12, Math.floor(dischargeProgress * .12)))} / 00:12 demo</span><b>{demoDischargedCapacity} Ah used</b></div>{/if}</section>
					{#if dischargeComplete}<div class="discharge-results"><label>Discharged capacity (Ah)<input type="number" min="0" bind:value={dischargedCapacity} /></label><label>Lowest cell voltage (VDC)<input type="number" step="0.01" bind:value={lowestCellVoltage} /></label><label>Stop reason<select bind:value={dischargeStopReason}><option value="CELL_CUTOFF">Cell reached configured cut-off</option><option value="OPERATOR_STOP">Operator stopped test</option><option value="SAFETY_ALARM">Safety alarm</option></select></label></div>
					<label class="charge-confirm"><input type="checkbox" bind:checked={dischargeResultRecorded} /><span><strong>Confirm discharge result</strong><small>Capacity, lowest cell voltage and stop reason have been recorded.</small></span></label>{/if}
				{/if}
			</section>
		{:else if selectedIndex === 4}
			<section class="recovery-workflow">
				<label class="charge-confirm"><input type="checkbox" bind:checked={recoveryMcbClosed} disabled={recoveryStartedAt !== null} /><span><strong>Confirm charger DC MCB is closed</strong><small>Reconnect the charger before starting the recovery charge.</small></span></label>
				{#if recoveryMcbClosed}<div class="charge-targets"><div><span>Vboost target</span><strong>{boostVoltage.toFixed(1)} V</strong><small>{boostVoltagePerCell.toFixed(2)} V/cell × {cellCount} cells</small></div><div><span>Vfloat target</span><strong>{floatVoltage.toFixed(1)} V</strong><small>{floatVoltagePerCell.toFixed(2)} V/cell × {cellCount} cells</small></div><div><span>Current limit</span><strong>{currentLimit.toFixed(1)} A</strong><small>20% of rated capacity</small></div></div>
				<label class="charge-confirm"><input type="checkbox" bind:checked={recoverySettingsVerified} disabled={recoveryStartedAt !== null} /><span><strong>Verify recovery charge settings</strong><small>Targets match the approved Battery String configuration.</small></span></label>{/if}
				{#if recoveryMcbClosed && recoverySettingsVerified && recoveryStartedAt === null}<button class="secondary schedule-discharge" onclick={startRecoveryCharge}>Start recovery charge</button>{/if}
				{#if recoveryStartedAt !== null}<div class:ready={recoveryChargeComplete} class="charge-status"><div class="status-head"><div><span>Recovery boost charge</span><strong>{recoveryChargeComplete ? 'Vboost target reached' : 'Charging to Vboost'}</strong></div><b>{recoveryBoostVoltage.toFixed(1)} V / {boostVoltage.toFixed(1)} V</b></div><div class="progress"><i style={`width:${recoveryProgress}%`}></i></div>{#if !recoveryChargeComplete}<div class="waiting"><i></i> Recovery charging · demo time accelerated</div>{/if}</div>{/if}
				{#if recoveryChargeComplete}<label class="charge-confirm"><input type="checkbox" checked={recoveryChargeConfirmed} onchange={(event) => confirmRecoveryCharge(event.currentTarget.checked)} /><span><strong>Confirm Vboost reached</strong><small>Measured string voltage has reached the configured Vboost target.</small></span></label>{/if}
				{#if recoveryChargeConfirmed}<div class:ready={recoveryFloatComplete} class="charge-status"><div class="status-head"><div><span>Float charge</span><strong>{recoveryFloatComplete ? 'Vfloat target reached' : 'Settling to Vfloat'}</strong></div><b>{recoveryFloatVoltage.toFixed(1)} V / {floatVoltage.toFixed(1)} V</b></div><div class="progress float-progress"><i style={`width:${recoveryFloatProgress}%`}></i></div>{#if !recoveryFloatComplete}<div class="waiting"><i></i> Charger output is regulating to the Float target</div>{/if}</div>{/if}
				{#if recoveryFloatComplete}<label class="charge-confirm"><input type="checkbox" bind:checked={recoveryFloatConfirmed} /><span><strong>Confirm Float condition is stable</strong><small>The string is fully charged and ready for baseline measurement.</small></span></label>{/if}
				{#if recoveryFloatConfirmed}<section class="baseline-measurements"><header><div><span>Baseline measurements — no load</span><strong>Record these values while the load is disconnected.</strong></div><small>Required</small></header><div class="baseline-measurement-grid"><label><span>Cell / block resistance (mΩ)</span><input type="number" step="0.01" bind:value={internalResistance} /><input type="checkbox" bind:checked={resistanceMeasured} /></label><label><span>Float current (mA)</span><input type="number" min="0" bind:value={floatCurrent} /><input type="checkbox" bind:checked={floatCurrentMeasured} /><small>New, fully charged: &lt; 100 mA</small></label><label><span>Midpoint voltage (V)</span><input type="number" step="0.1" bind:value={midpointVoltage} /><input type="checkbox" bind:checked={midpointMeasured} /></label><label><span>AC ripple — no load (V)</span><input type="number" step="0.1" bind:value={rippleNoLoad} /><input type="checkbox" bind:checked={rippleNoLoadMeasured} /></label></div></section>{/if}
				{#if resistanceMeasured && floatCurrentMeasured && midpointMeasured && rippleNoLoadMeasured}<label class="charge-confirm"><input type="checkbox" bind:checked={chargerOpenedForLoad} /><span><strong>Confirm charger DC MCB is open</strong><small>Isolate the charger after recording the no-load values.</small></span></label>{/if}
				{#if chargerOpenedForLoad}<label class="charge-confirm"><input type="checkbox" bind:checked={loadMcbClosed} /><span><strong>Confirm load MCB is closed</strong><small>Restore the load before taking the loaded ripple reading.</small></span></label>{/if}
				{#if loadMcbClosed}<div class="loaded-ripple"><span>AC ripple — with load (V)</span><input type="number" step="0.1" bind:value={rippleWithLoad} /><label><input type="checkbox" bind:checked={rippleWithLoadMeasured} />Confirm measured</label></div>{/if}
				{#if rippleWithLoadMeasured}<label class="charge-confirm"><input type="checkbox" bind:checked={recoveryBaselineAccepted} /><span><strong>Accept recovery baseline values</strong><small>Resistance, float current, midpoint and AC ripple have been recorded.</small></span></label>{/if}
			</section>
		{:else if selectedIndex === 5}
			<section class="summary-workflow">
				<div class="summary-heading"><div><span>INITIAL BASELINE EVENT</span><strong>{ticket.id}</strong></div><span>Ready for review</span></div>
				<div class="summary-grid"><article><span>String voltage</span><strong>{summaryValues.stringVoltage} V</strong><small>Float target</small></article><article><span>Midpoint voltage</span><strong>{summaryValues.midpointVoltage} V</strong><small>Baseline</small></article><article><span>Discharged capacity</span><strong>{summaryValues.dischargedCapacity} Ah</strong><small>At cut-off</small></article><article><span>Initial SOH</span><strong>{summaryValues.initialSoh}%</strong><small>From discharge test</small></article><article><span>Lowest cell voltage</span><strong>{summaryValues.lowestCellVoltage} V</strong><small>{summaryValues.stopReason.replaceAll('_', ' ')}</small></article><article><span>Float current</span><strong>{summaryValues.floatCurrent} mA</strong><small>Baseline</small></article><article><span>Cell / block resistance</span><strong>{summaryValues.internalResistance} mΩ</strong><small>Baseline</small></article><article><span>Temperature condition</span><strong>{summaryValues.ambientTemperature} °C</strong><small>Δ {summaryValues.temperatureDelta} °C / ≤ {summaryValues.allowedTemperatureDelta} °C</small></article><article><span>AC ripple</span><strong>{summaryValues.rippleNoLoad} / {summaryValues.rippleWithLoad} V</strong><small>No load / with load</small></article></div>
				{#if !readOnly}<label class="charge-confirm summary-confirm"><input type="checkbox" bind:checked={summaryApproved} /><span><strong>Confirm Initial Baseline summary</strong><small>I have reviewed the event results and accept this data as the Initial Baseline reference.</small></span></label>{/if}
			</section>
		{:else}
			<div class="content-grid">
				<section class="progressive-checklist"><h4>Operator confirmation</h4><p>Complete the current item to unlock the next one.</p><ul>{#each selected.checklist as item, index}{#if isChecklistItemVisible(index)}<li class:complete={checkedItems[`${selectedIndex}-${index}`]}><span class="item-number">{index + 1}</span><label><input type="checkbox" checked={checkedItems[`${selectedIndex}-${index}`] ?? false} onchange={(event) => toggleItem(index, event.currentTarget.checked)} /><CheckCircle2 size={16} /><span>{item}</span></label></li>{/if}{/each}</ul></section>
			</div>
		{/if}
		<section class="record-card"><h4>Data to record</h4><div class="record-list">{#each selected.records as item}<span>{item}</span>{/each}</div></section>
	</section>

	{#if demoComplete}<div class="complete-banner"><CheckCircle2 size={18} /><span>Demo complete. The baseline report is ready for review.</span></div>{/if}
	{#if !readOnly}<footer class="page-footer"><button class="secondary" disabled={selectedIndex === 0} onclick={() => selectedIndex -= 1}>Back</button><button class="primary" disabled={!stepReady} onclick={nextStep}>{selectedIndex === steps.length - 1 ? 'Finish demo' : 'Next step'}</button></footer>{:else}<footer class="page-footer"><span class="history-note">Completed {ticket.completedAt ? new Date(ticket.completedAt).toLocaleString() : ''}</span><button class="primary" onclick={onBack}>Back to events</button></footer>{/if}
	{#if completionDialog}<div class="completion-backdrop" role="presentation"><div class="completion-dialog" role="dialog" aria-modal="true" aria-labelledby="completion-title"><CheckCircle2 size={28} /><h3 id="completion-title">Initial Baseline completed</h3><p>The event summary has been saved. You can view it again from Events as a read-only record.</p><button class="primary" onclick={onBack}>Return to events</button></div></div>{/if}
</section>

<style>
	.baseline-page{width:100%;color:#33425d}.page-head{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;margin-bottom:12px}.back-link{display:inline-flex;align-items:center;gap:7px;margin:0 0 12px;padding:0;border:0;color:#4164a8;background:transparent;font:inherit;font-size:13px;cursor:pointer}.back-link:focus-visible,.stepper button:focus-visible,.secondary:focus-visible,.primary:focus-visible{outline:2px solid #1749ad;outline-offset:2px}.eyebrow{display:block;margin-bottom:6px;color:#3860ad;font-size:11px;font-weight:600;letter-spacing:.09em}.page-head h2{margin:0;color:#172b4d;font-size:25px;font-weight:500}.guide-badge{padding:7px 9px;border-radius:7px;color:#4164a8;background:#eef4ff;font-size:11px;font-weight:600;white-space:nowrap}.demo-banner,.complete-banner{display:flex;align-items:center;gap:9px;margin-bottom:16px;padding:11px 13px;border-radius:9px;color:#315e9e;background:#eff6ff;font-size:12px}.complete-banner{margin:16px 0 0;color:#28734b;background:#edf9f1}.stepper{display:grid;grid-template-columns:repeat(6,minmax(132px,1fr));overflow-x:auto;margin-bottom:16px;border:1px solid #edf1f6;border-radius:11px;background:#fff;box-shadow:0 5px 18px rgba(35,54,89,.025)}.stepper button{display:grid;grid-template-columns:25px 1fr;align-items:center;gap:7px;min-width:132px;padding:12px 10px;border:0;border-right:1px solid #edf0f5;color:#718096;background:#fff;font:inherit;text-align:left;cursor:pointer}.stepper button:last-child{border-right:0}.stepper button span{display:grid;width:23px;height:23px;place-items:center;border:1px solid #d7dfeb;border-radius:50%;font-size:11px}.stepper button strong{font-size:11px;font-weight:500;line-height:1.2}.stepper button.active{color:#1749ad;background:#f2f6ff}.stepper button.active span{border-color:#1749ad;color:#fff;background:#1749ad}.workspace-panel{padding:22px;border:1px solid #edf1f6;border-radius:12px;background:#fff;box-shadow:0 12px 30px rgba(35,54,89,.055)}.content-heading{display:flex;align-items:center;gap:10px;margin-bottom:18px;color:#315b9f}.content-heading div{display:grid;gap:3px}.content-heading span{color:#7590ba;font-size:10px;font-weight:600;letter-spacing:.08em}.content-heading h3{margin:0;color:#273853;font-size:18px;font-weight:500}.action-card{display:grid;gap:6px;padding:15px 16px;border-radius:10px;color:#294f91;background:#f0f5fd}.action-card span{font-size:10px;font-weight:600;letter-spacing:.06em}.action-card strong{font-size:14px;font-weight:500;line-height:1.5}.content-grid{display:grid;grid-template-columns:1.15fr .85fr;gap:12px;margin-top:12px}.content-grid section,.record-card{padding:15px 16px;border-radius:10px;background:#f7f9fc}.content-grid h4,.record-card h4{margin:0 0 11px;color:#40516d;font-size:12px;font-weight:600}.content-grid ul{display:grid;gap:9px;margin:0;padding:0;list-style:none}.content-grid li{color:#52647e;font-size:13px;line-height:1.4}.content-grid li label{display:flex;align-items:flex-start;gap:8px;cursor:pointer}.content-grid li input{width:16px;height:16px;flex:none;margin:1px 0 0;accent-color:#1749ad}.content-grid li :global(svg){flex:none;margin-top:1px;color:#aab5c4}.content-grid li.complete{color:#3d6c55}.content-grid li.complete :global(svg){color:#4f8a6a}.live-card{background:#f5f8fc!important}.live-head{display:flex;align-items:center;justify-content:space-between;gap:8px}.live-head span{padding:4px 6px;border-radius:999px;color:#28734b;background:#e8f7ee;font-size:9px;font-weight:600}.live-metrics{display:grid;gap:7px}.live-metrics div{display:grid;grid-template-columns:1fr auto;gap:2px 8px;padding:8px 0;border-top:1px solid #e6edf5}.live-metrics span{color:#7b899d;font-size:11px}.live-metrics strong{color:#30415d;font-size:13px;font-weight:500}.live-metrics small{grid-column:1/-1;color:#4e8a68;font-size:10px}.record-card{margin-top:12px}.record-list{display:flex;flex-wrap:wrap;gap:7px}.record-list span{padding:6px 8px;border-radius:6px;color:#526b95;background:#edf3fb;font-size:11px}.page-footer{display:flex;justify-content:space-between;margin-top:16px}.primary,.secondary{display:inline-flex;align-items:center;justify-content:center;min-height:39px;padding:0 14px;border-radius:8px;font:inherit;font-size:14px;font-weight:500;cursor:pointer}.primary{border:0;color:#fff;background:#1749ad}.secondary{border:0;color:#40516f;background:#f4f7fb}.primary:disabled,.secondary:disabled{opacity:.55;cursor:not-allowed}.secondary:hover:not(:disabled){background:#eaf0f8}@media(max-width:1100px){.stepper{grid-template-columns:repeat(6,150px)}}@media(max-width:650px){.page-head{flex-direction:column}.guide-badge{align-self:flex-start}.workspace-panel{padding:16px}.content-grid{grid-template-columns:1fr}.page-footer{gap:10px}.page-footer button{flex:1}}
	.charge-workflow{display:grid;gap:11px}.charge-targets{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.charge-targets div{display:grid;gap:5px;padding:13px 14px;border-radius:9px;background:#f5f8fc}.charge-targets span,.charge-status span{color:#718096;font-size:11px}.charge-targets strong{color:#30415d;font-size:16px;font-weight:500}.charge-targets small{color:#7b899d;font-size:10px}.charge-confirm{display:flex;align-items:flex-start;gap:10px;padding:13px 14px;border-radius:9px;color:#52647e;background:#f7f9fc;cursor:pointer}.charge-confirm input{width:17px;height:17px;flex:none;margin:1px 0 0;accent-color:#1749ad}.charge-confirm span{display:grid;gap:3px}.charge-confirm strong{color:#40516d;font-size:13px;font-weight:500}.charge-confirm small{color:#7b899d;font-size:11px;line-height:1.4}.charge-status{display:grid;gap:10px;padding:14px;border-radius:9px;background:#f0f5fd}.charge-status.ready{background:#edf9f1}.status-head{display:flex;align-items:center;justify-content:space-between;gap:12px}.status-head div{display:grid;gap:3px}.status-head strong{color:#294f91;font-size:14px;font-weight:500}.charge-status.ready .status-head strong,.charge-status.ready .status-head b{color:#28734b}.status-head b{color:#315b9f;font-size:13px;font-weight:500}.progress{height:6px;overflow:hidden;border-radius:99px;background:#dce7f8}.progress i{display:block;height:100%;border-radius:inherit;background:#3267c4;transition:width .2s ease}.charge-status .secondary{justify-self:start;min-height:32px;font-size:12px}.waiting{display:flex;align-items:center;gap:7px;color:#5e7598;font-size:12px}.waiting i{width:8px;height:8px;border-radius:50%;background:#4778ce;animation:pulse 1.1s ease-in-out infinite}@keyframes pulse{50%{opacity:.3;transform:scale(.7)}}@media(max-width:650px){.charge-targets{grid-template-columns:1fr}.status-head{align-items:flex-start;flex-direction:column;gap:5px}}
	.progressive-checklist{grid-column:1/-1}.progressive-checklist>p{margin:-3px 0 12px;color:#7b899d;font-size:11px}.progressive-checklist li{display:flex;align-items:flex-start;gap:9px;padding:10px 0;border-top:1px solid #e7edf4}.progressive-checklist .item-number{display:grid;width:20px;height:20px;flex:none;place-items:center;border-radius:50%;color:#5875a3;background:#eaf1fb;font-size:10px;font-weight:600}.progressive-checklist li.complete .item-number{color:#fff;background:#4f8a6a}.progressive-checklist li label{flex:1}
	.float-progress{background:#dceee3}.float-progress i{background:#4f8a6a}.cooldown-progress{background:#dceee3}.cooldown-progress i{background:#4f8a6a}
	.discharge-workflow{display:grid;gap:11px}.discharge-controls,.discharge-results{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.discharge-results{grid-template-columns:repeat(3,1fr)}.discharge-controls label,.discharge-results label{display:grid;gap:5px;color:#718096;font-size:11px}.discharge-controls input,.discharge-controls select,.discharge-results input,.discharge-results select{width:100%;min-height:38px;padding:0 10px;border:1px solid #dce4ef;border-radius:7px;color:#34465f;background:#fbfcfe;font:inherit;font-size:13px}.discharge-controls input[readonly]{color:#566983;background:#f3f6fa}.safety-banner{display:flex;align-items:flex-start;gap:9px;padding:12px 14px;border-radius:9px;color:#9d473c;background:#fff5f3}.safety-banner svg{flex:none;margin-top:1px}.safety-banner div{display:grid;gap:3px}.safety-banner strong{font-size:13px;font-weight:500}.safety-banner span{font-size:11px;line-height:1.4}.schedule-discharge{justify-self:start;min-height:35px;font-size:12px}.selected-discharge{overflow:hidden;border-radius:9px;background:#f7f9fc}.selected-discharge>header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px}.selected-discharge>header div{display:grid;gap:3px}.selected-discharge>header span{color:#718096;font-size:11px}.selected-discharge>header strong{color:#28734b;font-size:13px;font-weight:500}.selected-discharge>header b{color:#405a7e;font-size:12px;font-weight:500}.discharge-running{display:flex;align-items:center;gap:8px;padding:11px 14px;border-top:1px solid #e7edf4;color:#607695;font-size:11px}.discharge-running i{width:8px;height:8px;border-radius:50%;background:#4778ce;animation:pulse 1.1s ease-in-out infinite}.discharge-running b{margin-left:auto;color:#3e639e;font-size:12px;font-weight:500}@media(max-width:800px){.discharge-controls{grid-template-columns:1fr 1fr}.discharge-results{grid-template-columns:1fr}}@media(max-width:650px){.discharge-controls{grid-template-columns:1fr}.selected-discharge>header{align-items:flex-start;flex-direction:column}}
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
</style>
