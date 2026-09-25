<script lang="ts">
	import type { BmsAlarmOccurrence, BmsCellTelemetry } from '$lib/services/bms-api';

	type CellMode = 'voltage' | 'temperature' | 'soc';
	let { mode, cells, alarmOccurrences, expectedCount, stringCurrent }: { mode:CellMode; cells:BmsCellTelemetry[]; alarmOccurrences:BmsAlarmOccurrence[]|null; expectedCount:number; stringCurrent:number|null } = $props();

	let groups = $derived.by(() => {
		const ordered=[...cells].sort((a,b)=>a.id-b.id);
		const split=Math.ceil(ordered.length/2);
		return [ordered.slice(0,split),ordered.slice(split)];
	});
	let heading = $derived(mode === 'voltage' ? 'Voltage / Resistance' : mode === 'temperature' ? 'Temperature / Power' : 'SoC / SoH');

	function value(input:number|null|undefined,digits=2){return input===null||input===undefined?'N/A':input.toFixed(digits)}
	function power(cell:BmsCellTelemetry){return cell.voltage===null||stringCurrent===null?null:cell.voltage*stringCurrent}
	function alarmReasons(cell:BmsCellTelemetry){
		return (alarmOccurrences??[]).filter(alarm=>alarm.conditionActive&&alarm.cellIndex===cell.id).map(alarm=>alarm.alarm);
	}
	function alarmLabel(reasons:string[]){
		if(reasons.includes('CELL_RESISTANCE'))return'IR';
		if(reasons.includes('CELL_TEMPERATURE'))return'T';
		if(reasons.includes('LOW_CELL_VOLTAGE')||reasons.includes('HIGH_CELL_VOLTAGE'))return'V';
		return'Alarm';
	}
</script>

<section class="cell-panel">
	<header>
		<div><h3>Cell Data · {heading}</h3><p>{cells.length} of {expectedCount} configured cells returned by the BMS.</p></div>
		<div class="legend" aria-label="Cell status legend"><span><i class="normal"></i>Normal</span><span><i class="warning"></i>Communication warning</span><span><i class="alarm"></i>Persisted alarm</span></div>
	</header>

	{#if cells.length}
		<div class="cell-scroll">
			<div class="cell-grid">
				{#each groups as group,groupIndex}
					<div class="cell-card">
						<table aria-label={`Cell data group ${groupIndex+1}`}>
							<thead><tr><th>Cell ID</th>{#if mode==='voltage'}<th>Voltage (V)</th><th>Resistance (µΩ)</th>{:else if mode==='temperature'}<th>Temperature (°C)</th><th>Power (W)</th>{:else}<th>SoC (%)</th><th>SoH (%)</th>{/if}</tr></thead>
							<tbody>
								{#each group as cell (cell.id)}
									{@const alarms=alarmReasons(cell)}
									<tr class:cell-alarm={alarms.length>0} class:cell-warning={!!cell.availabilityWarning} class:cell-unknown={alarmOccurrences===null&&!cell.availabilityWarning} title={cell.availabilityWarning??(alarmOccurrences===null?'Alarm status unavailable':alarms.join(', ')||'Normal')}>
										<td class="cell-id"><span class="cell-number">{cell.id}</span><span class="cell-flags">{#if cell.availabilityWarning}<span class="warning-badge">TA</span>{/if}{#if alarms.length}<span class="alarm-led"></span><span class="alarm-label">{alarmLabel(alarms)}</span>{/if}</span></td>
										{#if mode==='voltage'}<td>{value(cell.voltage,3)}</td><td>{value(cell.resistance,1)}</td>{:else if mode==='temperature'}<td>{value(cell.temperature,1)}</td><td>{value(power(cell),2)}</td>{:else}<td>{value(cell.soc,3)}</td><td>{value(cell.soh,3)}</td>{/if}
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{/each}
			</div>
		</div>
	{:else}
		<div class="empty"><span></span><strong>No cell telemetry returned</strong><p>Cell measurements will appear when the BMS publishes a complete snapshot.</p></div>
	{/if}
</section>

<style>
	.cell-panel{overflow:hidden;border:1px solid #dfe6f0;border-radius:13px;background:#fff;box-shadow:0 7px 22px rgba(35,54,89,.045)}header{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:16px 18px;border-bottom:1px solid #e8edf4}h3{margin:0;color:#293b58;font-size:17px;font-weight:500}header p{margin:5px 0 0;color:#7d899b;font-size:13px}.legend{display:flex;align-items:center;gap:14px;color:#6e7b90;font-size:12px;white-space:nowrap}.legend span{display:inline-flex;align-items:center;gap:6px}.legend i{width:8px;height:8px;border-radius:50%}.legend .normal{background:#43aa70}.legend .warning{background:#e9a12d}.legend .alarm{background:#dc3f38;box-shadow:0 0 0 3px rgba(220,63,56,.12);animation:alarmBlink 1s ease-in-out infinite}.cell-scroll{max-height:480px;padding:15px;overflow:auto;scrollbar-gutter:stable}.cell-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:13px;align-items:start}.cell-card{overflow:hidden;border:1px solid #e0e6ef;border-radius:9px;background:#fff;box-shadow:0 1px 3px rgba(30,49,80,.045)}table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{width:33.333%;padding:9px 7px;text-align:center;vertical-align:middle}th{position:sticky;z-index:2;top:-15px;border-bottom:1px solid #dfe6ef;color:#65738a;background:#f5f7fb;font-size:11px;font-weight:500;line-height:1.25;text-transform:uppercase}td{height:43px;border-top:1px solid #edf1f6;color:#40506a;font-size:14px;font-weight:400;font-variant-numeric:tabular-nums}tbody tr:first-child td{border-top:0}.cell-id{color:#2450a5;text-align:left}.cell-number{font-weight:500}.cell-flags{display:inline-flex;align-items:center;margin-left:5px}.warning-badge{display:inline-flex;align-items:center;justify-content:center;min-width:22px;height:17px;padding:0 4px;border-radius:4px;color:#78500d;background:#f7b83e;font-size:9px;font-weight:600}.alarm-led{width:9px;height:9px;margin-left:3px;border-radius:50%;background:#d93630;box-shadow:0 0 0 3px rgba(217,54,48,.16);animation:alarmBlink 1s ease-in-out infinite}.alarm-label{margin-left:5px;color:#b52d28;font-size:10px;font-weight:600}.cell-warning td{color:#765718;background:rgba(255,247,220,.84)}.cell-warning .cell-id{color:#87631d}.cell-alarm td{color:#ad2d28;background:rgba(255,232,230,.82);animation:alarmRowBlink 1s ease-in-out infinite}.cell-alarm .cell-id{color:#ad2d28}.empty{display:grid;min-height:230px;padding:30px;place-content:center;text-align:center}.empty>span{width:34px;height:34px;margin:0 auto 12px;border-radius:50%;background:#eef3fb;box-shadow:inset 0 0 0 9px #f7f9fc}.empty strong{color:#40506a;font-size:15px;font-weight:500}.empty p{margin:6px 0 0;color:#8591a2;font-size:13px}@keyframes alarmBlink{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.2;transform:scale(.82)}}@keyframes alarmRowBlink{0%,100%{background:rgba(255,230,228,.9)}50%{background:rgba(255,244,243,.72)}}@media(prefers-reduced-motion:reduce){.legend .alarm,.alarm-led,.cell-alarm td{animation:none}}@media(max-width:760px){header{align-items:flex-start;flex-direction:column}.legend{flex-wrap:wrap}.cell-grid{grid-template-columns:1fr}.cell-scroll{max-height:520px;padding:12px}th{top:-12px}}
	.cell-unknown td{color:#806127;background:#fffdf5}
</style>
