<script lang="ts">
	import { Plus, RefreshCw } from '@lucide/svelte';
	import BmsSelectField from './BmsSelectField.svelte';
	import type { BatteryString, CalibrationEventSummary, DischargeCurrentDirection } from '$lib/services/bms-api';
	import { formatCalibrationTime } from '$lib/services/calibration-time';
	import type { InitialBaselineDemoTicket } from './initial-baseline-demo';

	let {
		strings,
		selectedStringIndex,
		events,
		selectedEventId,
		currentDirection,
		selectedCreateType,
		initialBaselineTicket = null,
		loading = false,
		mutating = false,
		onStringChange,
		onCreateTypeChange,
		onEventSelect,
		onStartDraft,
		onCreate,
		onResumeInitialBaseline,
		onRemoveInitialBaseline,
		onReload
	}: {
		strings: BatteryString[];
		selectedStringIndex: number;
		events: CalibrationEventSummary[];
		selectedEventId: number;
		currentDirection: DischargeCurrentDirection;
		selectedCreateType: 'INITIAL_BASELINE' | 'MONTHLY_INSPECTION';
		initialBaselineTicket?: InitialBaselineDemoTicket | null;
		loading?: boolean;
		mutating?: boolean;
		onStringChange: (value: number) => void;
		onCreateTypeChange: (eventType: 'INITIAL_BASELINE' | 'MONTHLY_INSPECTION') => void;
		onEventSelect: (value: number) => void;
		onStartDraft: (calibrationEventId: number) => void;
		onCreate: (eventType: 'INITIAL_BASELINE' | 'MONTHLY_INSPECTION') => void;
		onResumeInitialBaseline: () => void;
		onRemoveInitialBaseline: () => void;
		onReload: () => void;
	} = $props();

	let selectedString = $derived(strings.find((item) => item.stringIndex === selectedStringIndex) ?? null);
</script>

<section class="panel management-panel" aria-labelledby="calibration-events-heading">
	<div class="section-head">
		<div>
			<h3 id="calibration-events-heading">Manage events</h3>
			<p>Create an inspection, open an in-progress workflow, or review a completed event record.</p>
		</div>
		<button class="secondary" disabled={loading || mutating} onclick={onReload}><RefreshCw size={16} class={loading ? 'spinning' : ''} />Reload list</button>
	</div>
	<div class="setup-grid">
		<div class="field"><span>Battery string</span><BmsSelectField ariaLabel="Battery string" value={selectedStringIndex} options={[{ value: 0, label: 'Select a configured string' }, ...strings.map((item) => ({ value: item.stringIndex, label: `str${item.stringIndex} — ${item.stringName}` }))]} disabled={loading || mutating} onChange={(value) => onStringChange(Number(value))} /></div>
		<div class="read-only"><span>Rated capacity</span><strong>{selectedString ? `${selectedString.ratedCapacity} Ah` : '—'}</strong></div>
		<div class="read-only"><span>Current mapping</span><strong>{currentDirection}</strong></div>
		<div class="field"><span>Event type</span><BmsSelectField ariaLabel="Event type" value={selectedCreateType} options={[{ value: 'INITIAL_BASELINE', label: 'Initial Baseline' }, { value: 'MONTHLY_INSPECTION', label: 'Monthly Inspection' }]} disabled={loading || mutating} onChange={(value) => onCreateTypeChange(value as 'INITIAL_BASELINE' | 'MONTHLY_INSPECTION')} /></div>
		<button class="primary" disabled={!selectedStringIndex || loading || mutating} onclick={() => onCreate(selectedCreateType)}><Plus size={17} />Create</button>
	</div>
	<section class="event-list" aria-labelledby="persisted-events-heading">
		<div class="event-list-head"><div><h4 id="persisted-events-heading">Persisted events</h4><p>Select an event to start a draft, open an active workflow, or view a completed report.</p></div><span>{events.length} event{events.length === 1 ? '' : 's'}</span></div>
		{#if initialBaselineTicket && initialBaselineTicket.status !== 'CANCELLED'}
			<div class="event-row demo-ticket"><button class="event-select" disabled={loading || mutating} onclick={onResumeInitialBaseline}><span class="event-id">{initialBaselineTicket.id}</span><strong>INITIAL BASELINE</strong><span>{formatCalibrationTime(new Date(initialBaselineTicket.createdAt).toISOString())}</span><span>Local demo</span><span class="event-status">{initialBaselineTicket.status.replaceAll('_', ' ')}</span></button>{#if initialBaselineTicket.status === 'PRECHECK'}<button class="remove-ticket" disabled={loading || mutating} onclick={onRemoveInitialBaseline}>Delete</button>{:else if initialBaselineTicket.status !== 'COMPLETED'}<button class="resume-ticket" disabled={loading || mutating} onclick={onResumeInitialBaseline}>Resume</button>{/if}</div>
		{/if}
		{#if events.length === 0 && !initialBaselineTicket}
			<p class="no-events">No events have been created for this string.</p>
		{:else}
			<div class="event-rows">
				{#each events as item}
					<div class:chosen={item.calibrationEventId === selectedEventId} class="event-row">
						<button class="event-select" disabled={loading || mutating} onclick={() => onEventSelect(item.calibrationEventId)}>
						<span class="event-id">#{item.calibrationEventId}</span>
						<strong>{item.eventType.replaceAll('_', ' ')}</strong>
						<span>{formatCalibrationTime(item.createdAt)}</span>
						<span>{item.createdByName}</span>
						<span class="event-status">{item.status}</span>
						</button>
						{#if item.status === 'DRAFT'}
							<button class="start-draft" disabled={loading || mutating} onclick={() => onStartDraft(item.calibrationEventId)}>Start</button>
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	</section>
</section>

<style>
	.panel { border: 1px solid #e0e7f1; border-radius: 12px; background: #fff; box-shadow: 0 7px 22px rgba(35,54,89,.04); }
	.management-panel { padding: 20px; }
	.section-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; }
	.eyebrow { display: block; margin-bottom: 6px; color: #3860ad; font-size: 11px; font-weight: 700; letter-spacing: .09em; }
	.section-head h3 { margin: 0; color: #273853; font-size: 17px; }
	.section-head p { max-width: 760px; margin: 7px 0 0; color: #718096; font-size: 14px; line-height: 1.45; }
	.setup-grid { display: grid; grid-template-columns: minmax(190px,1.3fr) repeat(2,minmax(130px,.8fr)) minmax(170px,1fr) auto; gap: 14px; align-items: end; margin-top: 18px; }
	label,.field { display: grid; gap: 7px; color: #53627a; font-size: 12px; font-weight: 600; }
	select { width: 100%; min-height: 41px; padding: 0 11px; border: 1px solid #d8e0eb; border-radius: 8px; color: #2d405e; background: #fff; font: inherit; font-size: 13px; }
	.read-only { display: grid; gap: 5px; min-height: 41px; padding: 7px 11px; border: 1px solid #e2e8f1; border-radius: 8px; background: #f8fafd; }
	.read-only span { color: #7b899d; font-size: 11px; }.read-only strong { color: #354965; font-size: 13px; }
	.primary,.secondary { display:inline-flex;align-items:center;justify-content:center;gap:7px;min-height:41px;padding:0 14px;border-radius:8px;font:inherit;font-size:14px;font-weight:600;cursor:pointer; }
	.primary { border:0;color:#fff;background:#1749ad; }.secondary { border:1px solid #d7dfeb;color:#40516f;background:#fff; }.primary:disabled,.secondary:disabled { opacity:.5;cursor:not-allowed; }
	.event-list{margin-top:22px;border-top:1px solid #e8edf4;padding-top:17px}.event-list-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.event-list-head h4{margin:0;color:#30415d;font-size:14px}.event-list-head p,.no-events{margin:5px 0 0;color:#718096;font-size:12px}.event-list-head>span{color:#738198;font-size:12px}.event-rows{display:grid;gap:7px;margin-top:12px}.event-row{display:flex;align-items:stretch;min-height:44px;border:1px solid #e1e8f1;border-radius:8px;color:#3a4d69;background:#fff}.event-row:hover,.event-row.chosen{border-color:#9db7e7;background:#f4f8ff}.event-select{display:grid;grid-template-columns:58px minmax(180px,1.4fr) minmax(150px,1fr) minmax(100px,.7fr) auto;align-items:center;gap:12px;flex:1;min-width:0;padding:8px 11px;border:0;border-radius:8px;color:#3a4d69;background:transparent;font:inherit;font-size:12px;text-align:left;cursor:pointer}.event-select:focus-visible,.start-draft:focus-visible{outline:2px solid #1749ad;outline-offset:2px}.event-select:disabled,.start-draft:disabled{cursor:not-allowed;opacity:.6}.event-id{color:#3860ad;font-weight:700}.event-select strong{color:#2e415e;font-size:12px}.event-select>span:not(.event-id):not(.event-status){color:#718096}.event-status{justify-self:end;padding:4px 7px;border-radius:999px;color:#39567f;background:#edf3fb;font-size:10px;font-weight:700}.start-draft,.resume-ticket,.remove-ticket{align-self:center;margin-right:8px;min-height:29px;padding:0 10px;border:0;border-radius:6px;color:#fff;background:#1749ad;font:inherit;font-size:11px;font-weight:700;cursor:pointer}.remove-ticket{color:#9b3030;background:#fff0ef}.demo-ticket{margin-top:12px;border-color:#d8e5f7;background:#f5f9ff}
	:global(.spinning) { animation: spin 1s linear infinite; }@keyframes spin { to { transform:rotate(360deg); } }
	@media(max-width:1100px){.setup-grid{grid-template-columns:1fr 1fr}.setup-grid label,.setup-grid .primary{grid-column:1/-1}.event-select{grid-template-columns:58px minmax(170px,1fr) minmax(120px,.8fr) auto}.event-select>span:nth-of-type(2){display:none}}
	@media(max-width:620px){.management-panel{padding:16px}.section-head{display:grid}.section-head .secondary{width:100%}.setup-grid{grid-template-columns:1fr}.read-only{grid-column:1}.event-list-head{display:grid}.event-select{grid-template-columns:48px minmax(0,1fr) auto}.event-select>span:nth-of-type(2),.event-select>span:nth-of-type(3){display:none}.event-select strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}}
	/* Softer form and event-list treatment: fields remain native and accessible. */
	.panel{border-color:#edf1f6;box-shadow:0 12px 30px rgba(35,54,89,.055)}
	.section-head h3,.event-list-head h4{font-weight:500}
	.eyebrow{font-weight:600}
	label,.field{font-weight:500}
	select{appearance:none;padding-right:38px;border-color:#e4eaf2;border-radius:9px;background-color:#fbfcfe;background-image:linear-gradient(45deg,transparent 50%,#71809a 50%),linear-gradient(135deg,#71809a 50%,transparent 50%);background-position:calc(100% - 17px) 18px,calc(100% - 12px) 18px;background-size:5px 5px,5px 5px;background-repeat:no-repeat;box-shadow:inset 0 1px 2px rgba(35,54,89,.025);transition:border-color .16s ease,box-shadow .16s ease,background-color .16s ease}
	select:hover{border-color:#c7d4e5;background-color:#fff}
	select:focus{outline:none;border-color:#7e9fd3;background-color:#fff;box-shadow:0 0 0 3px rgba(50,99,174,.12)}
	select option{color:#2d405e;background:#fff;font-weight:400}
	.read-only{border-color:transparent;border-radius:9px;background:#f5f8fc}
	.read-only strong{font-weight:500}
	.primary,.secondary{font-weight:500}
	.secondary{border-color:transparent;background:#f4f7fb}
	.secondary:hover:not(:disabled){background:#eaf0f8}
	.event-list{border-top:0;padding-top:20px}
	.event-row{border-color:transparent;border-radius:10px;background:#f7f9fc;transition:background .16s ease,box-shadow .16s ease}
	.event-row:hover,.event-row.chosen{border-color:transparent;background:#f0f5fd;box-shadow:inset 0 0 0 1px #dce8f8}
	.event-id,.event-status,.start-draft{font-weight:600}
	.event-select strong{font-weight:500}
	.start-draft{border-radius:7px}
</style>
