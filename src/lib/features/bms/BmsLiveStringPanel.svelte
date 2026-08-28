<script lang="ts">
	import { BatteryCharging, Download } from '@lucide/svelte';
	import BmsLiveCellChart from './BmsLiveCellChart.svelte';
	import { exportBmsStringRangeUrl, type BmsCellTelemetry, type BmsDashboardItem } from '$lib/services/bms-api';

	type CellMode='voltage'|'temperature'|'soc';
	let { item }: { item:BmsDashboardItem }=$props();
	let tab=$state<CellMode>('voltage');
	let cells=$derived.by(()=>{
		const returned=new Map(item.telemetry.cells.map(cell=>[cell.id,cell]));
		return Array.from({length:item.config.cellQty},(_,index)=>returned.get(index+1)??{
			id:index+1,voltage:null,temperature:null,resistance:null,ir:null,soc:null,soh:null,availabilityWarning:'No telemetry returned'
		} satisfies BmsCellTelemetry);
	});
	let cellGroups=$derived.by(()=>{const split=Math.ceil(cells.length/2);return[cells.slice(0,split),cells.slice(split)]});
	let apiCells=$derived(item.telemetry.cells.filter(cell=>hasMeasurement(cell)));
	let dcLevel=$derived(item.config.cellQty<=55?'110 V DC':'220 V DC');
	let alarmCount=$derived(cells.filter(cell=>alarmReasons(cell).length>0).length);
	let offlineCount=$derived(cells.filter(cell=>!!cell.availabilityWarning||!hasMeasurement(cell)).length);
	let onlineCount=$derived(Math.max(0,cells.length-offlineCount));
	let stringDisconnected=$derived(!item.telemetry.active||item.telemetry.calculation.snapshotStale||[item.telemetry.summary.avgVoltage,item.telemetry.summary.avgResistance,item.telemetry.summary.stringVoltage,item.telemetry.summary.stringCurrent,item.telemetry.summary.avgTemperature].every(input=>input===null));
	let stringTone=$derived(alarmCount>0?'alarm':stringDisconnected?'offline':'normal');
	let snapshot=$derived(item.telemetry.calculation.snapshotTimestamp?new Date(item.telemetry.calculation.snapshotTimestamp).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'}):'N/A');
	let readinessTone=$derived(item.readiness?.complete?'normal':item.readiness?'pending':'offline');
	let readinessLabel=$derived(item.readiness?.complete?'Ready':item.readiness?'Starting':'Not reported');
	let diagnosticMessage=$derived.by(()=>{
		const telemetry=item.telemetry;
		if(telemetry.calculation.snapshotStale)return telemetry.calculation.snapshotAgeMs===null?'Live snapshot is stale.':`Live snapshot is ${Math.floor(telemetry.calculation.snapshotAgeMs/1000)} seconds old.`;
		if(telemetry.calculation.error)return `SoC / SoH calculation: ${telemetry.calculation.error}`;
		if(telemetry.statusMessage)return telemetry.statusMessage;
		if(telemetry.calculation.stringWarning)return telemetry.calculation.stringWarning;
		if(telemetry.calculation.unavailableTaCellIds.length)return `TA unavailable: cells ${telemetry.calculation.unavailableTaCellIds.join(', ')}`;
		if(!telemetry.calculation.calculatorAvailable)return 'SoC / SoH calculator is not active.';
		return '';
	});

	function value(input:number|null|undefined,digits=1){return input===null||input===undefined?'—':input.toFixed(digits)}
	function hasMeasurement(cell:BmsCellTelemetry){return[cell.voltage,cell.temperature,cell.resistance,cell.ir,cell.soc,cell.soh].some(input=>input!==null)}
	function alarmReasons(cell:BmsCellTelemetry){
		const config=item.config,reasons:string[]=[];
		if(cell.resistance!==null&&config.highResistanceThreshold>0&&cell.resistance>=config.highResistanceThreshold)reasons.push('High internal resistance');
		if(cell.temperature!==null&&config.highTemperatureThreshold>0&&cell.temperature>=config.highTemperatureThreshold)reasons.push('High temperature');
		if(cell.voltage!==null&&config.lowVoltageThreshold>0&&cell.voltage<=config.lowVoltageThreshold)reasons.push('Low voltage');
		if(cell.voltage!==null&&config.highVoltageThreshold>0&&cell.voltage>=config.highVoltageThreshold)reasons.push('High voltage');
		return reasons;
	}
	function cellTone(cell:BmsCellTelemetry){return cell.availabilityWarning||!hasMeasurement(cell)?'offline':alarmReasons(cell).length?'alarm':'normal'}
	function cellTitle(cell:BmsCellTelemetry){return cell.availabilityWarning??(!hasMeasurement(cell)?'No API data':alarmReasons(cell).join(', ')||'Normal')}
	function rangeLabel(group:BmsCellTelemetry[]){return group.length?`Cells ${group[0].id}–${group[group.length-1].id}`:'No cells'}
	function cellPower(cell:BmsCellTelemetry){const current=item.telemetry.summary.stringCurrent;return cell.voltage===null||current===null?null:cell.voltage*current}
	function firstValue(cell:BmsCellTelemetry){return tab==='voltage'?value(cell.voltage,3):tab==='temperature'?value(cell.temperature,1):value(cell.soc,1)}
	function secondValue(cell:BmsCellTelemetry){return tab==='voltage'?value(cell.resistance,1):tab==='temperature'?value(cellPower(cell),2):value(cell.soh,1)}
	function measured(input:number|null|undefined,digits:number,unit:string){return input===null||input===undefined?'—':`${input.toFixed(digits)} ${unit}`}
	function configured(input:number,digits:number,unit:string){return !Number.isFinite(input)||input<=0?'N/A':`${input.toFixed(digits)} ${unit}`}
	function configuredRange(low:number,high:number){return low>0&&high>0?`${low.toFixed(2)} / ${high.toFixed(2)} V`:'N/A'}
	function extreme(index:number|null,valueInput:number|null,digits:number,unit:string){return index===null||valueInput===null?'—':`Cell ${index} · ${valueInput.toFixed(digits)} ${unit}`}
	function channelAvailable(input:number|null){return item.telemetry.active&&!item.telemetry.calculation.snapshotStale&&input!==null}
	function exportLastDay(){const end=new Date(),start=new Date(end.getTime()-86400000);const local=(date:Date)=>new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16);const link=document.createElement('a');link.href=exportBmsStringRangeUrl(String(item.config.stringIndex),local(start),local(end));link.download='';link.click()}
</script>

<article class="string-panel">
	<header class="string-head">
		<div class="string-title"><span class="string-icon"><BatteryCharging size={18}/></span><div><div class="title-line"><h2>{item.config.stringName}</h2><span>{dcLevel}</span></div><p>{item.config.cellBrand || 'Unknown brand'} · {item.config.cellModel || 'Unknown model'} · {item.config.cellQty} cells · {onlineCount} online</p></div></div>
		<div class="head-actions"><button type="button" title="Export the latest 24 hours" onclick={exportLastDay}><Download size={14}/>Export 24h</button></div>
	</header>

	<section class="status-panel">
		<header><h3>String status</h3><span class={`overall-status ${stringTone}`}><i></i>{stringTone==='alarm'?`${alarmCount} alarm${alarmCount===1?'':'s'}`:stringTone==='offline'?'No telemetry':'Live API'}</span></header>
		<div class="status-channels">
			<div class:live={channelAvailable(item.telemetry.summary.avgVoltage)}><span>Cell voltage</span><strong><i></i>{channelAvailable(item.telemetry.summary.avgVoltage)?'On':'Off'}</strong></div>
			<div class:live={channelAvailable(item.telemetry.summary.avgResistance)}><span>Resistance</span><strong><i></i>{channelAvailable(item.telemetry.summary.avgResistance)?'On':'Off'}</strong></div>
			<div class:live={channelAvailable(item.telemetry.summary.stringVoltage)}><span>String voltage</span><strong><i></i>{channelAvailable(item.telemetry.summary.stringVoltage)?'On':'Off'}</strong></div>
			<div class:live={channelAvailable(item.telemetry.summary.stringCurrent)}><span>Current</span><strong><i></i>{channelAvailable(item.telemetry.summary.stringCurrent)?'On':'Off'}</strong></div>
			<div class:live={channelAvailable(item.telemetry.summary.avgTemperature)}><span>Temperature</span><strong><i></i>{channelAvailable(item.telemetry.summary.avgTemperature)?'On':'Off'}</strong></div>
			<div class:live={channelAvailable(item.telemetry.summary.stringSoC)||channelAvailable(item.telemetry.summary.stringSoH)}><span>SOC / SOH</span><strong><i></i>{channelAvailable(item.telemetry.summary.stringSoC)||channelAvailable(item.telemetry.summary.stringSoH)?'On':'Off'}</strong></div>
		</div>
		<div class="status-meta">
			<span class={`meta-state ${readinessTone}`}><i></i>Readiness: {readinessLabel}</span>
			<span>TA {item.readiness?.successfulTaIds.length??0}/{item.readiness?.expectedCellCount??item.config.cellQty} · TC {item.readiness?.tcState??'N/A'}</span>
			<span>Snapshot {item.telemetry.calculation.snapshotSequence??'N/A'} · Updated {snapshot}</span>
		</div>
		{#if diagnosticMessage}<div class="status-note warning" title={diagnosticMessage}>{diagnosticMessage}</div>{/if}
	</section>

	<section class="string-data">
		<header><h3>String Data</h3><span>Rated capacity {configured(item.config.ratedCapacity,0,'Ah')}</span></header>
		<div class="metric-grid">
			<div class="primary-metric"><span>String voltage</span><strong>{measured(item.telemetry.summary.stringVoltage,2,'V')}</strong></div><div class="primary-metric"><span>Midpoint voltage</span><strong>{measured(item.telemetry.summary.midpointVoltage,2,'V')}</strong></div><div class="primary-metric"><span>Current</span><strong>{measured(item.telemetry.summary.stringCurrent,2,'A')}</strong></div>
			<div><span>Ambient</span><strong>{measured(item.telemetry.summary.ambientTemperature,1,'°C')}</strong></div><div><span>Average voltage</span><strong>{measured(item.telemetry.summary.avgVoltage,3,'V')}</strong></div><div><span>Average temperature</span><strong>{measured(item.telemetry.summary.avgTemperature,1,'°C')}</strong></div>
			<div><span>Average resistance</span><strong>{measured(item.telemetry.summary.avgResistance,1,'µΩ')}</strong></div><div><span>String SOC</span><strong>{measured(item.telemetry.summary.stringSoC,1,'%')}</strong></div><div><span>String SOH</span><strong>{measured(item.telemetry.summary.stringSoH,1,'%')}</strong></div>
		</div>
		<div class="detail-groups">
			<section class="config-group">
				<h4>Configuration & alarm limits</h4>
				<dl>
					<div><dt>Cut-off</dt><dd>{configured(item.config.cutoffVoltage,2,'V')}</dd></div><div><dt>Float</dt><dd>{configured(item.config.floatVoltage,2,'V')}</dd></div>
					<div><dt>Boost / equalize</dt><dd>{configured(item.config.boostVoltage,2,'V')}</dd></div><div><dt>R_NEW</dt><dd>{configured(item.config.rNew,0,'µΩ')}</dd></div>
					<div><dt>Low / high voltage</dt><dd>{configuredRange(item.config.lowVoltageThreshold,item.config.highVoltageThreshold)}</dd></div><div><dt>High temperature</dt><dd>{configured(item.config.highTemperatureThreshold,1,'°C')}</dd></div>
					<div><dt>High resistance</dt><dd>{configured(item.config.highResistanceThreshold,0,'µΩ')}</dd></div><div><dt>Serial port</dt><dd>{item.config.serialPortId || 'Not assigned'}</dd></div>
				</dl>
			</section>
			<section class="extremes-group">
				<h4>Cell extremes</h4>
				<dl>
					<div><dt>Maximum voltage</dt><dd>{extreme(item.telemetry.summary.maxVoltageCellIndex,item.telemetry.summary.maxVoltage,3,'V')}</dd></div><div><dt>Minimum voltage</dt><dd>{extreme(item.telemetry.summary.minVoltageCellIndex,item.telemetry.summary.minVoltage,3,'V')}</dd></div>
					<div><dt>Maximum temperature</dt><dd>{extreme(item.telemetry.summary.maxTemperatureCellIndex,item.telemetry.summary.maxTemperature,1,'°C')}</dd></div><div><dt>Minimum temperature</dt><dd>{extreme(item.telemetry.summary.minTemperatureCellIndex,item.telemetry.summary.minTemperature,1,'°C')}</dd></div>
					<div><dt>Maximum resistance</dt><dd>{extreme(item.telemetry.summary.maxResistanceCellIndex,item.telemetry.summary.maxResistance,1,'µΩ')}</dd></div><div><dt>Minimum resistance</dt><dd>{extreme(item.telemetry.summary.minResistanceCellIndex,item.telemetry.summary.minResistance,1,'µΩ')}</dd></div>
				</dl>
			</section>
		</div>
	</section>

	<div class="cell-section">
		<div class="cell-toolbar"><nav class="tabs" aria-label="Cell measurement"><button class:active={tab==='voltage'} onclick={()=>tab='voltage'}>Voltage / Resistance</button><button class:active={tab==='temperature'} onclick={()=>tab='temperature'}>Temperature / Power</button><button class:active={tab==='soc'} onclick={()=>tab='soc'}>SOC / SOH</button></nav><div class="legend"><span><i class="normal"></i>Normal</span><span><i class="alarm"></i>Alarm</span><span><i class="offline"></i>Offline</span></div></div>
		{#if cells.length}
			<div class="cell-scroll">
				<div class="cell-columns">
					{#each cellGroups as group}
						<section class="cell-group">
							<h4>{rangeLabel(group)}</h4>
							<table>
								<thead><tr><th>Cell</th>{#if tab==='voltage'}<th>Voltage (V)</th><th>Resistance (µΩ)</th>{:else if tab==='temperature'}<th>Temperature (°C)</th><th>Power (W)</th>{:else}<th>SOC (%)</th><th>SOH (%)</th>{/if}</tr></thead>
								<tbody>{#each group as cell (cell.id)}<tr class={cellTone(cell)} title={cellTitle(cell)}><td><span class="cell-id"><i></i>{cell.id}</span></td><td>{firstValue(cell)}</td><td>{secondValue(cell)}</td></tr>{/each}</tbody>
							</table>
						</section>
					{/each}
				</div>
			</div>
		{:else}
			<div class="cell-empty"><strong>No live cell data</strong><span>The table will populate when the BMS publishes a snapshot.</span></div>
		{/if}
		<div class="chart-block"><header><h3>Cell measurement profile</h3><span>{tab==='voltage'?'Voltage and resistance':tab==='temperature'?'Temperature and power (P = V × I)':'SOC and SOH'}</span></header>{#if apiCells.length}<BmsLiveCellChart mode={tab} cells={apiCells} stringCurrent={item.telemetry.summary.stringCurrent} cutoffVoltage={item.config.cutoffVoltage}/>{:else}<div class="chart-empty">No API telemetry available for this chart.</div>{/if}</div>
	</div>
</article>

<style>
	.string-panel{container-type:inline-size;min-width:0;overflow:hidden;border:1px solid #dfe6f0;border-radius:13px;background:#fff;box-shadow:0 7px 22px rgba(35,54,89,.045)}.string-head{display:flex;align-items:center;justify-content:space-between;gap:16px;min-height:68px;padding:14px 15px;border-bottom:1px solid #e8edf4}.string-title{display:flex;align-items:center;gap:10px;min-width:0}.string-title>div{min-width:0}.string-icon{display:grid;flex:0 0 38px;width:38px;height:38px;place-items:center;border-radius:9px;color:#2653ba;background:#eaf0ff}.title-line{display:flex;align-items:center;gap:8px}.title-line h2{margin:0;overflow:hidden;color:#253956;font-size:17px;font-weight:500;text-overflow:ellipsis;white-space:nowrap}.title-line>span{padding:3px 8px;border-radius:10px;color:#40619a;background:#eef3fb;font-size:11px;white-space:nowrap}.string-title p{margin:4px 0 0;overflow:hidden;color:#6f7d91;font-size:12px;text-overflow:ellipsis;white-space:nowrap}.head-actions{display:flex;align-items:center}.head-actions button{display:inline-flex;align-items:center;gap:6px;height:36px;padding:0 11px;border:1px solid #d9e2ef;border-radius:7px;color:#36588f;background:#fff;font:inherit;font-size:12px;cursor:pointer;white-space:nowrap}.head-actions button:hover{border-color:#c6d4e8;background:#f5f8fc}.overall-status{display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border-radius:13px;font-size:11px;white-space:nowrap}.overall-status i,.meta-state i,.status-channels strong i,.legend i,.cell-group td:first-child i{width:7px;height:7px;border-radius:50%}.overall-status.normal{color:#267449;background:#e9f7ee}.overall-status.normal i,.meta-state.normal i,.status-channels .live strong i,.legend i.normal,.cell-group tr.normal td:first-child i{background:#39a867}.overall-status.alarm{color:#a93a31;background:#fff0ef}.overall-status.alarm i,.legend i.alarm,.cell-group tr.alarm td:first-child i{background:#d8473e}.overall-status.offline{color:#687588;background:#eef1f5}.overall-status.offline i,.meta-state.offline i,.legend i.offline,.cell-group tr.offline td:first-child i{background:#98a3b2}.meta-state.pending i{background:#dfa83e}
	.status-panel{border-bottom:1px solid #e4eaf2;background:#fbfcfe}.status-panel>header,.string-data>header{display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:43px;padding:9px 13px}.status-panel>header{border-bottom:1px solid #e9eef5;background:#f6f9fd}.status-panel h3{margin:0;color:#354862;font-size:13px;font-weight:500}.string-data h3{margin:0;color:#2f435f;font-size:16px;font-weight:600}.status-channels{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));padding:12px;background:#fff}.status-channels>div{min-width:0;padding:0 8px;border-right:1px solid #e8edf4}.status-channels>div:first-child{padding-left:0}.status-channels>div:last-child{padding-right:0;border-right:0}.status-channels span,.status-channels strong{display:block}.status-channels span{overflow:hidden;color:#758399;font-size:11px;line-height:1.25;text-overflow:ellipsis;white-space:nowrap}.status-channels strong{display:flex;align-items:center;gap:5px;margin-top:5px;color:#6d7889;font-size:12px;font-weight:500}.status-channels strong i{background:#a4aeba}.status-channels .live strong{color:#28744d}.status-meta{display:grid;grid-template-columns:1fr 1.15fr 1.35fr;align-items:center;min-height:38px;padding:0 12px;border-top:1px solid #edf1f5;color:#617086;background:#f8fafd;font-size:11px}.status-meta>span{overflow:hidden;padding-right:8px;text-overflow:ellipsis;white-space:nowrap}.meta-state{display:inline-flex!important;align-items:center;gap:5px;color:#4b5e77;font-weight:500}.status-note{display:flex;align-items:center;min-height:34px;padding:7px 12px;border-top:1px solid #e7efe9;overflow:hidden;color:#406b55;background:#f4faf6;font-size:11px;line-height:1.35;text-overflow:ellipsis;white-space:nowrap}.status-note.warning{border-color:#efdfb8;color:#806127;background:#fff9eb}
	.string-data{border-bottom:1px solid #e8edf4}.string-data>header{min-height:50px;padding:11px 14px;background:#fff}.string-data header span{color:#5f6f85;font-size:13px}.metric-grid span,.metric-grid strong{display:block}.metric-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1px;padding:1px;background:#e8edf4}.metric-grid>div{min-width:0;min-height:76px;padding:13px 14px;background:#fff}.metric-grid span{color:#596a81;font-size:14px;line-height:1.3}.metric-grid strong{margin-top:8px;color:#293e5a;font-size:17px;font-weight:500;font-variant-numeric:tabular-nums}.metric-grid .primary-metric{background:#f5f9ff}.metric-grid .primary-metric strong{color:#194caa;font-size:18px;font-weight:600}.detail-groups{display:grid;grid-template-columns:1fr;border-top:1px solid #dde5ef;background:#fff}.detail-groups>section{min-width:0}.detail-groups>section+section{border-top:1px solid #dde5ef}.detail-groups h4{display:flex;align-items:center;min-height:50px;margin:0;padding:11px 14px;border-bottom:1px solid #e8edf4;color:#2f435f;background:#fff;font-size:16px;font-weight:600}.detail-groups dl{display:grid;gap:1px;margin:0;padding:1px;background:#e8edf4}.detail-groups .config-group dl{grid-template-columns:repeat(4,minmax(0,1fr))}.detail-groups .extremes-group dl{grid-template-columns:repeat(3,minmax(0,1fr))}.detail-groups dl div{min-width:0;min-height:76px;padding:13px 14px;background:#fff}.detail-groups dt{overflow:hidden;color:#596a81;font-size:14px;line-height:1.3;text-overflow:ellipsis;white-space:nowrap}.detail-groups dd{margin:8px 0 0;overflow:hidden;color:#293e5a;font-size:17px;font-weight:500;font-variant-numeric:tabular-nums;text-overflow:ellipsis;white-space:nowrap}
	.cell-toolbar{display:flex;align-items:center;justify-content:space-between;gap:11px;padding:13px;border-bottom:1px solid #e8edf4}.tabs{display:flex;min-width:0;gap:7px}.tabs button{height:44px;padding:0 15px;border:0;border-radius:9px;color:#3e516c;background:#f3f6fa;font:inherit;font-size:15px;font-weight:500;cursor:pointer;white-space:nowrap}.tabs button:hover{background:#eaf0f8}.tabs button.active{color:#1648a4;background:#e4edff;box-shadow:inset 0 0 0 1px #c5d7f8}.legend{display:flex;gap:11px;color:#455872;font-size:13px;white-space:nowrap}.legend span{display:inline-flex;align-items:center;gap:6px}.cell-scroll{max-height:440px;padding:13px;overflow:auto;scrollbar-gutter:stable}.cell-columns{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;align-items:start}.cell-group{min-width:0;overflow:hidden;border:1px solid #d6dfeb;border-radius:10px}.cell-group h4{position:sticky;z-index:3;top:0;margin:0;padding:10px 11px;border-bottom:1px solid #d9e2ed;color:#344861;background:#f2f6fb;font-size:15px;font-weight:600}.cell-group table{width:100%;border-collapse:collapse;table-layout:fixed}.cell-group th,.cell-group td{width:33.333%;padding:9px 8px;text-align:right;font-variant-numeric:tabular-nums}.cell-group th{position:sticky;z-index:2;top:39px;border-bottom:1px solid #dce4ee;color:#40536d;background:#fafcff;font-size:14px;font-weight:600;line-height:1.3}.cell-group th:first-child,.cell-group td:first-child{text-align:left}.cell-group td{height:46px;border-bottom:1px solid #e3e9f1;color:#253a56;font-size:16px;line-height:1.35}.cell-group tbody tr:last-child td{border-bottom:0}.cell-group td:first-child{display:flex;align-items:center;gap:8px;color:#1e4e9d;font-weight:600}.cell-group tr.alarm td{color:#a63a32;background:#fff3f2}.cell-group tr.offline td{color:#58667a;background:#f4f6f8}.cell-empty{display:grid;min-height:260px;place-content:center;text-align:center}.cell-empty strong{color:#445570;font-size:15px;font-weight:500}.cell-empty span{margin-top:5px;color:#68778d;font-size:14px}.chart-block{border-top:1px solid #e7ecf3}.chart-block>header{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:11px 12px 0}.chart-block h3{margin:0;color:#40516b;font-size:14px;font-weight:500}.chart-block header span{color:#68778d;font-size:13px}.chart-empty{display:grid;height:210px;place-items:center;color:#68778d;font-size:14px}
	/* Keep table-cell semantics. Flex on a <td> creates a phantom blank column in Chromium. */
	.cell-group td:first-child{display:table-cell;gap:0}.cell-id{display:inline-flex;align-items:center;gap:8px}
	.string-head{min-height:76px;padding:15px 16px}.string-title{gap:11px}.string-icon{width:42px;height:42px;flex-basis:42px}.title-line h2{font-size:20px;font-weight:600}.title-line>span{padding:4px 9px;font-size:13px}.string-title p{margin-top:5px;color:#596b83;font-size:14px}.head-actions button{height:40px;padding:0 12px;font-size:14px}.overall-status{padding:7px 11px;font-size:13px;font-weight:500}.overall-status i,.meta-state i,.status-channels strong i,.legend i,.cell-group td:first-child i{width:8px;height:8px}
	.status-panel>header{min-height:50px;padding:10px 14px}.status-panel h3{color:#30455f;font-size:16px;font-weight:600}.status-channels{padding:14px}.status-channels>div{padding:0 9px}.status-channels span{color:#596b82;font-size:13px;line-height:1.3}.status-channels strong{gap:6px;margin-top:6px;color:#56667c;font-size:14px}.status-meta{min-height:46px;padding:0 14px;color:#52637a;font-size:13px}.meta-state{gap:6px;color:#40546f}.status-note{min-height:42px;padding:9px 14px;color:#35664d;font-size:13px;line-height:1.4}
	.chart-block>header{padding:13px 14px 0}.chart-block h3{color:#30455f;font-size:16px;font-weight:600}.chart-block header span{color:#596b82;font-size:13px}.chart-empty{height:230px;color:#596b82;font-size:14px}
	@container(max-width:620px){.status-channels{grid-template-columns:repeat(3,minmax(0,1fr));gap:12px 0}.status-channels>div:nth-child(3){border-right:0}.status-meta{grid-template-columns:1fr 1fr;gap:7px 10px;padding-top:8px;padding-bottom:8px}.status-meta>span:last-child{grid-column:1/-1}.detail-groups .config-group dl,.detail-groups .extremes-group dl{grid-template-columns:repeat(2,minmax(0,1fr))}.cell-toolbar{align-items:stretch;flex-direction:column}.tabs{display:grid;width:100%;grid-template-columns:repeat(3,minmax(0,1fr))}.tabs button{padding:0 7px}.legend{align-self:flex-end}.cell-columns{grid-template-columns:1fr}}
	@container(max-width:470px){.detail-groups .config-group dl,.detail-groups .extremes-group dl{grid-template-columns:1fr}.tabs{grid-template-columns:1fr}.tabs button{font-size:12px}.metric-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
	@media(max-width:680px){.string-head{align-items:flex-start;flex-direction:column}.head-actions{width:100%;justify-content:space-between}.cell-columns{grid-template-columns:1fr}.cell-scroll{max-height:340px}.legend{flex-wrap:wrap}}
</style>
