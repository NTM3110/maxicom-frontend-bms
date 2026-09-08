<script lang="ts">
	import { ChevronDown } from '@lucide/svelte';
	import {
		loadCalibrationCurvePoints,
		type CalibrationCurvePointPage,
		type CalibrationEventDetail,
		type CalibrationHistory,
		type CalibrationProcess,
		type CalibrationSample,
		type CalibrationStage
	} from '$lib/services/bms-api';
	import { formatCalibrationTime } from '$lib/services/calibration-time';

	let {
		event,
		samples,
		history,
		loading,
		error
	}: {
		event: CalibrationEventDetail;
		samples: CalibrationSample[];
		history: CalibrationHistory | null;
		loading: boolean;
		error: string;
	} = $props();

	let selectedSampleId = $state<number | null>(null);
	let selectedCurveCell = $state(1);
	let curvePage = $state<CalibrationCurvePointPage | null>(null);
	let curveLoading = $state(false);
	let curveError = $state('');
	let curveRequest = 0;

	let orderedProcesses = $derived([...event.processes].sort((left, right) => {
		const leftStage = event.stages.find((stage) => stage.calibrationStageId === left.calibrationStageId)?.order ?? 0;
		const rightStage = event.stages.find((stage) => stage.calibrationStageId === right.calibrationStageId)?.order ?? 0;
		return leftStage - rightStage || left.order - right.order;
	}));
	let orderedSamples = $derived([...samples].sort((left, right) => right.sampleId - left.sampleId));
	let selectedSample = $derived(orderedSamples.find((sample) => sample.sampleId === selectedSampleId) ?? orderedSamples[0] ?? null);
	let dischargeProcess = $derived(event.processes.find((process) => process.type === 'CONTROLLED_DISCHARGE') ?? null);
	let dischargeRuntime = $derived(dischargeProcess?.dischargeRuntime ?? null);
	let dischargeCellStates = $derived(Object.entries(dischargeRuntime?.perCellState ?? {})
		.map(([cellIndex, state]) => ({ cellIndex: Number(cellIndex), ...state }))
		.filter((state) => Number.isInteger(state.cellIndex) && state.cellIndex > 0)
		.sort((left, right) => left.cellIndex - right.cellIndex));
	let evidence = $derived([...(history?.evidence ?? [])].sort((left, right) => left.evidenceId - right.evidenceId));
	let transitions = $derived([...(history?.transitions ?? [])].sort((left, right) => left.transitionOrder - right.transitionOrder));

	$effect(() => {
		if (!orderedSamples.length) {
			selectedSampleId = null;
		} else if (selectedSampleId === null || !orderedSamples.some((sample) => sample.sampleId === selectedSampleId)) {
			selectedSampleId = orderedSamples[0].sampleId;
		}
	});

	function stageForId(stageId: number) {
		return event.stages.find((stage) => stage.calibrationStageId === stageId) ?? null;
	}

	function stageLabel(stage: CalibrationStage | null) {
		if (!stage) return 'Unknown stage';
		return ({
			PREREQUISITES: 'Prerequisites', INITIAL_CHARGE: 'Initial charge', PRE_DISCHARGE_FLOAT: 'Pre-discharge float',
			WAITING_FOR_LOAD: 'Waiting for load', DISCHARGE: 'Discharge', LOAD_DISCONNECT: 'Load disconnect',
			RECHARGE: 'Recovery charge', POST_RECHARGE_FLOAT: 'Post-recharge float', BASELINE_CAPTURE: 'Baseline capture',
			COMPLETION: 'Completion'
		} as Record<string, string>)[stage.type] ?? stage.type.replaceAll('_', ' ');
	}

	function processLabel(process: CalibrationProcess | null) {
		if (!process) return 'Manual stage';
		return ({
			BOOST_CHARGE_TO_VBOOST: 'Charge to Vboost', FLOAT_SETTLEMENT_TO_VFLOAT: 'Initial Float stabilization',
			COOL_DOWN_TO_AMBIENT: 'Cool-down to ambient', CONTROLLED_DISCHARGE: 'Controlled discharge',
			RECOVERY_CHARGE_TO_VBOOST: 'Recovery charge to Vboost', RECOVERY_FLOAT_STABILIZATION: 'Recovery Float stabilization',
			VOC_BASELINE_CAPTURE: 'Open-circuit voltage baseline'
		} as Record<string, string>)[process.type] ?? process.type.replaceAll('_', ' ');
	}

	function processForSample(sample: CalibrationSample) {
		return event.processes.find((process) => process.calibrationProcessId === sample.calibrationProcessId) ?? null;
	}

	function finalSample(process: CalibrationProcess) {
		const processSamples = samples.filter((sample) => sample.calibrationProcessId === process.calibrationProcessId
			&& sample.processAttemptNumber === process.attemptNumber).sort((left, right) => left.sampleId - right.sampleId);
		return processSamples.filter((sample) => sample.persistenceReason === 'FINAL_SNAPSHOT').at(-1)
			?? processSamples.at(-1) ?? null;
	}

	function formatNumber(value: number | null | undefined, unit = '', digits = 3) {
		return typeof value !== 'number' || !Number.isFinite(value) ? '—' : `${value.toFixed(digits)}${unit ? ` ${unit}` : ''}`;
	}

	function formatValue(value: unknown) {
		if (value == null || value === '') return '—';
		if (typeof value === 'boolean') return value ? 'Yes' : 'No';
		if (typeof value === 'number') return Number.isFinite(value) ? `${value}` : '—';
		if (typeof value === 'string') return value;
		return JSON.stringify(value);
	}

	function configurationNumber(key: string) {
		const value = event.configuration[key];
		return typeof value === 'number' && Number.isFinite(value) ? value : null;
	}

	function humanize(value: string) {
		return value.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replaceAll('_', ' ').replace(/^./, (first) => first.toUpperCase());
	}

	function evidenceValue(item: NonNullable<CalibrationHistory>['evidence'][number]) {
		if (item.numericValue !== null) return `${formatNumber(item.numericValue)}${item.unit ? ` ${item.unit}` : ''}`;
		return item.textValue?.trim() || 'Confirmed';
	}

	async function loadCurveCell(cellIndex: number) {
		if (!event.referenceCurve) return;
		selectedCurveCell = cellIndex;
		curveLoading = true;
		curveError = '';
		const request = ++curveRequest;
		try {
			const loaded = await loadCalibrationCurvePoints({
				calibrationEventId: event.calibrationEventId,
				curveVersionId: event.referenceCurve.curveVersionId,
				cellIndex,
				offset: 0,
				limit: 2000
			});
			if (request === curveRequest) curvePage = loaded;
		} catch (cause) {
			if (request === curveRequest) curveError = cause instanceof Error ? cause.message : 'Unable to load persisted curve points.';
		} finally {
			if (request === curveRequest) curveLoading = false;
		}
	}
</script>

<section class="report-section" aria-labelledby="baseline-configuration">
	<h4 id="baseline-configuration">Initial Baseline configuration</h4>
	<div class="configuration-groups">
		<section>
			<h5>Charging</h5>
			<div class="metric-grid configuration-grid">
				<div><span>Charge current limit</span><strong>{formatNumber(configurationNumber('chargeCurrentLimitA'), 'A', 1)}</strong></div>
				<div class="paired-card"><span>Temperature compensation</span><strong><b>Float</b>{formatNumber(configurationNumber('floatTemperatureCoefficientMvPerCellC'), 'mV/°C/cell', 1)}</strong><strong><b>Boost</b>{formatNumber(configurationNumber('boostTemperatureCoefficientMvPerCellC'), 'mV/°C/cell', 1)}</strong></div>
			</div>
		</section>
		<section>
			<h5>Float stabilization</h5>
			<div class="metric-grid configuration-grid">
				<div><span>Stable duration</span><strong>{formatNumber(configurationNumber('floatStableDurationMinutes'), 'min', 0)}</strong></div>
				<div><span>Voltage tolerance</span><strong>{formatNumber(configurationNumber('floatVoltageToleranceV'), 'V', 2)}</strong></div>
				<div class="paired-card"><span>Float current range</span><strong><b>Minimum</b>{formatNumber(configurationNumber('floatCurrentMinA'), 'A', 2)}</strong><strong><b>Maximum</b>{formatNumber(configurationNumber('floatCurrentMaxA'), 'A', 2)}</strong></div>
			</div>
		</section>
		<section>
			<h5>Discharge and safety</h5>
			<div class="metric-grid configuration-grid">
				<div><span>Discharge method</span><strong>{formatValue(event.configuration.dischargeMethod)}</strong></div>
				<div><span>Safety floor voltage</span><strong>{formatNumber(configurationNumber('safetyFloorVoltagePerCell'), 'V/cell', 3)}</strong></div>
			</div>
		</section>
	</div>
</section>

<section class="report-section" aria-labelledby="baseline-results">
	<h4 id="baseline-results">Baseline result</h4>
	<div class="metric-grid result-grid">
		<div><span>Persisted samples</span><strong>{samples.length}</strong></div>
		<div><span>Automatic processes</span><strong>{event.processes.length}</strong></div>
		<div><span>Operator records</span><strong>{evidence.length}</strong></div>
		<div><span>Audit transitions</span><strong>{transitions.length}</strong></div>
		<div><span>Safe usable capacity</span><strong>{formatNumber(event.referenceCurve?.stringSafeUsableCapacityAh ?? dischargeRuntime?.stringSafeUsableCapacityAh, 'Ah')}</strong></div>
		<div><span>All-cells endpoint</span><strong>{formatNumber(event.referenceCurve?.allCellsEndpointAh ?? dischargeRuntime?.allCellsEndpointAh, 'Ah')}</strong></div>
		<div><span>Cells at cut-off</span><strong>{dischargeRuntime?.crossedCellCount ?? 0} / {dischargeRuntime?.configuredCellCount ?? event.configuration.cellCount ?? '—'}</strong></div>
		<div><span>Reference Vcurve</span><strong>{event.referenceCurve ? `Version #${event.referenceCurve.curveVersionId} · ${event.referenceCurve.pointCount} points` : 'Not published'}</strong></div>
	</div>
</section>

<section class="report-section" aria-labelledby="process-results">
	<h4 id="process-results">Captured process results</h4>
	<div class="table-wrap"><table><thead><tr><th>Stage / process</th><th>State</th><th>Attempt</th><th>Captured sample</th><th>String voltage</th><th>Current</th><th>Average temperature</th><th>Completed at</th></tr></thead><tbody>
		{#each orderedProcesses as process}
			{@const captured = finalSample(process)}
			<tr>
				<td><strong>{stageLabel(stageForId(process.calibrationStageId))}</strong><span>{processLabel(process)}</span></td>
				<td>{process.state}</td><td>{process.attemptNumber}</td>
				<td>{captured ? `#${captured.sampleId} · ${captured.persistenceReason ?? 'persisted'}` : '—'}</td>
				<td>{formatNumber(captured?.stringVoltageV, 'V')}</td><td>{formatNumber(captured?.domainCurrentA, 'A')}</td>
				<td>{formatNumber(captured?.averageCellTemperatureC, '°C', 1)}</td><td>{formatCalibrationTime(process.completedAt)}</td>
			</tr>
		{/each}
	</tbody></table></div>
</section>

<details class="report-section collapsible">
	<summary><span><b>Per-cell discharge capacity and cut-off</b><small>{dischargeCellStates.length} cell records · click to expand</small></span><span class="summary-icon"><ChevronDown size={18} /></span></summary>
	<div class="details-body">
		{#if dischargeCellStates.length}
			<div class="table-wrap"><table><thead><tr><th>Cell</th><th>Status</th><th>Last voltage</th><th>Last discharged Ah</th><th>Cut-off voltage</th><th>Usable capacity</th></tr></thead><tbody>
				{#each dischargeCellStates as state}<tr><td>#{state.cellIndex}</td><td>{state.cutoffReached ? 'Reached' : 'Pending'}</td><td>{formatNumber(state.lastVoltageV, 'V')}</td><td>{formatNumber(state.lastRawUsedAh, 'Ah')}</td><td>{formatNumber(state.cutoffVoltageV, 'V')}</td><td>{formatNumber(state.cellUsableCapacityAh, 'Ah')}</td></tr>{/each}
			</tbody></table></div>
		{:else}<p class="empty">No per-cell discharge endpoint was persisted.</p>{/if}
	</div>
</details>

<details class="report-section collapsible">
	<summary><span><b>Persisted measurement samples</b><small>{samples.length} samples · select any sample to inspect all cell V/R/T/SoC/SoH values</small></span><span class="summary-icon"><ChevronDown size={18} /></span></summary>
	<div class="details-body">
		{#if loading}<p class="empty">Loading persisted measurements…</p>
		{:else if error}<p class="error">{error}</p>
		{:else if !selectedSample}<p class="empty">No persisted measurement sample is available.</p>
		{:else}
			<label class="sample-picker">Captured sample<select value={selectedSample.sampleId} onchange={(event) => selectedSampleId = Number(event.currentTarget.value)}>
				{#each orderedSamples as sample}<option value={sample.sampleId}>#{sample.sampleId} · {stageLabel(stageForId(sample.calibrationStageId))} · {processLabel(processForSample(sample))} · {sample.persistenceReason ?? 'persisted'} · {formatCalibrationTime(sample.measurementTime)}</option>{/each}
			</select></label>
			<div class="metric-grid sample-metrics">
				<div><span>Measurement time</span><strong>{formatCalibrationTime(selectedSample.measurementTime)}</strong></div>
				<div><span>Persistence / quality</span><strong>{selectedSample.persistenceReason ?? '—'} · {selectedSample.quality ?? '—'}</strong></div>
				<div><span>String / midpoint voltage</span><strong>{formatNumber(selectedSample.stringVoltageV, 'V')} · {formatNumber(selectedSample.midpointVoltageV, 'V')}</strong></div>
				<div><span>Average cell voltage</span><strong>{formatNumber(selectedSample.averageVoltageV, 'V')}</strong></div>
				<div><span>Domain / raw current</span><strong>{formatNumber(selectedSample.domainCurrentA, 'A')} · {formatNumber(selectedSample.rawCurrentA, 'A')}</strong></div>
				<div><span>Ambient / average cell temperature</span><strong>{formatNumber(selectedSample.ambientTemperatureC, '°C', 1)} · {formatNumber(selectedSample.averageCellTemperatureC, '°C', 1)}</strong></div>
				<div><span>Discharged / delta</span><strong>{formatNumber(selectedSample.rawUsedAh, 'Ah')} · {formatNumber(selectedSample.deltaAh, 'Ah')}</strong></div>
				<div><span>SoC / DoD</span><strong>{formatNumber(selectedSample.socPct, '%', 2)} · {formatNumber(selectedSample.dodPct, '%', 2)}</strong></div>
				<div><span>Snapshot</span><strong>{selectedSample.snapshotGeneration} / {selectedSample.snapshotSequence}</strong></div>
				<div><span>Current quality</span><strong>{selectedSample.currentDirection ?? '—'} · {selectedSample.currentQuality ?? '—'}</strong></div>
				<div><span>Float / Boost target</span><strong>{formatNumber(selectedSample.floatTargetVoltageV, 'V')} · {formatNumber(selectedSample.boostTargetVoltageV, 'V')}</strong></div>
				<div><span>Blocker</span><strong>{selectedSample.blockerReason ?? 'None'}</strong></div>
			</div>
			<div class="table-wrap cell-table"><table><thead><tr><th>Cell</th><th>Voltage</th><th>Temperature</th><th>Resistance</th><th>SoC / method</th><th>SoH / method</th><th>Quality / warning</th></tr></thead><tbody>
				{#each selectedSample.cells as cell}<tr><td>#{cell.cellIndex}</td><td>{formatNumber(cell.voltageV, 'V')}</td><td>{formatNumber(cell.temperatureC, '°C', 1)}</td><td>{formatNumber(cell.resistanceUohm, 'µΩ', 0)}</td><td>{formatNumber(cell.socPct, '%', 2)} · {cell.socMethod ?? '—'}</td><td>{formatNumber(cell.sohPct, '%', 2)} · {cell.sohMethod ?? '—'}</td><td>{cell.quality ?? '—'}{cell.availabilityWarning ? ` · ${cell.availabilityWarning}` : ''}</td></tr>{/each}
			</tbody></table></div>
		{/if}
	</div>
</details>

<details class="report-section collapsible" ontoggle={(toggleEvent) => { if (toggleEvent.currentTarget.open && event.referenceCurve && !curvePage && !curveLoading) void loadCurveCell(selectedCurveCell); }}>
	<summary><span><b>Published reference Vcurve</b><small>{event.referenceCurve ? `${event.referenceCurve.pointCount} points · version #${event.referenceCurve.curveVersionId}` : 'Not published'} · click to expand</small></span><span class="summary-icon"><ChevronDown size={18} /></span></summary>
	<div class="details-body">
		{#if event.referenceCurve}
			<div class="metric-grid">
				<div><span>Capacity reference</span><strong>{formatNumber(event.referenceCurve.capacityReferenceAh, 'Ah')}</strong></div>
				<div><span>Safe usable capacity</span><strong>{formatNumber(event.referenceCurve.stringSafeUsableCapacityAh, 'Ah')}</strong></div>
				<div><span>All-cells endpoint</span><strong>{formatNumber(event.referenceCurve.allCellsEndpointAh, 'Ah')}</strong></div>
				<div><span>Published at</span><strong>{formatCalibrationTime(event.referenceCurve.publishedAt)}</strong></div>
				<div><span>Cells / points</span><strong>{event.referenceCurve.cellCount} / {event.referenceCurve.pointCount}</strong></div>
				<div><span>Schema / active baseline</span><strong>{event.referenceCurve.curveSchemaVersion} / {event.referenceCurve.activeBaseline ? 'Yes' : 'No'}</strong></div>
				<div class="wide"><span>Content hash</span><strong>{event.referenceCurve.contentHash}</strong></div>
			</div>
			<label class="sample-picker curve-picker">Cell<select value={selectedCurveCell} onchange={(event) => void loadCurveCell(Number(event.currentTarget.value))}>{#each Array.from({ length: event.referenceCurve.cellCount }, (_, index) => index + 1) as cellIndex}<option value={cellIndex}>Cell #{cellIndex}</option>{/each}</select></label>
			{#if curveLoading}<p class="empty">Loading persisted curve points…</p>
			{:else if curveError}<p class="error">{curveError}</p>
			{:else if curvePage}
				<div class="table-wrap"><table><thead><tr><th>Point</th><th>Rated DoD</th><th>Actual DoD</th><th>Discharged</th><th>Voltage</th><th>Temperature</th><th>Resistance</th><th>SoC</th><th>SoH</th><th>String / average voltage</th><th>Quality</th></tr></thead><tbody>
					{#each curvePage.points as point}<tr><td>{point.pointOrder + 1}</td><td>{formatNumber(point.milestonePercent, '%', 2)}</td><td>{formatNumber(point.normalizedActualDodPercent, '%', 4)}</td><td>{formatNumber(point.dischargedAh, 'Ah')}</td><td>{formatNumber(point.cellVoltageV, 'V')}</td><td>{formatNumber(point.cellTemperatureC, '°C', 1)}</td><td>{formatNumber(point.cellResistanceUohm, 'µΩ', 0)}</td><td>{formatNumber(point.cellSocPct, '%', 2)}</td><td>{formatNumber(point.cellSohPct, '%', 2)}</td><td>{formatNumber(point.stringVoltageV, 'V')} / {formatNumber(point.averageVoltageV, 'V')}</td><td>{point.quality}</td></tr>{/each}
				</tbody></table></div>
			{/if}
		{:else}<p class="empty">This event did not publish a reference curve.</p>{/if}
	</div>
</details>

<details class="report-section collapsible">
	<summary><span><b>Manual evidence</b><small>{evidence.length} persisted operator records · click to expand</small></span><span class="summary-icon"><ChevronDown size={18} /></span></summary>
	<div class="details-body">{#if evidence.length}<div class="table-wrap"><table><thead><tr><th>Stage</th><th>Evidence</th><th>Status</th><th>Value</th><th>Note</th><th>Sample</th><th>Actor</th><th>Recorded at</th></tr></thead><tbody>
		{#each evidence as item}<tr><td>{stageLabel(stageForId(item.calibrationStageId))}</td><td>{humanize(item.evidenceType)}</td><td>{item.status}</td><td>{evidenceValue(item)}</td><td>{item.note ?? '—'}</td><td>{item.calibrationSampleId ? `#${item.calibrationSampleId}` : '—'}</td><td>{item.actorName ?? item.actorId ?? '—'}</td><td>{formatCalibrationTime(item.recordedAt)}</td></tr>{/each}
	</tbody></table></div>{:else}<p class="empty">No manual evidence was persisted.</p>{/if}</div>
</details>

<details class="report-section collapsible">
	<summary><span><b>Transition audit</b><small>{transitions.length} immutable lifecycle transitions · click to expand</small></span><span class="summary-icon"><ChevronDown size={18} /></span></summary>
	<div class="details-body">{#if transitions.length}<div class="table-wrap"><table><thead><tr><th>Order</th><th>Stage</th><th>State change</th><th>Action</th><th>Reason</th><th>Actor</th><th>Event version</th><th>Occurred at</th><th>Evidence payload</th></tr></thead><tbody>
		{#each transitions as item}<tr><td>{item.transitionOrder}</td><td>{stageLabel(stageForId(item.calibrationStageId))}</td><td>{item.fromState ?? '—'} → {item.toState}</td><td>{item.action}</td><td>{item.reason ?? '—'}</td><td>{item.actorName ?? item.actorId ?? 'System'}</td><td>{item.resultingEventVersion}</td><td>{formatCalibrationTime(item.occurredAt)}</td><td class="json">{formatValue(item.evidence)}</td></tr>{/each}
	</tbody></table></div>{:else}<p class="empty">No transition history was persisted.</p>{/if}</div>
</details>

<style>
	.report-section{min-width:0;padding:18px;border:1px solid #e0e7f1;border-radius:12px;background:#fff;box-shadow:0 7px 22px rgba(35,54,89,.04)}
	.report-section h4{margin:0 0 13px;color:#30415d;font-size:15px}.metric-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.metric-grid>div{display:grid;gap:5px;padding:10px;border:1px solid #edf1f6;border-radius:8px;background:#f9fbfe}.metric-grid span{color:#718096;font-size:11px}.metric-grid strong{color:#2e415e;font-size:13px;font-weight:600;overflow-wrap:anywhere}.configuration-groups{display:grid;gap:16px}.configuration-groups>section{display:grid;gap:9px}.configuration-groups h5{margin:0;color:#52647e;font-size:12px;font-weight:700}.configuration-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.paired-card{grid-template-columns:1fr 1fr}.paired-card>span{grid-column:1/-1}.paired-card strong{display:grid;gap:3px}.paired-card strong b{color:#7a8799;font-size:10px;font-weight:500}.result-grid>div{min-height:62px}.wide{grid-column:span 2}.table-wrap{max-width:100%;overflow-x:auto}table{width:100%;min-width:900px;border-collapse:collapse;font-size:12px}th,td{padding:10px 9px;border-bottom:1px solid #e8edf4;text-align:left;vertical-align:top}th{color:#667893;background:#f8fafd;font-size:11px;font-weight:700}td{color:#3d4f69;overflow-wrap:anywhere}td strong,td span{display:block}td span{margin-top:3px;color:#718096;font-size:11px}.collapsible{padding:0;overflow:hidden}.collapsible summary{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:17px 18px;color:#30415d;cursor:pointer;list-style:none}.collapsible summary::-webkit-details-marker{display:none}.collapsible summary>span:first-child{display:grid;gap:4px}.collapsible summary b{font-size:15px}.collapsible summary small{color:#718096;font-size:11px;font-weight:400}.summary-icon{display:grid;flex:none;transition:transform .18s ease}.collapsible[open] .summary-icon{transform:rotate(180deg)}.collapsible[open] summary{border-bottom:1px solid #e8edf4}.details-body{display:grid;gap:15px;padding:18px}.sample-picker{display:grid;gap:6px;color:#536078;font-size:12px}.sample-picker select{width:100%;min-height:39px;padding:0 10px;border:1px solid #d7dfeb;border-radius:7px;color:#30415d;background:#fff;font:inherit}.curve-picker{max-width:260px}.sample-metrics{margin-top:2px}.cell-table{max-height:540px;border:1px solid #e4eaf2;border-radius:8px}.cell-table thead{position:sticky;top:0;z-index:1}.empty,.error{margin:0;color:#718096;font-size:12px}.error{color:#b42318}.json{max-width:420px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;white-space:normal;word-break:break-word}
	@media(max-width:900px){.metric-grid,.configuration-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
	@media(max-width:620px){.report-section{padding:15px}.collapsible{padding:0}.collapsible summary,.details-body{padding:15px}.metric-grid{grid-template-columns:1fr}.wide{grid-column:auto}}
</style>
