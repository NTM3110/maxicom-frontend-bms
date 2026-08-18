<script lang="ts">
	import { ArrowLeft, CheckCircle2, ClipboardCheck } from '@lucide/svelte';

	type PreviewStep = {
		label: string;
		detail: string;
		persistedStages: string[];
		tasks: string[];
	};

	let { stringName, onBack }: { stringName: string; onBack: () => void } = $props();

	const steps: PreviewStep[] = [
		{
			label: 'Safety & pre-check',
			detail: 'Confirm the physical system is safe before charging.',
			persistedStages: ['PREREQUISITES'],
			tasks: [
				'Battery interconnections and charger connections have been inspected.',
				'DC MCB supplying the load is open and the load is isolated.',
				'Open-circuit voltage for every cell/block and the full string was recorded.',
				'No leakage, deformation, damaged safety valve, or mechanical damage was observed.'
			]
		},
		{
			label: 'Initial charge',
			detail: 'Apply boost charge, then verify the transition to float charge.',
			persistedStages: ['INITIAL_CHARGE'],
			tasks: [
				'Confirm the configured Vboost, Vfloat and charge-current limit against the approved string configuration.',
				'Confirm measured string voltage reached Vboost.',
				'Confirm charger transitioned to Vfloat.'
			]
		},
		{
			label: 'Cool-down',
			detail: 'Isolate the charger and wait for the string to stabilize near ambient temperature.',
			persistedStages: ['PRE_DISCHARGE_FLOAT'],
			tasks: [
				'Confirm the charger DC MCB is open before the cool-down wait.',
				'Confirm each cell/block temperature is close to ambient temperature.',
				'Inspect safety valves for deformation, leakage, or physical intervention.',
				'Confirm the float-charge condition is stable before controlled discharge.'
			]
		},
		{
			label: 'Controlled discharge',
			detail: 'Connect the standard load, monitor discharge to cut-off, then remove the load.',
			persistedStages: ['WAITING_FOR_LOAD', 'DISCHARGE', 'LOAD_DISCONNECT'],
			tasks: [
				'Confirm the standard test load is connected.',
				'Run the configured controlled-discharge profile and monitor valid BMS samples.',
				'Record discharged capacity, lowest cell voltage and terminal reason at cut-off.',
				'Confirm the test load is disconnected after discharge.'
			]
		},
		{
			label: 'Recovery charge',
			detail: 'Recharge the string and return it to a stable full float condition.',
			persistedStages: ['RECHARGE', 'POST_RECHARGE_FLOAT'],
			tasks: [
				'Confirm charger DC MCB is closed for recovery charge.',
				'Complete the approved boost-recharge period, followed by float charge until full.',
				'Confirm string voltage and charging current are stable for baseline measurement.',
				'Confirm the string is restored to normal float-charge operation.'
			]
		},
		{
			label: 'Baseline capture',
			detail: 'Capture the reference measurements at full-charge condition.',
			persistedStages: ['BASELINE_CAPTURE'],
			tasks: [
				'Record string voltage, midpoint voltage and float current.',
				'Record charger output voltage and current.',
				'Record ambient temperature, ripple AC without load and ripple AC with load.',
				'Capture the required per-cell/block reference readings.'
			]
		},
		{
			label: 'Review & approve',
			detail: 'Review the complete record and return the string to service.',
			persistedStages: ['COMPLETION'],
			tasks: [
				'Check that all required automatic measurements and manual records are present.',
				'Confirm the string has been returned to service.',
				'Review and approve the completed baseline record.'
			]
		}
	];

	let selectedIndex = $state(0);
	let selected = $derived(steps[selectedIndex]);

</script>

<section class="preview-page" aria-labelledby="baseline-preview-heading">
	<header class="preview-head">
		<div>
			<button class="back-link" onclick={onBack}><ArrowLeft size={16} />Back to event dashboard</button>
			<span class="eyebrow">INITIAL BASELINE / {stringName}</span>
			<h2 id="baseline-preview-heading">Initial Baseline workflow preview</h2>
			<p>Preview only. Select any presentation step to inspect its checklist. No event, evidence, or stage transition is created from this screen.</p>
		</div>
		<span class="preview-badge">READ-ONLY PREVIEW</span>
	</header>

	<div class="preview-banner"><ClipboardCheck size={19} /><div><strong>All seven presentation steps are available for review.</strong><span>They map to ten persisted backend stages when Initial Baseline lifecycle support is enabled.</span></div></div>

	<nav class="stepper" aria-label="Initial Baseline presentation steps">
		{#each steps as step, index}
			<button class:active={index === selectedIndex} aria-current={index === selectedIndex ? 'step' : undefined} onclick={() => selectedIndex = index}>
				<span>{index + 1}</span><strong>{step.label}</strong>
			</button>
		{/each}
	</nav>

	<section class="workspace-panel" aria-live="polite">
		<div class="content-heading">
			<ClipboardCheck size={22} />
			<div><h3>{selected.label}</h3><p>{selected.detail}</p></div>
		</div>
		<div class="persisted-stages"><span>Persisted backend stage{selected.persistedStages.length === 1 ? '' : 's'}</span>{#each selected.persistedStages as stage}<strong>{stage}</strong>{/each}</div>
		<div class="checklist" aria-label={`${selected.label} checklist`}>
			{#each selected.tasks as task}
				<div class="check-row"><span class="checkmark" aria-hidden="true"></span><span>{task}</span><em>Required</em></div>
			{/each}
		</div>
		<div class="preview-note"><CheckCircle2 size={18} /><span>These controls are intentionally view-only. Actual checklists, automatic evaluation, blockers and allowed actions will be provided by the backend event detail after an Initial Baseline event starts.</span></div>
	</section>

	<footer class="preview-footer"><button class="secondary" disabled={selectedIndex === 0} onclick={() => selectedIndex -= 1}>Back</button><button class="secondary" disabled={selectedIndex === steps.length - 1} onclick={() => selectedIndex += 1}>Next</button></footer>
</section>

<style>
	.preview-page{width:100%;color:#33425d}.preview-head{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;margin-bottom:18px}.eyebrow{display:block;margin-bottom:6px;color:#3860ad;font-size:11px;font-weight:700;letter-spacing:.09em}.preview-head h2{margin:0;color:#172b4d;font-size:25px;font-weight:600}.preview-head p{max-width:760px;margin:7px 0 0;color:#718096;font-size:15px;line-height:1.45}.back-link{display:inline-flex;align-items:center;gap:7px;margin:0 0 12px;padding:0;border:0;color:#4164a8;background:transparent;font:inherit;font-size:13px;cursor:pointer}.back-link:focus-visible,.stepper button:focus-visible,.secondary:focus-visible{outline:2px solid #1749ad;outline-offset:2px}.preview-badge{margin-top:2px;padding:7px 9px;border-radius:7px;color:#4164a8;background:#eef4ff;font-size:11px;font-weight:700;white-space:nowrap}.preview-banner{display:flex;align-items:flex-start;gap:11px;margin-bottom:16px;padding:13px 14px;border:1px solid #bad4fa;border-radius:10px;color:#315e9e;background:#eff6ff}.preview-banner>div{display:grid;gap:3px}.preview-banner strong{font-size:13px}.preview-banner span{color:#577495;font-size:12px}.stepper{display:grid;grid-template-columns:repeat(7,minmax(130px,1fr));overflow-x:auto;margin-bottom:16px;border:1px solid #dfe6f0;border-radius:11px;background:#fff}.stepper button{display:grid;grid-template-columns:25px 1fr;align-items:center;gap:7px;min-width:130px;padding:12px 10px;border:0;border-right:1px solid #edf0f5;color:#718096;background:#fff;text-align:left;cursor:pointer}.stepper button:last-child{border-right:0}.stepper button span{display:grid;width:23px;height:23px;place-items:center;border:1px solid #d7dfeb;border-radius:50%;font-size:11px}.stepper button strong{font-size:11px;font-weight:500;line-height:1.2}.stepper button.active{color:#1749ad;background:#f2f6ff}.stepper button.active span{border-color:#1749ad;color:#fff;background:#1749ad}.workspace-panel{min-height:390px;padding:23px;border:1px solid #e0e7f1;border-radius:12px;background:#fff;box-shadow:0 7px 22px rgba(35,54,89,.04)}.content-heading{display:flex;gap:11px;margin-bottom:21px;color:#315b9f}.content-heading h3{margin:0;color:#273853;font-size:17px;font-weight:600}.content-heading p{margin:5px 0 0;color:#7b879b;font-size:13px;line-height:1.45}.persisted-stages{display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:17px;padding:12px 14px;border:1px solid #dce5f2;border-radius:9px;color:#667790;background:#f9fbfe;font-size:12px}.persisted-stages strong{padding:4px 7px;border-radius:5px;color:#35527e;background:#eaf1fb;font-size:11px}.checklist{display:grid;overflow:hidden;border:1px solid #e1e8f2;border-radius:10px}.check-row{display:flex;align-items:center;gap:11px;padding:14px 15px;border-bottom:1px solid #edf0f4;color:#43536d;font-size:14px;line-height:1.35}.check-row:last-child{border-bottom:0}.checkmark{width:17px;height:17px;flex:none;border:1px solid #aebdce;border-radius:4px;background:#fff}.check-row em{margin-left:auto;color:#a36510;font-size:10px;font-style:normal;text-transform:uppercase}.preview-note{display:flex;align-items:flex-start;gap:10px;margin-top:18px;padding:13px 14px;border:1px solid #e8d8ad;border-radius:9px;color:#79560d;background:#fff8e8;font-size:13px;line-height:1.45}.preview-footer{display:flex;justify-content:space-between;margin-top:16px}.secondary{display:inline-flex;align-items:center;justify-content:center;min-height:39px;padding:0 14px;border:1px solid #d7dfeb;border-radius:8px;color:#40516f;background:#fff;font:inherit;font-size:14px;font-weight:500;cursor:pointer}.secondary:disabled{opacity:.55;cursor:not-allowed}@media(max-width:1100px){.stepper{grid-template-columns:repeat(7,150px)}}@media(max-width:650px){.preview-head{flex-direction:column}.workspace-panel{padding:16px}.preview-badge{align-self:flex-start}.check-row{align-items:flex-start}.check-row em{white-space:nowrap}.preview-banner{align-items:flex-start}}
</style>
