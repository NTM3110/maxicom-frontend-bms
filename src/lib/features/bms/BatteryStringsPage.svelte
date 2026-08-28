<script lang="ts">
	import { BatteryCharging, ChevronDown, Download, Eye, Pencil, Printer, Plus, Trash2, X } from '@lucide/svelte';
	import { onMount } from 'svelte';
	import { createBmsString, deleteBmsString, exportBmsStringRangeUrl, getBmsStringReadiness, getBmsStringTelemetry, hasBmsSession, listBmsSerialPorts, listBmsStrings, updateBmsString, type BmsSerialPort, type BmsStringTelemetry, type StringFormData, type StringReadinessTrace } from '$lib/services/bms-api';

	type BatteryString = {
		id: string;
		stringIndex: number;
		name: string;
		cellQty: number;
		cellBrand: string;
		cellModel: string;
		ratedCapacity: number;
		cutoffVoltage: number;
		floatVoltage: number;
		boostVoltage: number;
		serialPort: string;
		rNew: number;
		highResistance: number;
		highTemperature: number;
		lowVoltage: number;
		highVoltage: number;
	};

	type BatteryStringForm = Omit<BatteryString, 'id'|'stringIndex'>;
	const blankString = (): BatteryStringForm => ({
		name: '', cellQty: 0, cellBrand: '', cellModel: '', ratedCapacity: 0, cutoffVoltage: 0, floatVoltage: 0, boostVoltage: 0, serialPort: '',
		rNew: 1450, highResistance: 3335, highTemperature: 0, lowVoltage: 0, highVoltage: 0
	});

	let strings = $state<BatteryString[]>([]);
	let formOpen = $state(false);
	let editingId = $state<string | null>(null);
	let form = $state<BatteryStringForm>(blankString());
	let formError = $state('');
	let portPickerOpen = $state(false);
	let serialPorts = $state<BmsSerialPort[]>([]);
	let saving = $state(false);
	let loadError = $state('');
	let detailsOpen=$state(false),detailLoading=$state(false),detailError=$state(''),detail=$state<BmsStringTelemetry|null>(null),readiness=$state<StringReadinessTrace|null>(null),detailTab=$state<'voltage'|'temperature'|'soc'>('voltage');
	let rangeStart=$state(''),rangeEnd=$state('');

	onMount(() => { if (hasBmsSession()) void load(); });

	function fromApi(item: import('$lib/services/bms-api').BatteryString): BatteryString {
		return { id:item.id, stringIndex:item.stringIndex, name:item.stringName, cellQty:item.cellQty, cellBrand:item.cellBrand, cellModel:item.cellModel, ratedCapacity:item.ratedCapacity, cutoffVoltage:item.cutoffVoltage, floatVoltage:item.floatVoltage, boostVoltage:item.boostVoltage, serialPort:item.serialPortId, rNew:item.rNew, highResistance:item.highResistanceThreshold, highTemperature:item.highTemperatureThreshold, lowVoltage:item.lowVoltageThreshold, highVoltage:item.highVoltageThreshold };
	}
	function toApi(value: BatteryStringForm): StringFormData {
		return { stringName:value.name.trim(), cellQty:Number(value.cellQty), cellBrand:value.cellBrand.trim(), cellModel:value.cellModel.trim(), ratedCapacity:Number(value.ratedCapacity), cutoffVoltage:Number(value.cutoffVoltage), floatVoltage:Number(value.floatVoltage), boostVoltage:Number(value.boostVoltage), serialPortId:value.serialPort, rNew:Number(value.rNew), highResistanceThreshold:Number(value.highResistance), highTemperatureThreshold:Number(value.highTemperature), lowVoltageThreshold:Number(value.lowVoltage), highVoltageThreshold:Number(value.highVoltage) };
	}
	async function load() { try { const [items, ports] = await Promise.all([listBmsStrings(), listBmsSerialPorts()]); strings=items.map(fromApi); serialPorts=ports; loadError=''; } catch (error) { loadError=message(error); } }
	function message(error:unknown){ return error instanceof Error ? error.message : 'The BMS request failed.'; }
	function portLabel(id:string){ return serialPorts.find((port)=>port.id===id)?.alias || id || 'Not assigned'; }
	function dcLevel(cellQty:number){return cellQty<1?'Not determined':cellQty<=55?'110 V DC':'220 V DC'}
	function localDate(value:Date){const offset=value.getTimezoneOffset()*60000;return new Date(value.getTime()-offset).toISOString().slice(0,16)}
	async function openDetails(item:BatteryString){detailsOpen=true;detail=null;readiness=null;detailError='';detailLoading=true;const end=new Date(),start=new Date(end.getTime()-86400000);rangeStart=localDate(start);rangeEnd=localDate(end);try{if(!hasBmsSession())throw new Error('Authenticate with the BMS platform to read live string telemetry.');[detail,readiness]=await Promise.all([getBmsStringTelemetry(item.stringIndex),getBmsStringReadiness(item.stringIndex)])}catch(error){detailError=message(error)}finally{detailLoading=false}}
	function closeDetails(){detailsOpen=false;detail=null;readiness=null}
	function format(value:number|null,digits=2){return value===null?'N/A':value.toFixed(digits)}
	function exportRange(){if(!detail)return;const link=document.createElement('a');link.href=exportBmsStringRangeUrl(String(detail.stringIndex),rangeStart,rangeEnd);link.download='';link.click()}

	function openAdd() {
		editingId = null;
		form = blankString();
		formError = '';
		portPickerOpen = false;
		formOpen = true;
	}

	function openEdit(item: BatteryString) {
		editingId = item.id;
		const { id: _id, stringIndex: _stringIndex, ...editable } = item;
		form = editable;
		formError = '';
		portPickerOpen = false;
		formOpen = true;
	}

	function closeForm() { formOpen = false; portPickerOpen = false; }

	async function save() {
		if (!form.name.trim()) { formError = 'Enter a string name.'; return; }
		if (!Number.isInteger(Number(form.cellQty)) || form.cellQty < 1 || form.cellQty > 110) { formError = 'Cell quantity must be a whole number from 1 to 110.'; return; }
		if (form.lowVoltage > 0 && form.highVoltage > 0 && form.lowVoltage >= form.highVoltage) {
			formError = 'Low voltage threshold must be lower than high voltage threshold.';
			return;
		}
		saving=true;
		try {
			if (hasBmsSession()) {
				if (editingId === null) await createBmsString(toApi(form));
				else { const current=strings.find((item)=>item.id===editingId); if(!current) throw new Error('Battery string is no longer available.'); await updateBmsString(current.stringIndex,toApi(form)); }
				await load();
			} else if (editingId === null) strings=[...strings,{...form,id:`preview-${Date.now()}`,stringIndex:strings.length+1}];
			else strings=strings.map((item)=>item.id===editingId?{...form,id:item.id,stringIndex:item.stringIndex}:item);
			closeForm();
		} catch(error){ formError=message(error); } finally { saving=false; }
	}

	async function remove(item: BatteryString) {
		if (!confirm(`Delete ${item.name}?`)) return;
		try { if(hasBmsSession()) await deleteBmsString(item.stringIndex); strings=strings.filter((entry)=>entry.id!==item.id); } catch(error){ loadError=message(error); }
	}
</script>

<section class="strings-page">
	<div class="page-title-row">
		<div>
			<div class="title"><span class="title-icon"><BatteryCharging size={22} /></span><h2>Battery Strings</h2></div>
			<p>Configure battery strings, cell properties and alarm thresholds.</p>
		</div>
		<button class="primary-button" type="button" onclick={openAdd}><Plus size={18} /> Add string</button>
	</div>
	{#if loadError}<p class="load-error">{loadError}</p>{/if}

	<div class="table-card">
		<div class="table-scroll">
			<table>
				<thead><tr><th class="index-column">#</th><th>Battery string</th><th>Cells</th><th>Battery model</th><th>Capacity</th><th>Connection</th><th aria-label="Actions"></th></tr></thead>
				<tbody>
					{#if strings.length === 0}
						<tr class="empty-row"><td class="empty" colspan="7"><BatteryCharging size={28} /><strong>No battery strings configured</strong><span>Add the first string to start monitoring the battery system.</span><button type="button" onclick={openAdd}>Add string</button></td></tr>
					{:else}
						{#each strings as item, index (item.id)}
							<tr><td class="index-column"><span class="index-badge">{index + 1}</span></td><td class="name"><strong>{item.name}</strong><span>{dcLevel(item.cellQty)}</span></td><td><strong>{item.cellQty}</strong><span class="unit">cells</span></td><td><strong>{item.cellBrand || '—'}</strong><span class="unit">{item.cellModel || 'No model set'}</span></td><td><strong>{item.ratedCapacity || '—'}</strong><span class="unit">Ah</span></td><td><span class:unassigned={!item.serialPort} class="connection"><i></i>{portLabel(item.serialPort)}</span></td><td class="actions"><button type="button" title="View live data" aria-label={`View ${item.name}`} onclick={() => openDetails(item)}><Eye size={17}/></button><button type="button" title="Edit string" aria-label={`Edit ${item.name}`} onclick={() => openEdit(item)}><Pencil size={17} /></button><button class="delete" type="button" title="Delete string" aria-label={`Delete ${item.name}`} onclick={() => remove(item)}><Trash2 size={17} /></button></td></tr>
						{/each}
					{/if}
				</tbody>
			</table>
		</div>
	</div>
</section>

{#if formOpen}
	<div class="backdrop" role="presentation" onclick={closeForm}>
		<dialog open class="dialog" aria-labelledby="string-dialog-title" onclick={(event) => event.stopPropagation()}>
			<header><div><h2 id="string-dialog-title">{editingId === null ? 'Add battery string' : 'Edit battery string'}</h2><p>Configure the string and its alarm thresholds.</p></div><button type="button" onclick={closeForm} aria-label="Close"><X size={21} /></button></header>
			<form onsubmit={(event) => { event.preventDefault(); save(); }}>
				<div class="form-body">
					<section><h3>String details</h3><div class="form-grid"><label>String name<input bind:value={form.name} placeholder="e.g. String 1" /></label><label>R_NEW (µΩ)<input type="number" min="0" bind:value={form.rNew} /></label><label>Cell quantity (1–110)<input type="number" min="1" max="110" step="1" bind:value={form.cellQty} /><small class="field-hint">{dcLevel(form.cellQty)} · 1–55 cells = 110 V, 56–110 cells = 220 V</small></label><label>Cell brand<input bind:value={form.cellBrand} placeholder="e.g. Narada" /></label><label>Cell model<input bind:value={form.cellModel} placeholder="e.g. GFM-1000" /></label><label>Rated capacity (Ah)<input type="number" min="0" bind:value={form.ratedCapacity} /></label><label>Cutoff voltage (V)<input type="number" min="0" step="0.01" bind:value={form.cutoffVoltage} /></label><label>Float voltage (V)<input type="number" min="0" step="0.01" bind:value={form.floatVoltage} /></label><label>Boost voltage (V)<input type="number" min="0" step="0.01" bind:value={form.boostVoltage} /></label><label class="port-field">Serial port<div class="port-select"><button type="button" class:open={portPickerOpen} aria-haspopup="listbox" aria-expanded={portPickerOpen} onclick={() => portPickerOpen = !portPickerOpen}><span>{portLabel(form.serialPort).replace('Not assigned','Select a port')}</span><ChevronDown size={17} /></button>{#if portPickerOpen}<div class="port-options" role="listbox" aria-label="Serial port">{#each serialPorts as port}<button type="button" class:selected={form.serialPort === port.id} role="option" aria-selected={form.serialPort === port.id} onclick={() => { form.serialPort = port.id; portPickerOpen = false; }}>{port.alias}</button>{/each}{#if !serialPorts.length}<span class="no-options">No configured serial ports</span>{/if}</div>{/if}</div></label></div></section>
					<section><div class="section-heading"><h3>Alarm thresholds</h3><span>Set 0 to disable a threshold</span></div><div class="form-grid"><label>IR high (µΩ)<input type="number" min="0" bind:value={form.highResistance} /></label><label>Temperature high (°C)<input type="number" min="0" step="0.1" bind:value={form.highTemperature} /></label><label>Voltage low (V)<input type="number" min="0" step="0.001" bind:value={form.lowVoltage} /></label><label>Voltage high (V)<input type="number" min="0" step="0.001" bind:value={form.highVoltage} /></label></div></section>
					{#if formError}<p class="form-error">{formError}</p>{/if}
				</div>
				<footer><button class="secondary-button" type="button" onclick={closeForm}>Cancel</button><button class="primary-button" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save string'}</button></footer>
			</form>
		</dialog>
	</div>
{/if}

{#if detailsOpen}<div class="backdrop detail-backdrop" role="presentation" onclick={closeDetails}><dialog open class="detail-dialog" aria-labelledby="detail-title" onclick={(event)=>event.stopPropagation()}><header><div><h2 id="detail-title">{detail?.stringName??'Battery string data'}</h2><p>Live TA/TC measurements from bms.tools.strings.getData.</p></div><button onclick={closeDetails} aria-label="Close"><X size={21}/></button></header><div class="detail-body">{#if detailLoading}<div class="detail-empty">Loading live measurements…</div>{:else if detailError}<div class="detail-error">{detailError}</div>{:else if detail}
	{#if readiness}<div class:complete={readiness.complete} class="readiness"><strong>{readiness.complete?'Ready':'Measuring'}</strong><span>TA {readiness.successfulTaIds.length}/{readiness.expectedCellCount} · TC {readiness.tcState}</span>{#if readiness.pendingTaIds.length}<small>Pending TA: {readiness.pendingTaIds.join(', ')}</small>{/if}{#if readiness.failedTaIds.length}<small>Failed TA: {readiness.failedTaIds.join(', ')}</small>{/if}</div>{/if}
	{#if detail.calculation.snapshotStale}<div class="detail-error">Live snapshot is stale{detail.calculation.snapshotAgeMs!==null?` (${Math.floor(detail.calculation.snapshotAgeMs/1000)} seconds old)`:''}. Values remain N/A until a fresh snapshot is published.</div>{:else if detail.calculation.error}<div class="detail-error">SoC/SoH calculation failed: {detail.calculation.error}</div>{/if}
	<div class="summary-grid"><article><span>String voltage</span><strong>{format(detail.summary.stringVoltage,3)} V</strong></article><article><span>Current</span><strong>{format(detail.summary.stringCurrent,3)} A</strong></article><article><span>Ambient</span><strong>{format(detail.summary.ambientTemperature,1)} °C</strong></article><article><span>String SoC</span><strong>{format(detail.summary.stringSoC,2)} %</strong></article><article><span>String SoH</span><strong>{format(detail.summary.stringSoH,2)} %</strong></article><article><span>Cells online</span><strong>{detail.cells.length} / {detail.cellQty}</strong></article></div>
	<div class="detail-tools"><div class="detail-tabs"><button class:active={detailTab==='voltage'} onclick={()=>detailTab='voltage'}>Voltage / Resistance</button><button class:active={detailTab==='temperature'} onclick={()=>detailTab='temperature'}>Temperature / Power</button><button class:active={detailTab==='soc'} onclick={()=>detailTab='soc'}>SoC / SoH</button></div><button class="tool-button" onclick={()=>window.print()}><Printer size={15}/>Print</button></div>
	<div class="cells-table"><table><thead><tr><th>Cell ID</th>{#if detailTab==='voltage'}<th>Voltage (V)</th><th>Resistance (µΩ)</th>{:else if detailTab==='temperature'}<th>Temperature (°C)</th><th>Power (W)</th>{:else}<th>SoC (%)</th><th>SoH (%)</th>{/if}<th>Availability</th></tr></thead><tbody>{#each detail.cells as cell}<tr><td>{cell.id}</td>{#if detailTab==='voltage'}<td>{format(cell.voltage,3)}</td><td>{format(cell.resistance,1)}</td>{:else if detailTab==='temperature'}<td>{format(cell.temperature,1)}</td><td>{format(cell.voltage===null||detail.summary.stringCurrent===null?null:cell.voltage*detail.summary.stringCurrent,2)}</td>{:else}<td>{format(cell.soc,3)}</td><td>{format(cell.soh,3)}</td>{/if}<td>{cell.availabilityWarning??'Available'}</td></tr>{/each}{#if !detail.cells.length}<tr><td class="cell-empty" colspan="4">No cell telemetry returned.</td></tr>{/if}</tbody></table></div>
	<div class="export-range"><label>From<input type="datetime-local" bind:value={rangeStart}/></label><label>To<input type="datetime-local" bind:value={rangeEnd}/></label><button class="tool-button" onclick={exportRange}><Download size={15}/>Export CSV</button></div>
	{/if}</div></dialog></div>{/if}

<style>
	.strings-page { animation:enter .2s ease-out; }.page-title-row { display:flex; align-items:flex-start; justify-content:space-between; gap:20px; margin-bottom:26px; }.title { display:flex; align-items:center; gap:11px; }.title h2 { margin:0; color:#172b4d; font-size:24px; font-weight:600; }.title-icon,.table-heading-icon { display:grid; place-items:center; flex:0 0 auto; border-radius:10px; color:#2653ba; background:#eaf0ff; }.title-icon { width:38px; height:38px; }.page-title-row p { margin:7px 0 0; color:#718096; font-size:16px; }.primary-button,.secondary-button { display:inline-flex; align-items:center; justify-content:center; gap:8px; min-height:42px; padding:0 15px; border:1px solid transparent; border-radius:8px; cursor:pointer; font-family:inherit; font-size:15px; font-weight:500; }.primary-button { color:#fff; background:#1749ad; box-shadow:0 2px 5px rgba(23,73,173,.18); }.primary-button:hover { background:#103b93; box-shadow:0 4px 10px rgba(23,73,173,.21); }.secondary-button { color:#40516f; border-color:#d9e0eb; background:#fff; }.secondary-button:hover { background:#f7f9fc; }.table-card { overflow:hidden; border:1px solid #e1e7f0; border-radius:15px; background:#fff; box-shadow:0 10px 28px rgba(37,57,95,.055); }.table-heading { display:flex; align-items:center; gap:12px; min-height:90px; padding:19px 23px; border-bottom:1px solid #e9edf4; }.table-heading-icon { width:35px; height:35px; }.table-heading h3 { margin:0; color:#263858; font-size:17px; font-weight:550; }.table-heading p { margin:5px 0 0; color:#7b879a; font-size:14px; }.string-count { display:grid; place-items:center; min-width:29px; height:29px; margin-left:auto; border-radius:15px; color:#4160a2; background:#edf3ff; font-size:14px; font-weight:550; }.table-scroll { overflow-x:auto; }table { width:100%; min-width:830px; border-collapse:separate; border-spacing:0; }th { padding:14px 18px; color:#79869a; background:#f8faff; border-bottom:1px solid #e7edf5; font-size:12px; font-weight:600; letter-spacing:.035em; text-align:left; text-transform:uppercase; }th.index-column,td.index-column { width:64px; text-align:center; }td { padding:16px 18px; border-bottom:1px solid #edf1f6; color:#526179; font-size:15px; vertical-align:middle; }tbody tr:last-child td { border-bottom:0; }tbody tr { transition:background .16s ease, box-shadow .16s ease; }tbody tr:not(.empty-row):hover { background:#fafcff; box-shadow:inset 3px 0 #5a7fd5; }.index-badge { display:inline-grid; place-items:center; width:27px; height:27px; border-radius:8px; color:#4e67a0; background:#f0f4fc; font-size:13px; font-weight:500; }td.name strong,td strong { display:block; color:#2b3b55; font-size:15px; font-weight:500; }td.name span,.unit { display:block; margin-top:3px; color:#8793a6; font-size:13px; }.connection { display:inline-flex; align-items:center; gap:7px; min-height:27px; padding:0 9px; border-radius:14px; color:#3a7757; background:#ecf8f0; font-size:13px; }.connection i { width:6px; height:6px; border-radius:50%; background:#35a866; }.connection.unassigned { color:#8a6a3c; background:#fff7e9; }.connection.unassigned i { background:#d8a34d; }.actions { display:flex; justify-content:flex-end; gap:7px; }.actions button { display:grid; place-items:center; width:34px; height:34px; border:1px solid #dce6fb; border-radius:8px; color:#31569f; background:#f6f9ff; cursor:pointer; transition:all .15s ease; }.actions button:hover { border-color:#bdd0fa; background:#eaf1ff; transform:translateY(-1px); }.actions button.delete { border-color:#f7dfdd; color:#d92d20; background:#fff8f7; }.actions button.delete:hover { border-color:#f1c8c4; background:#fff0ef; }.empty { height:330px; text-align:center; }.empty :global(svg),.empty strong,.empty span,.empty button { display:block; margin-left:auto; margin-right:auto; }.empty :global(svg) { color:#6d8bd1; margin-bottom:12px; }.empty strong { color:#33435e; font-size:16px; font-weight:550; }.empty span { margin-top:7px; color:#7c889d; }.empty button { margin-top:17px; padding:8px 12px; border:0; border-radius:7px; color:#1647a8; background:#eaf0ff; cursor:pointer; font:inherit; font-size:14px; font-weight:500; }
	.backdrop { position:fixed; inset:0; z-index:20; display:flex; align-items:stretch; justify-content:flex-end; background:rgba(17,34,65,.32); }.dialog { width:min(640px,100%); min-height:100vh; max-height:100vh; margin:0; overflow:hidden; border:0; border-left:1px solid #dbe3f0; border-radius:0; background:#fff; box-shadow:-18px 0 48px rgba(14,31,65,.22); }.dialog header { display:flex; justify-content:space-between; gap:16px; padding:24px 28px 20px; border-bottom:1px solid #e8edf5; }.dialog header h2 { margin:0; color:#1d304f; font-size:21px; font-weight:600; }.dialog header p { margin:5px 0 0; color:#77849a; font-size:14px; }.dialog header button { display:grid; place-items:center; width:34px; height:34px; border:0; border-radius:7px; color:#65728a; background:transparent; cursor:pointer; }.dialog header button:hover { background:#f2f5fa; }.form-body { height:calc(100vh - 165px); padding:25px 28px; overflow:auto; }.form-body section + section { margin-top:27px; }.form-body h3 { margin:0 0 15px; color:#31415c; font-size:16px; font-weight:550; }.section-heading { display:flex; justify-content:space-between; align-items:baseline; gap:12px; }.section-heading span { color:#8792a4; font-size:13px; }.form-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:16px 18px; }label { display:grid; gap:7px; color:#536078; font-size:14px; font-weight:450; }input,select { width:100%; height:41px; padding:0 11px; border:1px solid #d7dfeb; border-radius:7px; outline:none; color:#273853; background:#fff; font:inherit; font-size:15px; }input:focus,select:focus { border-color:#3764c0; box-shadow:0 0 0 3px rgba(55,100,192,.12); }.form-error { margin:18px 0 0; color:#c5281c; font-size:14px; }.dialog footer { display:flex; justify-content:flex-end; gap:10px; height:81px; padding:16px 28px; border-top:1px solid #e8edf5; background:#fbfcfe; }@keyframes enter { from { opacity:0; transform:translateY(5px); } to { opacity:1; transform:translateY(0); } }@media (max-width:680px) { .page-title-row { align-items:stretch; flex-direction:column; }.page-title-row .primary-button { width:100%; }.form-grid { grid-template-columns:1fr; }.dialog { width:100%; }.form-body { height:calc(100vh - 165px); padding:20px; }.dialog header,.dialog footer { padding-left:20px; padding-right:20px; }.section-heading { align-items:flex-start; flex-direction:column; gap:3px; } }

	/* Flat popup treatment: quiet surfaces and natural font weights. */
	.primary-button,.secondary-button { font-weight:400; box-shadow:none; }
	.table-add { margin-left:3px; white-space:nowrap; }
	.primary-button:hover { box-shadow:none; }
	.table-card { border:0; border-radius:0; background:transparent; box-shadow:none; }
	.table-heading { padding-right:0; padding-left:0; border-bottom:0; }.table-scroll { border-top:1px solid #e5ebf3; border-bottom:1px solid #e5ebf3; background:#fff; }
	.title h2 { font-weight:500; }.table-heading h3,.form-body h3,.empty strong { font-weight:500; }
	td.name strong,td strong { font-weight:400; }
	.backdrop { display:grid; place-items:center; padding:24px; background:rgba(24,35,58,.24); }
	.dialog { width:min(560px,calc(100% - 48px)); min-height:0; max-height:calc(100vh - 32px); margin:auto; border:1px solid #e1e6ee; border-radius:12px; box-shadow:0 14px 38px rgba(26,42,70,.14); }
	.dialog header { padding:18px 22px 15px; }.dialog header h2 { font-size:20px; font-weight:500; }.dialog header p { font-size:13px; font-weight:400; }
	.form-body { height:auto; max-height:calc(100vh - 176px); padding:18px 22px; }.form-body section + section { margin-top:19px; }.form-body h3 { margin-bottom:11px; font-size:15px; }.form-grid { gap:11px 14px; }label { gap:5px; font-size:13px; }input,select { height:38px; font-size:14px; }.section-heading span { font-size:12px; }
	.dialog footer { height:auto; padding:12px 22px; background:#fff; }.primary-button,.secondary-button { min-height:38px; font-size:14px; }
	.dialog { position:relative; display:flex; flex-direction:column; overflow:hidden; }.dialog form { display:flex; flex:1; min-height:0; flex-direction:column; }.form-body { flex:1; min-height:0; max-height:none; overflow-y:auto; }.dialog footer { flex:0 0 auto; }
	.backdrop { display:grid !important; place-items:center !important; justify-content:center !important; align-items:center !important; }
	.backdrop .dialog { justify-self:center; align-self:center; margin:0 !important; }
	@media (min-width:621px) { .dialog { inline-size:540px !important; max-inline-size:calc(100vw - 32px); } }
	@media (max-height:820px) and (min-width:621px) { .dialog { width:min(540px,calc(100% - 32px)); max-height:calc(100vh - 24px); }.dialog header { padding-top:15px; padding-bottom:13px; }.form-body { padding-top:14px; padding-bottom:14px; }.form-body section + section { margin-top:15px; }.dialog footer { padding-top:10px; padding-bottom:10px; } }
	.port-field { position:relative; }.port-select { position:relative; }.port-select > button { display:flex; align-items:center; justify-content:space-between; width:100%; height:38px; padding:0 10px 0 11px; border:1px solid #d7dfeb; border-radius:7px; color:#273853; background:#fff; cursor:pointer; font:inherit; font-size:14px; text-align:left; }.port-select > button:hover { border-color:#bfcce1; }.port-select > button.open { border-color:#3764c0; box-shadow:0 0 0 3px rgba(55,100,192,.12); }.port-select > button :global(svg) { color:#6c7b93; transition:transform .15s ease; }.port-select > button.open :global(svg) { transform:rotate(180deg); }.port-options { position:absolute; z-index:2; top:calc(100% + 5px); right:0; left:0; overflow:hidden; border:1px solid #d7dfeb; border-radius:8px; background:#fff; box-shadow:0 8px 18px rgba(31,53,87,.12); }.port-options button { display:block; width:100%; min-height:34px; padding:0 11px; border:0; color:#354562; background:#fff; cursor:pointer; font:inherit; font-size:14px; text-align:left; }.port-options button:hover,.port-options button.selected { color:#19489e; background:#edf3ff; }
	.field-hint{margin-top:1px;color:#708099;font-size:11px;line-height:1.35}.load-error{margin:-13px 0 15px;padding:10px 12px;border:1px solid #f3cac6;border-radius:8px;color:#b42318;background:#fff1f0;font-size:13px}.no-options{display:block;padding:10px 11px;color:#8792a4;font-size:13px}.primary-button:disabled{opacity:.55;cursor:wait}
	.detail-dialog{width:min(980px,calc(100vw - 40px))!important;inline-size:min(980px,calc(100vw - 40px))!important}.detail-body{padding:18px 22px;overflow:auto}.detail-empty{display:grid;min-height:280px;place-items:center;color:#718096}.detail-error{margin-bottom:12px;padding:10px 12px;border:1px solid #f3cac6;border-radius:8px;color:#b42318;background:#fff1f0;font-size:13px}.readiness{display:flex;align-items:center;gap:10px;margin-bottom:12px;padding:10px 12px;border:1px solid #f1d9a8;border-radius:8px;color:#8a651b;background:#fffaef;font-size:13px}.readiness.complete{border-color:#cae7d5;color:#28784e;background:#f2fbf5}.readiness small{margin-left:auto}.summary-grid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px}.summary-grid article{padding:11px;border:1px solid #e5eaf2;border-radius:8px;background:#fafbfd}.summary-grid span,.summary-grid strong{display:block}.summary-grid span{color:#8792a4;font-size:11px}.summary-grid strong{margin-top:5px;color:#31415c;font-size:14px;font-weight:500}.detail-tools{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:15px 0 9px}.detail-tabs{display:flex;gap:3px;border-bottom:1px solid #e2e8f1}.detail-tabs button{height:36px;padding:0 10px;border:0;border-bottom:2px solid transparent;color:#65738b;background:transparent;font:inherit;font-size:13px;cursor:pointer}.detail-tabs button.active{border-color:#2454b6;color:#1d4ba7}.tool-button{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:36px;padding:0 11px;border:1px solid #d7dfeb;border-radius:7px;color:#40516f;background:#fff;font:inherit;font-size:13px;cursor:pointer}.cells-table{max-height:280px;overflow:auto;border:1px solid #e5ebf3}.cells-table table{min-width:620px}.cells-table th{position:sticky;top:0}.cells-table td{padding:10px 14px;font-size:13px}.cell-empty{text-align:center}.export-range{display:flex;align-items:end;justify-content:flex-end;gap:9px;margin-top:13px}.export-range label{min-width:190px}.export-range input{height:36px}.detail-backdrop{z-index:35}@media(max-width:900px){.summary-grid{grid-template-columns:repeat(3,1fr)}.readiness{align-items:flex-start;flex-direction:column}.readiness small{margin-left:0}}@media(max-width:650px){.summary-grid{grid-template-columns:repeat(2,1fr)}.detail-tools,.export-range{align-items:stretch;flex-direction:column}.detail-tabs{overflow-x:auto}.export-range label{min-width:0}.tool-button{width:100%}}
	@media (max-width:680px) { .table-heading { flex-wrap:wrap; }.table-add { margin-left:auto; }.backdrop { padding:12px; }.dialog { width:100%; max-height:calc(100vh - 24px); }.form-body { max-height:calc(100vh - 164px); padding:18px; }.dialog header,.dialog footer { padding-left:18px; padding-right:18px; } }
</style>
