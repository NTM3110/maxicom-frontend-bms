<script lang="ts">
	import { ChevronRight } from '@lucide/svelte';
	import type { BmsDashboardItem, CalibrationEventDetail } from '$lib/services/bms-api';
	import { INITIAL_BASELINE_STAGE_GROUPS } from './initial-baseline-real';

	let { event, item, onOpen }: { event: CalibrationEventDetail; item: BmsDashboardItem; onOpen: () => void } = $props();
	const initialPhaseLabels = ['Pre-check', 'Initial charge', 'Cool-down', 'Discharge test', 'Recovery charge', 'Summary data'];
	let stage = $derived(event.stages.find(value => value.calibrationStageId === event.currentStageId) ?? null);
	let process = $derived(event.processes.find(value => value.calibrationStageId === event.currentStageId && (value.state === 'ACTIVE' || value.state === 'BLOCKED')) ?? null);
	let phases = $derived.by(() => {
		if (event.eventType !== 'INITIAL_BASELINE') return event.stages.map(value => ({ label: stageLabel(value.type), done: ['COMPLETED', 'SKIPPED'].includes(value.state), current: value.calibrationStageId === event.currentStageId }));
		return INITIAL_BASELINE_STAGE_GROUPS.map((types, index) => {
			const stages = event.stages.filter(value => (types as readonly string[]).includes(value.type));
			return { label: initialPhaseLabels[index], done: stages.length > 0 && stages.every(value => ['COMPLETED', 'SKIPPED'].includes(value.state)), current: stages.some(value => value.calibrationStageId === event.currentStageId) };
		});
	});
	let step = $derived(Math.max(1, phases.findIndex(value => value.current) + 1));
	let progress = $derived.by(() => {
		if (!phases.length) return 0;
		const completed = phases.filter(value => value.done).length;
		return Math.min(100, Math.round((completed + (phases.some(value => value.current && !value.done) ? .35 : 0)) / phases.length * 100));
	});

	function stageLabel(type: string) {
		return ({ PREREQUISITES:'Pre-check', INITIAL_CHARGE:'Initial charge', PRE_DISCHARGE_FLOAT:'Cool-down', WAITING_FOR_LOAD:'Discharge test', DISCHARGE:'Discharge test', LOAD_DISCONNECT:'Discharge test', RECHARGE:'Recovery charge', POST_RECHARGE_FLOAT:'Recovery charge', BASELINE_CAPTURE:'Recovery charge', COMPLETION:'Summary data' } as Record<string,string>)[type] ?? type.replaceAll('_',' ').toLowerCase();
	}
	function readable(value: string) { return value.replaceAll('_',' ').toLowerCase().replace(/\b\w/g, letter => letter.toUpperCase()); }
	function metric(value: number | null | undefined, digits: number, unit: string) { return value === null || value === undefined ? '—' : `${value.toFixed(digits)} ${unit}`; }
</script>

<section class:attention={event.status !== 'ACTIVE'} class="calibration-strip">
	<header>
		<div class="identity"><i></i><div><span>{event.status==='DRAFT'?'Calibration ready':'Calibration running'} · Event #{event.calibrationEventId}</span><strong>Step {step} of {phases.length} · {stage ? stageLabel(stage.type) : 'Preparing event'}</strong></div></div>
		<span class="state">{event.status.replaceAll('_',' ')}</span>
		<button type="button" onclick={onOpen}>View details <ChevronRight size={15}/></button>
	</header>
	<div class="body">
		<div class="progress"><i style={`width:${progress}%`}></i></div>
		<div class="steps" style={`--phase-count:${phases.length}`}>{#each phases as phase,index}<div class:done={phase.done} class:current={phase.current}><b>{index + 1}</b><span>{phase.label}</span></div>{/each}</div>
		<div class="runtime">
			<div><span>Backend process</span><strong>{process ? `${readable(process.type)} · ${process.state}` : stage?.state.replaceAll('_',' ') ?? 'WAITING'}</strong></div>
			<div><span>String voltage</span><strong>{metric(item.telemetry.summary.stringVoltage,2,'V')}</strong></div>
			<div><span>Current</span><strong>{metric(item.telemetry.summary.stringCurrent,2,'A')}</strong></div>
			<div><span>Avg. temperature</span><strong>{metric(item.telemetry.summary.avgTemperature,1,'°C')}</strong></div>
			<div><span>String SoC</span><strong>{metric(item.telemetry.summary.stringSoC,1,'%')}</strong></div>
		</div>
		{#if stage?.blockerCode}<p class="warning">Waiting for attention: {stage.blockerCode.replaceAll('_',' ').toLowerCase()}</p>{:else}<p class="live"><i></i>Event continues in the background · live values refresh automatically</p>{/if}
	</div>
</section>

<style>
	.calibration-strip{border-bottom:1px solid #cfdcf0;background:#f8fbff}.calibration-strip.attention{border-color:#e8d5ad;background:#fffdf8}.calibration-strip>header{display:flex;align-items:center;gap:9px;min-height:54px;padding:8px 13px;border-bottom:1px solid #e3eaf4}.identity{display:flex;align-items:center;gap:10px;min-width:0}.identity>i{width:8px;height:8px;flex:none;border-radius:50%;background:#3471cf;box-shadow:0 0 0 4px rgba(52,113,207,.12);animation:pulse 1.6s ease-in-out infinite}.attention .identity>i{background:#d69a32;box-shadow:0 0 0 4px rgba(214,154,50,.13)}.identity>div{display:grid;gap:3px;min-width:0}.identity span{color:#687c98;font-size:10px}.identity strong{overflow:hidden;color:#294465;font-size:13px;font-weight:600;text-overflow:ellipsis;white-space:nowrap}.state{margin-left:auto;padding:4px 7px;border-radius:11px;color:#285aa9;background:#e4edfc;font-size:9px;font-weight:700}.attention .state{color:#865f1e;background:#f8eacb}.calibration-strip button{display:inline-flex;align-items:center;gap:3px;padding:5px;border:0;color:#1749ad;background:transparent;font:inherit;font-size:11px;font-weight:600;cursor:pointer}.body{padding:10px 13px}.progress{height:5px;overflow:hidden;border-radius:9px;background:#e1e8f1}.progress>i{display:block;height:100%;border-radius:inherit;background:#3268c4;transition:width .3s ease}.attention .progress>i{background:#d29a39}.steps{display:grid;grid-template-columns:repeat(var(--phase-count),minmax(0,1fr));margin-top:8px}.steps>div{position:relative;display:grid;justify-items:center;gap:3px;min-width:0;color:#8a96a7}.steps>div:before{position:absolute;top:8px;right:50%;left:-50%;height:1px;background:#dce4ee;content:''}.steps>div:first-child:before{display:none}.steps b{position:relative;z-index:1;display:grid;width:18px;height:18px;place-items:center;border:1px solid #d5deea;border-radius:50%;color:inherit;background:#fff;font-size:9px}.steps span{overflow:hidden;width:100%;font-size:9px;text-align:center;text-overflow:ellipsis;white-space:nowrap}.steps .done{color:#367858}.steps .done:before{background:#91c2a5}.steps .done b{border-color:#57966f;color:#fff;background:#57966f}.steps .current{color:#2458ac}.steps .current b{border-color:#3267c1;color:#fff;background:#3267c1}.runtime{display:grid;grid-template-columns:1.45fr repeat(4,1fr);gap:1px;margin-top:10px;overflow:hidden;border:1px solid #e2e8f0;border-radius:7px;background:#e2e8f0}.runtime>div{display:grid;gap:3px;min-width:0;padding:7px 8px;background:#fff}.runtime span{overflow:hidden;color:#708096;font-size:9px;text-overflow:ellipsis;white-space:nowrap}.runtime strong{overflow:hidden;color:#2d435f;font-size:11px;font-weight:600;font-variant-numeric:tabular-nums;text-overflow:ellipsis;white-space:nowrap}.live,.warning{display:flex;align-items:center;gap:6px;margin:8px 0 0;color:#5f7490;font-size:10px}.live i{width:6px;height:6px;border-radius:50%;background:#39a668;animation:pulse 1.6s ease-in-out infinite}.warning{padding:7px 8px;border-radius:6px;color:#865f20;background:#fff4df}@keyframes pulse{50%{opacity:.4}}@container(max-width:620px){.runtime{grid-template-columns:1fr 1fr}.runtime>div:first-child{grid-column:1/-1}.steps span{display:none}}@container(max-width:440px){.calibration-strip>header{align-items:flex-start;flex-wrap:wrap}.identity{flex-basis:calc(100% - 85px)}.calibration-strip button{margin-left:auto}}
</style>
