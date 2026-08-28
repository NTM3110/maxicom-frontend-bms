<script lang="ts">
	import { Camera, Check, Home, Pencil, RefreshCw, Thermometer, X } from '@lucide/svelte';
	import { onMount } from 'svelte';
	import BmsLiveStringPanel from './BmsLiveStringPanel.svelte';
	import { getBmsDashboardSnapshot, getSiteName, hasBmsSession, setSiteName, type BmsDashboardItem } from '$lib/services/bms-api';

	let siteName=$state('My Monitoring Site'),siteDraft=$state(''),editingSite=$state(false),savingSite=$state(false);
	let cameraEnabled=$state(false),items=$state<BmsDashboardItem[]>([]),loading=$state(false),error=$state('');
	let alarmStrings=$derived(items.filter(item=>statusFor(item)==='alarm').length);
	let offlineStrings=$derived(items.filter(item=>statusFor(item)==='offline').length);

	onMount(()=>{void load();const timer=setInterval(()=>void load(false),15000);return()=>clearInterval(timer)});
	async function load(showActivity=true){
		if(!hasBmsSession()){items=[];error='Connecting to the BMS platform…';return}
		if(showActivity)loading=true;
		try{const[name,data]=await Promise.all([getSiteName().catch(()=>siteName),getBmsDashboardSnapshot()]);siteName=name;items=data;error=''}
		catch(cause){error=cause instanceof Error?cause.message:'Unable to load the BMS dashboard.'}
		finally{loading=false}
	}
	function startEdit(){siteDraft=siteName;editingSite=true}
	async function saveSite(){
		const value=siteDraft.trim();
		if(!value){error='Site name cannot be empty.';return}
		if(value.length>120){error='Site name cannot exceed 120 characters.';return}
		savingSite=true;
		try{siteName=hasBmsSession()?await setSiteName(value):value;editingSite=false;error=''}
		catch(cause){error=cause instanceof Error?cause.message:'Unable to save the site name.'}
		finally{savingSite=false}
	}
	function alarms(item:BmsDashboardItem){const summary=item.telemetry.summary,config=item.config,reasons:string[]=[];if(summary.maxResistance!==null&&config.highResistanceThreshold>0&&summary.maxResistance>=config.highResistanceThreshold)reasons.push('R');if(summary.maxTemperature!==null&&config.highTemperatureThreshold>0&&summary.maxTemperature>=config.highTemperatureThreshold)reasons.push('T');if(summary.minVoltage!==null&&config.lowVoltageThreshold>0&&summary.minVoltage<=config.lowVoltageThreshold)reasons.push('V');if(summary.maxVoltage!==null&&config.highVoltageThreshold>0&&summary.maxVoltage>=config.highVoltageThreshold)reasons.push('V');return[...new Set(reasons)]}
	function disconnected(item:BmsDashboardItem){const summary=item.telemetry.summary;return!item.telemetry.active||[summary.avgVoltage,summary.avgResistance,summary.stringVoltage,summary.stringCurrent,summary.avgTemperature].every(value=>value===null)}
	function statusFor(item:BmsDashboardItem){return alarms(item).length?'alarm':disconnected(item)?'offline':'normal'}
</script>

<section class="page">
	<div class="site-card">
		<div class="site-name"><span class="site-icon"><Home size={20}/></span>{#if editingSite}<input maxlength="120" bind:value={siteDraft}/><button aria-label="Save site name" disabled={savingSite} onclick={saveSite}><Check size={18}/></button><button aria-label="Cancel editing" onclick={()=>editingSite=false}><X size={18}/></button>{:else}<div><span>Monitoring site</span><h2>{siteName}</h2></div><button aria-label="Edit site name" onclick={startEdit}><Pencil size={17}/></button>{/if}</div>
		<div class="fleet-summary"><span><strong>{items.length}</strong> strings</span><span class:has-alarm={alarmStrings>0}><strong>{alarmStrings}</strong> alarm</span><span class:has-offline={offlineStrings>0}><strong>{offlineStrings}</strong> offline</span></div>
		<button class:loading class="refresh" aria-label="Refresh dashboard" disabled={loading} onclick={()=>load()}><RefreshCw size={18}/></button>
	</div>

	{#if error}<div class="request-error">{error}</div>{/if}

	{#if loading&&!items.length}
		<div class="loading-card"><i></i><strong>Loading live string data…</strong></div>
	{:else if items.length}
		<div class="string-grid">{#each items as item (item.config.id)}<BmsLiveStringPanel {item}/>{/each}</div>
	{:else}
		<div class="empty-card"><strong>No battery strings configured</strong><span>Add a string in Battery Strings to begin monitoring.</span></div>
	{/if}

	<details class="thermal-card"><summary><span><Thermometer size={17}/>Thermal camera</span><small>Optional room monitoring</small></summary><div class="thermal-content"><Camera size={19}/><span>{cameraEnabled?'Thermal monitoring is enabled.':'No thermal data available.'}</span><button class:active={cameraEnabled} onclick={()=>cameraEnabled=!cameraEnabled}>{cameraEnabled?'Turn off':'Turn on'}</button></div></details>
</section>

<style>
	.page{animation:enter .18s ease-out}.site-card{display:flex;align-items:center;gap:18px;min-height:76px;padding:13px 15px;border:1px solid #e1e7f0;border-radius:11px;background:#fff}.site-name{display:flex;align-items:center;gap:9px;min-width:250px}.site-icon{display:grid;width:36px;height:36px;place-items:center;border-radius:9px;color:#2653ba;background:#eaf0ff}.site-name div>span{color:#8792a4;font-size:12px}.site-name h2{margin:3px 0 0;color:#273954;font-size:18px;font-weight:500}.site-name input{width:190px;height:36px;padding:0 9px;border:1px solid #d7dfeb;border-radius:7px;color:#31415c;font:inherit}.site-name button{display:grid;width:31px;height:31px;place-items:center;border:0;border-radius:7px;color:#42649a;background:#f1f5fb;cursor:pointer}.fleet-summary{display:flex;gap:7px;margin-left:auto}.fleet-summary span{display:inline-flex;align-items:baseline;gap:4px;padding:6px 9px;border-radius:13px;color:#647187;background:#f3f5f8;font-size:11px}.fleet-summary strong{color:#35465f;font-size:13px;font-weight:500}.fleet-summary .has-alarm{color:#a74138;background:#fff0ef}.fleet-summary .has-alarm strong{color:#b7352c}.fleet-summary .has-offline{color:#6e7785;background:#edf0f4}.refresh{display:grid;width:36px;height:36px;place-items:center;border:1px solid #d9e1ec;border-radius:8px;color:#496389;background:#fff;cursor:pointer}.refresh.loading :global(svg){animation:spin .8s linear infinite}.request-error{margin-top:10px;padding:9px 11px;border:1px solid #efddae;border-radius:8px;color:#765b28;background:#fff9e9;font-size:12px}
	.string-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;align-items:start;margin-top:14px}.loading-card,.empty-card{display:grid;min-height:330px;margin-top:14px;place-content:center;justify-items:center;border:1px solid #e1e7f0;border-radius:12px;color:#79869a;background:#fff;text-align:center}.loading-card i{width:25px;height:25px;margin-bottom:10px;border:2px solid #dce5f2;border-top-color:#2c5ab4;border-radius:50%;animation:spin .8s linear infinite}.loading-card strong,.empty-card strong{color:#40516c;font-size:14px;font-weight:500}.empty-card span{margin-top:6px;font-size:12px}.thermal-card{margin-top:14px;border:1px solid #e1e7f0;border-radius:10px;background:#fff}.thermal-card summary{display:flex;align-items:center;justify-content:space-between;padding:11px 13px;color:#4b5d76;cursor:pointer;list-style:none}.thermal-card summary::-webkit-details-marker{display:none}.thermal-card summary span{display:flex;align-items:center;gap:7px;font-size:13px}.thermal-card summary small{color:#8a95a6}.thermal-content{display:flex;align-items:center;gap:8px;padding:12px 13px;border-top:1px solid #edf1f5;color:#7b8799;font-size:12px}.thermal-content button{margin-left:auto;padding:5px 9px;border:0;border-radius:6px;color:#4d6385;background:#edf2f9;cursor:pointer}.thermal-content button.active{color:#28734b;background:#ebf7ef}@keyframes spin{to{transform:rotate(360deg)}}@keyframes enter{from{opacity:0;transform:translateY(4px)}}
	.site-card{min-height:84px;padding:15px 17px}.site-name{gap:11px}.site-icon{width:42px;height:42px}.site-name div>span{color:#596b82;font-size:14px}.site-name h2{margin-top:4px;font-size:20px;font-weight:600}.fleet-summary{gap:8px}.fleet-summary span{padding:7px 11px;font-size:13px}.fleet-summary strong{font-size:15px;font-weight:600}.refresh{width:40px;height:40px}.request-error{font-size:14px}.loading-card strong,.empty-card strong{font-size:16px}.empty-card span{font-size:14px}.thermal-card summary{padding:14px 15px}.thermal-card summary span{gap:8px;font-size:16px;font-weight:500}.thermal-card summary small{color:#63738a;font-size:13px}.thermal-content{padding:14px 15px;color:#596b82;font-size:14px}.thermal-content button{padding:7px 11px;font-size:14px}
	@media(max-width:1180px){.string-grid{grid-template-columns:1fr}}@media(max-width:780px){.site-card{align-items:flex-start;flex-wrap:wrap}.site-name{min-width:0;flex:1}.fleet-summary{order:3;width:100%;margin-left:0}}@media(max-width:520px){.fleet-summary{flex-wrap:wrap}.site-name input{width:150px}}
</style>
