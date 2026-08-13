<script lang="ts">
	import { onDestroy } from 'svelte';
	import { Chart, registerables, type ChartConfiguration } from 'chart.js';
	import type { BmsCellTelemetry } from '$lib/services/bms-api';

	Chart.register(...registerables);
	type CellMode = 'voltage' | 'temperature' | 'soc';
	let { mode, cells }: { mode:CellMode; cells:BmsCellTelemetry[] } = $props();
	let canvas:HTMLCanvasElement;
	let instance:Chart|null=null;
	let instanceMode:CellMode|null=null;
	let hasValues=$derived.by(()=>cells.some(cell=>mode==='voltage'?cell.voltage!==null||cell.resistance!==null:mode==='temperature'?cell.temperature!==null||cell.ir!==null:cell.soc!==null||cell.soh!==null));
	let title=$derived(mode==='voltage'?'Voltage and Resistance':mode==='temperature'?'Temperature and IR':'State of Charge and Health');

	function definition(currentMode:CellMode,currentCells:BmsCellTelemetry[]):ChartConfiguration{
		const labels=currentCells.map(cell=>String(cell.id));
		const common={borderWidth:1,borderRadius:3,borderSkipped:false,barPercentage:.78,categoryPercentage:.82} as const;
		const datasets=currentMode==='voltage'?[{...common,label:'Voltage (V)',data:currentCells.map(cell=>cell.voltage),yAxisID:'y-left',borderColor:'#3b9a68',backgroundColor:'rgba(65,174,114,.72)',type:'bar' as const,order:2},{label:'Resistance (µΩ)',data:currentCells.map(cell=>cell.resistance),yAxisID:'y-right',borderColor:'#e9962e',backgroundColor:'rgba(233,150,46,.10)',pointBackgroundColor:'#e9962e',pointBorderWidth:0,pointRadius:1.6,pointHoverRadius:4,borderWidth:1.8,tension:.18,fill:true,type:'line' as const,order:1}]:currentMode==='temperature'?[{...common,label:'Temperature (°C)',data:currentCells.map(cell=>cell.temperature),yAxisID:'y-left',borderColor:'#d95b52',backgroundColor:'rgba(223,91,80,.72)',type:'bar' as const,order:2},{label:'IR (U)',data:currentCells.map(cell=>cell.ir),yAxisID:'y-right',borderColor:'#3289cb',backgroundColor:'rgba(50,137,203,.10)',pointBackgroundColor:'#3289cb',pointBorderWidth:0,pointRadius:1.6,pointHoverRadius:4,borderWidth:1.8,tension:.18,fill:true,type:'line' as const,order:1}]:[{...common,label:'SoC (%)',data:currentCells.map(cell=>cell.soc),yAxisID:'y-left',borderColor:'#26a6b6',backgroundColor:'rgba(38,166,182,.72)',type:'bar' as const,order:2},{label:'SoH (%)',data:currentCells.map(cell=>cell.soh),yAxisID:'y-right',borderColor:'#8c5fbb',backgroundColor:'rgba(140,95,187,.10)',pointBackgroundColor:'#8c5fbb',pointBorderWidth:0,pointRadius:1.6,pointHoverRadius:4,borderWidth:1.8,tension:.18,fill:true,type:'line' as const,order:1}];
		const leftTitle=currentMode==='voltage'?'Voltage (V)':currentMode==='temperature'?'Temperature (°C)':'SoC (%)';
		const rightTitle=currentMode==='voltage'?'Resistance (µΩ)':currentMode==='temperature'?'IR (U)':'SoH (%)';
		return{type:'bar',data:{labels,datasets},options:{responsive:true,maintainAspectRatio:false,animation:{duration:260},interaction:{mode:'index',intersect:false},plugins:{legend:{position:'top',align:'end',labels:{usePointStyle:true,pointStyle:'circle',boxWidth:7,boxHeight:7,padding:18,color:'#536178',font:{family:'Neue Haas Grotesk Text Pro, Helvetica Neue, Arial',size:12,weight:400}}},tooltip:{backgroundColor:'rgba(31,47,73,.94)',titleFont:{size:12,weight:500},bodyFont:{size:12},padding:10,cornerRadius:7,displayColors:true}},scales:{x:{title:{display:true,text:'Cell ID',color:'#748197',font:{size:12,weight:400}},grid:{display:false},border:{color:'#dfe5ee'},ticks:{color:'#7d899b',font:{size:11},maxTicksLimit:16,maxRotation:0}},'y-left':{type:'linear',position:'left',title:{display:true,text:leftTitle,color:'#68758b',font:{size:12,weight:400}},grid:{color:'rgba(223,229,238,.72)'},border:{display:false},ticks:{color:'#7d899b',font:{size:11},padding:7}},'y-right':{type:'linear',position:'right',title:{display:true,text:rightTitle,color:'#68758b',font:{size:12,weight:400}},grid:{drawOnChartArea:false},border:{display:false},ticks:{color:'#7d899b',font:{size:11},padding:7}}}}};
	}

	$effect(()=>{
		const currentMode=mode,currentCells=cells;
		if(!canvas)return;
		if(!instance||instanceMode!==currentMode){instance?.destroy();instance=new Chart(canvas,definition(currentMode,currentCells));instanceMode=currentMode;return}
		const next=definition(currentMode,currentCells);
		instance.data=next.data;
		instance.update();
	});
	onDestroy(()=>instance?.destroy());
</script>

<section class="chart-panel">
	<header><div><h3>{title}</h3><p>Cell-by-cell profile with independent measurement scales.</p></div><span>Live snapshot</span></header>
	<div class="chart-wrap"><canvas bind:this={canvas} aria-label={`${title} chart`}></canvas>{#if !hasValues}<div class="empty-chart"><strong>No chart data available</strong><span>Waiting for a complete BMS calculation snapshot.</span></div>{/if}</div>
</section>

<style>
	.chart-panel{overflow:hidden;border:1px solid #dfe6f0;border-radius:13px;background:#fff;box-shadow:0 7px 22px rgba(35,54,89,.045)}header{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:16px 18px;border-bottom:1px solid #e8edf4}h3{margin:0;color:#293b58;font-size:17px;font-weight:500}p{margin:5px 0 0;color:#7d899b;font-size:13px}header>span{padding:5px 9px;border-radius:13px;color:#46715b;background:#edf8f1;font-size:11px}.chart-wrap{position:relative;height:390px;padding:16px 17px 13px}.empty-chart{position:absolute;inset:68px 50px 56px;display:grid;place-content:center;border:1px dashed #dce4ef;border-radius:9px;color:#7b8799;background:rgba(250,252,255,.92);text-align:center}.empty-chart strong{color:#495a74;font-size:15px;font-weight:500}.empty-chart span{margin-top:6px;font-size:13px}@media(max-width:800px){.chart-wrap{height:330px;padding:12px}.empty-chart{inset:58px 28px 52px}}
</style>
