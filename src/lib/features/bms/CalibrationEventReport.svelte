<script lang="ts">
	import { onMount } from 'svelte';
	import { ArrowLeft } from '@lucide/svelte';
	import BmsCompactCellVoltageTable from './BmsCompactCellVoltageTable.svelte';
	import {
		loadCalibrationHistory,
		loadCalibrationSamples,
		monthlyInspectionAssessment,
		type CalibrationEventDetail,
		type CalibrationHistory,
		type CalibrationSample,
		type CalibrationStage
	} from '$lib/services/bms-api';
	import { formatCalibrationTime } from '$lib/services/calibration-time';

	let { event, onBack }: { event: CalibrationEventDetail; onBack: () => void } = $props();
	let samples = $state<CalibrationSample[]>([]);
	let history = $state<CalibrationHistory | null>(null);
	let loadingMeasurements = $state(true);
	let measurementError = $state('');
	let monthlyStage = $derived(event.stages.find((stage) => stage.type === 'MONTHLY_INSPECTION') ?? null);
	let monthlySamples = $derived(monthlyStage
		? samples.filter((sample) => sample.calibrationStageId === monthlyStage.calibrationStageId)
		: []);
	let monthlyEvidence = $derived(monthlyStage
		? (history?.evidence ?? []).filter((item) => item.calibrationStageId === monthlyStage.calibrationStageId)
		: []);
	let monthlyAssessment = $derived(monthlyInspectionAssessment(monthlyStage?.properties ?? null));
	let finalizedSample = $derived(selectFinalizedMonthlySample(monthlySamples, monthlyAssessment.snapshotSequence));

	onMount(() => { void loadPersistedMeasurements(); });

	async function loadPersistedMeasurements() {
		loadingMeasurements = true;
		measurementError = '';
		try {
			const [loadedSamples, loadedHistory] = await Promise.all([
				loadCalibrationSamples(event.calibrationEventId),
				loadCalibrationHistory(event.calibrationEventId)
			]);
			samples = loadedSamples;
			history = loadedHistory;
		} catch (cause) {
			measurementError = cause instanceof Error ? cause.message : 'Unable to load persisted Monthly Inspection measurements.';
		} finally {
			loadingMeasurements = false;
		}
	}

	function stageLabel(stage: CalibrationStage) {
		return ({ PREREQUISITES: 'Prerequisites', INITIAL_CHARGE: 'Initial charge', PRE_DISCHARGE_FLOAT: 'Pre-discharge float', WAITING_FOR_LOAD: 'Waiting for load', DISCHARGE: 'Discharge', LOAD_DISCONNECT: 'Load disconnect', RECHARGE: 'Recharge', POST_RECHARGE_FLOAT: 'Post-recharge float', BASELINE_CAPTURE: 'Baseline capture', MONTHLY_INSPECTION: 'Monthly inspection', SIX_MONTH_INSPECTION: 'Six-month inspection', COMPLETION: 'Completion' } as Record<string, string>)[stage.type] ?? stage.type.replaceAll('_', ' ');
	}

	function detail(value: unknown) {
		if (value == null) return '—';
		return typeof value === 'string' ? value : JSON.stringify(value);
	}

	function number(value: number | null, unit = '', digits = 3) {
		return value == null || !Number.isFinite(value) ? '—' : `${value.toFixed(digits)}${unit ? ` ${unit}` : ''}`;
	}

	function text(value: string | null) {
		return value?.trim() || '—';
	}

	function epochTime(value: number | null) {
		return value == null ? '—' : formatCalibrationTime(new Date(value).toISOString());
	}

	function result(value: boolean | null) {
		return value === true ? 'PASS' : value === false ? 'FAIL' : '—';
	}

	/**
	 * A completed Monthly report has one authoritative evidence snapshot: the
	 * sequence stored in the persisted Stage 2 checkpoint. Old events without
	 * that checkpoint retain a deterministic read-only fallback to their last
	 * persisted Stage 2 sample; the browser never selects a live snapshot.
	 */
	function selectFinalizedMonthlySample(monthlySamples: CalibrationSample[], snapshotSequence: number | null) {
		const byPersistence = [...monthlySamples].sort((left, right) => left.sampleId - right.sampleId);
		if (snapshotSequence !== null) {
			const checkpointMatches = byPersistence.filter((sample) => sample.snapshotSequence === snapshotSequence);
			if (checkpointMatches.length) return checkpointMatches.at(-1) ?? null;
		}
		return byPersistence.at(-1) ?? null;
	}
</script>

<section class="report-page" aria-labelledby="report-heading">
	<button class="back" type="button" onclick={onBack}><ArrowLeft size={17} />Back to event dashboard</button>
	<header class="report-head">
		<div><span class="eyebrow">COMPLETED EVENT REPORT</span><h3 id="report-heading">Event #{event.calibrationEventId}</h3></div>
		<span class="status">{event.status}</span>
	</header>

	<section class="report-section" aria-labelledby="report-event-details">
		<h4 id="report-event-details">Event details</h4>
		<dl class="summary-grid">
			<div><dt>Event type</dt><dd>{event.eventType.replaceAll('_', ' ')}</dd></div>
			<div><dt>Battery string</dt><dd>{event.configuration.stringKey}</dd></div>
			<div><dt>Current mapping</dt><dd>{event.configuration.currentDirection}</dd></div>
			<div><dt>Created by</dt><dd>{event.createdByName}</dd></div>
			<div><dt>Created at</dt><dd>{formatCalibrationTime(event.createdAt)}</dd></div>
			<div><dt>Closed at</dt><dd>{formatCalibrationTime(event.closedAt)}</dd></div>
			<div><dt>Event version</dt><dd>{event.eventVersion}</dd></div>
			<div><dt>Measurement revision</dt><dd>{event.measurementRevision}</dd></div>
		</dl>
	</section>

	<section class="report-section" aria-labelledby="report-stage-audit">
		<h4 id="report-stage-audit">Stage audit</h4>
		<div class="table-wrap"><table><thead><tr><th>Stage</th><th>State</th><th>Accepted action</th><th>Actor</th><th>Accepted at</th><th>Result / blocker</th></tr></thead><tbody>
			{#each event.stages as stage}
				<tr><td>{stage.order + 1}. {stageLabel(stage)}</td><td>{stage.state}</td><td>{stage.acceptedAction ?? '—'}</td><td>{stage.acceptedActor ?? stage.completedBy ?? '—'}</td><td>{formatCalibrationTime(stage.acceptedAt ?? stage.completedAt)}</td><td>{stage.result ?? stage.blockerCode ?? detail(stage.blockerDetail)}</td></tr>
			{/each}
		</tbody></table></div>
	</section>

	<section class="report-section" aria-labelledby="report-monthly-assessment">
		<div class="measurement-head">
			<div><h4 id="report-monthly-assessment">Monthly Inspection assessment</h4><p>Persisted automatic Stage 2 checkpoint. Missing values were not recorded by the backend.</p></div>
			<span>{monthlyStage ? monthlyStage.state : 'NOT RECORDED'}</span>
		</div>
		{#if !monthlyStage}
			<p class="empty-measurements">This event has no Monthly Inspection stage.</p>
		{:else}
			<div class="measurement-grid assessment-grid">
				<div><span>Snapshot sequence</span><strong>{monthlyAssessment.snapshotSequence ?? '—'}</strong></div>
				<div><span>String voltage</span><strong>{number(monthlyAssessment.stringVoltageV, 'V')}</strong></div>
				<div><span>Midpoint voltage</span><strong>{number(monthlyAssessment.midpointVoltageV, 'V')}</strong></div>
				<div><span>Float current</span><strong>{number(monthlyAssessment.floatCurrentA, 'A')} · {result(monthlyAssessment.floatCurrentPass)}</strong></div>
				<div><span>Previous Monthly event</span><strong>{monthlyAssessment.previousMonthlyEventId == null ? '—' : `#${monthlyAssessment.previousMonthlyEventId}`}</strong></div>
				<div><span>Previous float current</span><strong>{number(monthlyAssessment.previousMonthlyFloatCurrentA, 'A')}</strong></div>
				<div><span>Previous measurement time</span><strong>{epochTime(monthlyAssessment.previousMonthlyMeasuredAt)}</strong></div>
				<div><span>Current deviation</span><strong>{number(monthlyAssessment.relativeDeviationPercent, '%', 1)}</strong></div>
				<div><span>Comparison result</span><strong>{monthlyAssessment.comparisonResult ?? '—'}</strong></div>
				<div><span>Ambient temperature</span><strong>{number(monthlyAssessment.ambientTemperatureC, '°C', 1)} · {result(monthlyAssessment.ambientTemperaturePass)}</strong></div>
			</div>
		{/if}
	</section>

	<section class="report-section" aria-labelledby="report-monthly-measurements">
		<div class="measurement-head">
			<div><h4 id="report-monthly-measurements">Monthly Inspection measurements</h4><p>Finalized persisted Stage 2 snapshot. These values are not live telemetry.</p></div>
			<span>{finalizedSample ? 'FINALIZED' : 'NOT RECORDED'}</span>
		</div>
		{#if loadingMeasurements}
			<p class="empty-measurements">Loading persisted measurements…</p>
		{:else if measurementError}
			<p class="measurement-error">{measurementError}</p>
		{:else if !monthlyStage}
			<p class="empty-measurements">This event has no Monthly Inspection stage.</p>
		{:else if monthlySamples.length === 0}
			<p class="empty-measurements">No persisted measurement snapshot was recorded for Stage 2.</p>
		{:else if finalizedSample}
			<div class="measurement-grid">
				<div><span>Measurement time</span><strong>{formatCalibrationTime(finalizedSample.measurementTime)}</strong></div>
				<div><span>Persistence / quality</span><strong>{text(finalizedSample.persistenceReason)} · {text(finalizedSample.quality)}</strong></div>
				<div><span>String voltage</span><strong>{number(finalizedSample.stringVoltageV, 'V')}</strong></div>
				<div><span>Midpoint voltage</span><strong>{number(finalizedSample.midpointVoltageV, 'V')}</strong></div>
				<div><span>Float current</span><strong>{number(finalizedSample.domainCurrentA, 'A')}</strong></div>
				<div><span>Raw current</span><strong>{number(finalizedSample.rawCurrentA, 'A')}</strong></div>
				<div><span>Current direction / quality</span><strong>{text(finalizedSample.currentDirection)} · {text(finalizedSample.currentQuality)}</strong></div>
				<div><span>Ambient temperature</span><strong>{number(finalizedSample.ambientTemperatureC, '°C')}</strong></div>
				<div><span>Average cell voltage</span><strong>{number(finalizedSample.averageVoltageV, 'V')}</strong></div>
				<div><span>Average cell temperature</span><strong>{number(finalizedSample.averageCellTemperatureC, '°C')}</strong></div>
				<div><span>Blocker reason</span><strong>{text(finalizedSample.blockerReason)}</strong></div>
				<div><span>Snapshot sequence</span><strong>{finalizedSample.snapshotSequence}</strong></div>
			</div>
			<div class="table-wrap"><table><thead><tr><th>Snapshot generation</th><th>Mapping version</th><th>Current measured at</th><th>Delta seconds</th><th>Delta Ah</th><th>Raw used Ah</th><th>Corrected used Ah</th><th>SoC / method</th><th>DoD</th><th>Representative discharge temp.</th><th>Temperature factor Kc</th><th>Float target</th><th>Boost target</th><th>Persisted at</th></tr></thead><tbody><tr>
				<td>{text(finalizedSample.snapshotGeneration)}</td><td>{finalizedSample.mappingVersion ?? '—'}</td><td>{formatCalibrationTime(finalizedSample.currentMeasuredAt)}</td><td>{number(finalizedSample.deltaSeconds, 's')}</td><td>{number(finalizedSample.deltaAh, 'Ah')}</td><td>{number(finalizedSample.rawUsedAh, 'Ah')}</td><td>{number(finalizedSample.correctedUsedAh, 'Ah')}</td><td>{number(finalizedSample.socPct, '%')} · {text(finalizedSample.socMethod)}</td><td>{number(finalizedSample.dodPct, '%')}</td><td>{number(finalizedSample.representativeDischargeTemperatureC, '°C')}</td><td>{number(finalizedSample.temperatureFactorKc)}</td><td>{number(finalizedSample.floatTargetVoltageV, 'V')}</td><td>{number(finalizedSample.boostTargetVoltageV, 'V')}</td><td>{formatCalibrationTime(finalizedSample.createdAt)}</td>
			</tr></tbody></table></div>

			<BmsCompactCellVoltageTable
				cells={finalizedSample.cells.map((cell) => ({ id: cell.cellIndex, voltage: cell.voltageV, quality: cell.quality, availabilityWarning: cell.availabilityWarning }))}
				ariaLabel="Persisted Monthly Inspection cell voltage"
				emptyMessage="No persisted cell voltage was recorded for this snapshot."
			/>
		{/if}
	</section>

	{#if monthlyEvidence.length}
		<section class="report-section" aria-labelledby="report-monthly-evidence">
			<h4 id="report-monthly-evidence">Monthly Inspection operator records</h4>
			<div class="table-wrap"><table><thead><tr><th>Record</th><th>Status</th><th>Value</th><th>Note</th><th>Actor</th><th>Recorded at</th></tr></thead><tbody>
				{#each monthlyEvidence as item}<tr><td>{item.evidenceType}</td><td>{item.status}</td><td>{item.numericValue == null ? text(item.textValue) : `${number(item.numericValue)} ${text(item.unit)}`}</td><td>{text(item.note)}</td><td>{text(item.actorName)}</td><td>{formatCalibrationTime(item.recordedAt)}</td></tr>{/each}
			</tbody></table></div>
		</section>
	{/if}

	{#if event.stages.some((stage) => stage.acceptedReason || stage.acknowledgedGaps.length)}
		<section class="report-section" aria-labelledby="report-operator-notes">
			<h4 id="report-operator-notes">Operator notes</h4>
			<div class="notes">{#each event.stages.filter((stage) => stage.acceptedReason || stage.acknowledgedGaps.length) as stage}<article><strong>{stageLabel(stage)}</strong>{#if stage.acceptedReason}<span>Reason: {stage.acceptedReason}</span>{/if}{#if stage.acknowledgedGaps.length}<span>Acknowledged gaps: {stage.acknowledgedGaps.join(', ')}</span>{/if}</article>{/each}</div>
		</section>
	{/if}
</section>

<style>
	.report-page{display:grid;gap:18px}.back{display:inline-flex;align-items:center;justify-self:start;gap:7px;min-height:38px;padding:0 11px;border:1px solid #d7dfeb;border-radius:8px;color:#40516f;background:#fff;font:inherit;font-size:13px;font-weight:600;cursor:pointer}.back:focus-visible{outline:2px solid #1749ad;outline-offset:2px}.report-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}.eyebrow{display:block;margin-bottom:6px;color:#3860ad;font-size:11px;font-weight:700;letter-spacing:.09em}.report-head h3{margin:0;color:#273853;font-size:23px}.status{padding:5px 8px;border-radius:6px;color:#39567f;background:#edf3fb;font-size:11px;font-weight:700}.report-section{padding:18px;border:1px solid #e0e7f1;border-radius:12px;background:#fff;box-shadow:0 7px 22px rgba(35,54,89,.04)}.report-section h4{margin:0 0 13px;color:#30415d;font-size:15px}.summary-grid,.measurement-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:0}.summary-grid div,.measurement-grid div{display:grid;gap:5px;padding:10px;border:1px solid #edf1f6;border-radius:8px;background:#f9fbfe}.summary-grid dt,.measurement-grid span{color:#718096;font-size:11px}.summary-grid dd,.measurement-grid strong{margin:0;color:#2e415e;font-size:13px;font-weight:600;overflow-wrap:anywhere}.table-wrap{overflow-x:auto}table{width:100%;border-collapse:collapse;min-width:780px;font-size:12px}th,td{padding:10px 9px;border-bottom:1px solid #e8edf4;text-align:left;vertical-align:top}th{color:#667893;background:#f8fafd;font-size:11px;font-weight:700}td{color:#3d4f69;overflow-wrap:anywhere}.notes{display:grid;gap:8px}.notes article{display:grid;gap:4px;padding:10px;border:1px solid #edf1f6;border-radius:8px;background:#f9fbfe;font-size:12px}.notes strong{color:#30415d}.notes span,.measurement-head p{color:#667893}.measurement-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.measurement-head h4{margin-bottom:5px}.measurement-head p,.empty-measurements,.measurement-error{margin:0;font-size:12px}.measurement-head>span{padding:4px 7px;border-radius:999px;color:#39567f;background:#edf3fb;font-size:10px;font-weight:700}.measurement-grid{margin-bottom:16px}.measurement-error{color:#b42318}@media(max-width:900px){.summary-grid,.measurement-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:620px){.report-head,.measurement-head{display:grid}.report-section{padding:15px}.summary-grid,.measurement-grid{grid-template-columns:1fr}.measurement-head>span{justify-self:start}}
</style>
