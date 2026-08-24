<script lang="ts">
	import { onDestroy } from 'svelte';
	import * as echarts from 'echarts';

	type TrendPoint = { label: string; voltageV: number; usedAh: number };
	let { demo = false, cutoffPerCell = 1.8, progress = 100 }: { demo?: boolean; cutoffPerCell?: number; progress?: number } = $props();
	let chartElement: HTMLDivElement;
	let chart: echarts.ECharts | null = null;
	let observer: ResizeObserver | null = null;
	let demoPoints = $derived<TrendPoint[]>([
		{ label: '00:00', voltageV: 2.23, usedAh: 0 },
		{ label: '02:00', voltageV: 2.19, usedAh: 39.4 },
		{ label: '04:00', voltageV: 2.13, usedAh: 78.7 },
		{ label: '06:00', voltageV: 2.05, usedAh: 118.1 },
		{ label: '08:00', voltageV: 1.94, usedAh: 157.4 },
		{ label: '10:00', voltageV: cutoffPerCell, usedAh: 196.8 }
	]);
	let points = $derived<TrendPoint[]>(demo ? demoPoints.slice(0, Math.max(1, Math.ceil((Math.max(0, Math.min(100, progress)) / 100) * (demoPoints.length - 1)) + 1)) : []);

	function renderChart(values: TrendPoint[]) {
		if (!chartElement) return;
		if (!chart) {
			chart = echarts.init(chartElement, undefined, { renderer: 'canvas' });
			observer = new ResizeObserver(() => chart?.resize());
			observer.observe(chartElement);
		}
		chart.setOption({
			animationDuration: 350,
			grid: { left: 62, right: 84, top: 62, bottom: 48 },
			tooltip: { trigger: 'axis', backgroundColor: 'rgba(31,47,73,.94)', borderWidth: 0, textStyle: { color: '#fff', fontSize: 12 }, padding: [9, 11] },
			legend: { top: 14, left: 12, icon: 'circle', itemWidth: 8, itemHeight: 8, itemGap: 18, textStyle: { color: '#536178', fontSize: 11 } },
			xAxis: { type: 'category', boundaryGap: false, data: values.map((point) => point.label), name: 'Discharge elapsed time', nameLocation: 'middle', nameGap: 28, axisLine: { lineStyle: { color: '#d9e1ed' } }, axisTick: { show: false }, axisLabel: { color: '#718098', fontSize: 11 }, nameTextStyle: { color: '#718098', fontSize: 11 } },
			yAxis: [
				{ type: 'value', name: 'Average cell voltage (V)', min: Math.max(0, cutoffPerCell - .08), max: 2.3, nameLocation: 'end', nameGap: 14, nameTextStyle: { color: '#4770ad', fontSize: 10, align: 'left' }, axisLabel: { color: '#58729d', fontSize: 11 }, splitLine: { lineStyle: { color: '#e9edf3' } } },
				{ type: 'value', name: 'Discharged capacity (Ah)', min: 0, max: 200, nameLocation: 'end', nameGap: 14, nameTextStyle: { color: '#a66a22', fontSize: 10, align: 'right' }, axisLabel: { color: '#9a6d36', fontSize: 11 }, splitLine: { show: false } }
			],
			series: [
				{ name: 'Average cell voltage (V)', type: 'line', yAxisIndex: 0, smooth: .22, symbol: 'circle', symbolSize: 7, data: values.map((point) => point.voltageV), lineStyle: { color: '#2d69c7', width: 3 }, itemStyle: { color: '#2d69c7' }, areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: 'rgba(45,105,199,.22)' }, { offset: 1, color: 'rgba(45,105,199,.02)' }]) }, markLine: { symbol: 'none', silent: true, lineStyle: { color: '#c95b50', type: 'dashed' }, label: { formatter: `Cut-off ${cutoffPerCell.toFixed(2)} V`, color: '#b34d43', fontSize: 10 }, data: [{ yAxis: cutoffPerCell }] } },
				{ name: 'Discharged capacity (Ah)', type: 'line', yAxisIndex: 1, smooth: .14, symbol: 'circle', symbolSize: 6, data: values.map((point) => point.usedAh), lineStyle: { color: '#dc8b2b', width: 2, type: 'dashed' }, itemStyle: { color: '#dc8b2b' } }
			]
		}, { notMerge: true });
	}

	$effect(() => { renderChart(points); });
	onDestroy(() => { observer?.disconnect(); chart?.dispose(); });
</script>

	<section class="trend-chart">
	<header><div><h3>Discharge trend</h3><p>{demo ? progress < 100 ? 'Simulated samples are arriving while the discharge is running.' : 'Simulated discharge profile — voltage falls while discharged capacity rises.' : 'Waiting for BMS discharge samples.'}</p></div>{#if demo}<span>{progress < 100 ? 'RUNNING / DEMO' : 'DEMO DATA'}</span>{/if}</header>
	<div class="chart-wrap"><div bind:this={chartElement} class="chart" aria-label="Discharge voltage and capacity trend"></div>{#if !demo}<div class="empty"><strong>No samples yet</strong><span>The trend will appear once the BMS event returns samples.</span></div>{/if}</div>
</section>

<style>
	.trend-chart{margin-top:17px;overflow:hidden;border:1px solid #e1e8f1;border-radius:9px;background:#fff}.trend-chart header{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:13px 14px;border-bottom:1px solid #edf1f5}.trend-chart h3{margin:0;color:#40536f;font-size:14px}.trend-chart p{margin:4px 0 0;color:#8490a2;font-size:12px}.trend-chart header span{padding:4px 7px;border-radius:5px;color:#3164ab;background:#eef5ff;font-size:10px;font-weight:700}.chart-wrap{position:relative;height:285px}.chart{width:100%;height:100%}.empty{position:absolute;inset:65px 45px 52px;display:grid;place-content:center;border:1px dashed #d9e2ef;border-radius:8px;color:#7b879a;background:rgba(250,252,255,.93);text-align:center}.empty strong{color:#495a74;font-size:14px}.empty span{margin-top:5px;font-size:12px}@media(max-width:650px){.chart-wrap{height:255px}.trend-chart header{align-items:flex-start;flex-direction:column;gap:7px}}
</style>
