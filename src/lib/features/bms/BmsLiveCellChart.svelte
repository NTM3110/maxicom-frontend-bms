<script lang="ts">
	import { onDestroy } from 'svelte';
	import * as echarts from 'echarts';
	import type { BmsCellTelemetry } from '$lib/services/bms-api';

	type CellMode='voltage'|'temperature'|'soc';
	let { mode, cells, stringCurrent, cutoffVoltage }: { mode:CellMode; cells:BmsCellTelemetry[]; stringCurrent:number|null; cutoffVoltage:number }=$props();
	let chartElement:HTMLDivElement;
	let chart:echarts.ECharts|null=null;
	let observer:ResizeObserver|null=null;
	let definition=$derived.by(()=>{
		if(mode==='voltage')return{leftName:'Voltage (V)',rightName:'Resistance (µΩ)',left:cells.map(cell=>cell.voltage),right:cells.map(cell=>cell.resistance),leftColor:'#2f70cf',rightColor:'#dc8b2b'};
		if(mode==='temperature')return{leftName:'Temperature (°C)',rightName:'Power (W)',left:cells.map(cell=>cell.temperature),right:cells.map(cell=>cell.voltage===null||stringCurrent===null?null:cell.voltage*stringCurrent),leftColor:'#d35c52',rightColor:'#3289cb'};
		return{leftName:'SOC (%)',rightName:'SOH (%)',left:cells.map(cell=>cell.soc),right:cells.map(cell=>cell.soh),leftColor:'#20a1b2',rightColor:'#825bb1'};
	});

	function render(){
		if(!chartElement)return;
		if(!chart){chart=echarts.init(chartElement,undefined,{renderer:'canvas'});observer=new ResizeObserver(()=>chart?.resize());observer.observe(chartElement)}
		const current=definition;
		const interval=Math.max(0,Math.ceil(cells.length/10)-1);
		const voltages=cells.map(cell=>cell.voltage).filter((value):value is number=>value!==null);
		const configuredCutoff=mode==='voltage'&&cutoffVoltage>0?cutoffVoltage:undefined;
		const lowestVoltage=voltages.length?Math.min(...voltages):undefined;
		const highestVoltage=voltages.length?Math.max(...voltages):undefined;
		const voltageRange=configuredCutoff===undefined||lowestVoltage===undefined||highestVoltage===undefined?undefined:Math.max(configuredCutoff,highestVoltage)-Math.min(configuredCutoff,lowestVoltage);
		const voltagePadding=voltageRange===undefined?0:Math.max(voltageRange*.12,.01);
		const voltageMinimum=configuredCutoff===undefined?undefined:lowestVoltage!==undefined&&lowestVoltage<configuredCutoff?Math.floor((lowestVoltage-voltagePadding)*100)/100:configuredCutoff;
		const voltageMaximum=configuredCutoff===undefined?undefined:Math.ceil((Math.max(configuredCutoff,highestVoltage??configuredCutoff)+voltagePadding)*100)/100;
		chart.setOption({
			animationDuration:260,
			grid:{left:54,right:56,top:46,bottom:36},
			tooltip:{trigger:'axis',backgroundColor:'rgba(31,47,73,.94)',borderWidth:0,textStyle:{color:'#fff',fontSize:13},padding:[9,11]},
			legend:{top:8,right:8,icon:'circle',itemWidth:9,itemHeight:9,itemGap:15,textStyle:{color:'#455872',fontSize:13}},
			xAxis:{type:'category',data:cells.map(cell=>cell.id),axisTick:{show:false},axisLine:{lineStyle:{color:'#dce3ed'}},axisLabel:{color:'#52637a',fontSize:13,interval},boundaryGap:true},
			yAxis:[
				{type:'value',scale:true,min:voltageMinimum,max:voltageMaximum,axisLabel:{color:'#52637a',fontSize:13},splitLine:{lineStyle:{color:'#edf1f5'}},axisLine:{show:false}},
				{type:'value',scale:true,axisLabel:{color:'#735f43',fontSize:13},splitLine:{show:false},axisLine:{show:false}}
			],
			series:[
				{name:current.leftName,type:'bar',yAxisIndex:0,data:current.left,barMaxWidth:8,itemStyle:{color:current.leftColor,borderRadius:[2,2,0,0]},markLine:configuredCutoff===undefined?undefined:{silent:true,symbol:'none',lineStyle:{color:'#d45a4f',type:'dashed',width:1},label:{show:true,formatter:`Cut-off ${configuredCutoff.toFixed(2)} V`,position:'insideEndTop',distance:6,color:'#a83e37',fontSize:12,fontWeight:500,backgroundColor:'#fff',borderColor:'#e7b8b4',borderWidth:1,borderRadius:4,padding:[4,7],shadowColor:'rgba(45,57,78,.10)',shadowBlur:4},data:[{yAxis:configuredCutoff}]}},
				{name:current.rightName,type:'line',yAxisIndex:1,data:current.right,showSymbol:false,connectNulls:false,lineStyle:{color:current.rightColor,width:1.5},itemStyle:{color:current.rightColor}}
			]
		},{notMerge:true});
	}

	$effect(()=>{definition;cells;render()});
	onDestroy(()=>{observer?.disconnect();chart?.dispose()});
</script>

<div bind:this={chartElement} class="chart" aria-label="Live cell measurement chart"></div>

<style>.chart{width:100%;height:230px}</style>
