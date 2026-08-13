<script lang="ts">
	import { Activity, BatteryCharging, Cable, CheckCircle2, Cpu, Database, Gauge, HardDrive, Network, Radio, ShieldCheck } from '@lucide/svelte';
	import type { DeviceConfig } from '$lib/device-config';
	import { onMount } from 'svelte';
	import { getEdgeConfig, getRtsSystemStatus } from '$lib/services/rts-api';

	let { config }: { config: DeviceConfig | null } = $props();
	let product = $derived(config?.device.product ?? 'unified');
	let showBms = $derived(product === 'bms' || product === 'unified');
	let showRts = $derived(product === 'rts' || product === 'unified');
	let system = $derived(config?.systemInfo);
	let serialCount = $derived(config?.rts?.serialPortTemplates?.length ?? 0);
	let tcpCount = $derived(config?.connectivity.tcp ? config?.rts?.tcpBridgeTemplates?.length ?? 0 : 0);
	let live=$state({cpuUsage:null as number|null,ramUsage:null as number|null,diskUsage:null as number|null,firmware:null as string|null,ip:''});
	let liveSerialCount=$state<number|null>(null);let liveTcpCount=$state<number|null>(null);let online=$state(false);
	const StatIcon = Activity;
	onMount(()=>{if(showRts)void loadRtsInfo()});
	async function loadRtsInfo(){try{const[status,edge]=await Promise.all([getRtsSystemStatus(),getEdgeConfig()]);live={cpuUsage:status.cpuUsage,ramUsage:status.ramUsage,diskUsage:status.diskUsage,firmware:status.firmware,ip:status.network.eth1?.ip??status.network.eth0?.ip??''};liveSerialCount=Object.values(edge.components).filter((component)=>component.factoryId==='Bridge.Modbus.Serial').length;liveTcpCount=Object.values(edge.components).filter((component)=>component.factoryId==='Bridge.Modbus.Tcp').length;online=true;}catch{online=false;}}
</script>

<section class="system-info-page">
	<div class="page-title-row"><div><div class="title"><span class="title-icon"><StatIcon size={22} /></span><h2>System Info</h2></div><p>Device identity, platform health and available operating capabilities.</p></div><span class:offline={!online} class="online"><CheckCircle2 size={16} /> {online?'System online':'Runtime unavailable'}</span></div>

	<section class="section"><h3>Device & platform</h3><div class="card-grid common-grid">
		<article><Cpu size={20} /><span>Hardware</span><strong>{system?.hardwareModel ?? 'MAXiCom Edge Controller'}</strong><small>Serial {config?.rts?.systemInfo?.serialNumber ?? 'Not assigned'}</small></article>
		<article><Activity size={20} /><span>Software</span><strong>{system?.softwareVersion ?? 'MAXiCom Platform 1.0'}</strong><small>Firmware {live.firmware??system?.firmwareVersion ?? '—'}</small></article>
		<article><Gauge size={20} /><span>Uptime</span><strong>{system?.uptime ?? '—'}</strong><small>Updated by runtime service</small></article>
		<article><Network size={20} /><span>Network</span><strong>{live.ip || (system?.ipv4Address ?? 'Not connected')}</strong><small>{system?.macAddress ?? 'WAN 0 / WAN 1'}</small></article>
	</div></section>

	<section class="section"><h3>Platform health</h3><div class="health-grid"><article><Cpu size={20} /><div><span>CPU usage</span><strong>{live.cpuUsage!=null?`${live.cpuUsage}%`:system?.cpuUsage ?? '—'}</strong></div></article><article><Activity size={20} /><div><span>Memory usage</span><strong>{live.ramUsage!=null?`${live.ramUsage}%`:system?.memoryUsage ?? '—'}</strong></div></article><article><HardDrive size={20} /><div><span>Disk usage</span><strong>{live.diskUsage!=null?`${live.diskUsage}%`:system?.diskUsage ?? '—'}</strong></div></article></div></section>

	{#if config?.connectivity.serial || config?.connectivity.tcp}<section class="section"><h3>Connectivity</h3><div class="capability-grid"><article><Cable size={20} /><div><strong>{liveSerialCount??serialCount}</strong><span>Serial port{(liveSerialCount??serialCount) === 1 ? '' : 's'} configured</span></div></article>{#if config?.connectivity.tcp}<article><Network size={20} /><div><strong>{liveTcpCount??tcpCount}</strong><span>TCP bridge{(liveTcpCount??tcpCount) === 1 ? '' : 's'} configured</span></div></article>{/if}<article><ShieldCheck size={20} /><div><strong>VPN</strong><span>IPsec and OpenVPN</span></div></article></div></section>{/if}

	{#if showBms}<section class="section product-section bms"><div class="section-title"><div><h3>Battery monitoring</h3><p>BMS capabilities enabled for this device.</p></div><span>BMS</span></div><div class="capability-grid"><article><BatteryCharging size={20} /><div><strong>Battery Strings</strong><span>String and cell monitoring</span></div></article><article><Radio size={20} /><div><strong>Thermal monitoring</strong><span>Available when camera is configured</span></div></article><article><Activity size={20} /><div><strong>Battery testing</strong><span>Discharge calibration and test history</span></div></article></div></section>{/if}

	{#if showRts}<section class="section product-section rts"><div class="section-title"><div><h3>Energy management</h3><p>RTS capabilities enabled for this device.</p></div><span>RTS</span></div><div class="capability-grid"><article><Gauge size={20} /><div><strong>Inverters & meters</strong><span>Power measurement and control</span></div></article><article><Database size={20} /><div><strong>Data logging</strong><span>Smart Logger integration</span></div></article><article><BatteryCharging size={20} /><div><strong>ESS / Storage</strong><span>Energy storage interface</span></div></article></div></section>{/if}
</section>

<style>
	.system-info-page { animation:enter .18s ease-out; }.page-title-row { display:flex; align-items:flex-start; justify-content:space-between; gap:20px; margin-bottom:27px; }.title { display:flex; align-items:center; gap:11px; }.title-icon { display:grid; place-items:center; width:38px; height:38px; border-radius:10px; color:#2653ba; background:#eaf0ff; }.title h2 { margin:0; color:#172b4d; font-size:24px; font-weight:500; }.page-title-row p { margin:7px 0 0; color:#718096; font-size:16px; }.online { display:inline-flex; align-items:center; gap:7px; min-height:34px; padding:0 11px; border:1px solid #ccebd8; border-radius:18px; color:#28784e; background:#f0faf4; font-size:14px; }.section + .section { margin-top:28px; }.section > h3,.section-title h3 { margin:0; color:#33435e; font-size:16px; font-weight:500; }.card-grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:13px; margin-top:13px; }.card-grid article,.health-grid article,.capability-grid article { border:1px solid #e1e7f0; border-radius:11px; background:#fff; }.card-grid article { display:grid; gap:7px; min-height:140px; padding:17px; }.card-grid svg,.health-grid svg,.capability-grid svg { color:#4770c5; }.card-grid span,.health-grid span,.capability-grid span { color:#77849a; font-size:13px; }.card-grid strong { color:#2b3b55; font-size:16px; font-weight:500; }.card-grid small { color:#8a95a7; font-size:12px; }.health-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:13px; margin-top:13px; }.health-grid article { display:flex; align-items:center; gap:12px; min-height:76px; padding:14px 16px; }.health-grid div { display:grid; gap:4px; }.health-grid strong { color:#2f405d; font-size:18px; font-weight:500; }.capability-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:13px; margin-top:13px; }.capability-grid article { display:flex; align-items:flex-start; gap:12px; min-height:83px; padding:16px; }.capability-grid div { display:grid; gap:4px; }.capability-grid strong { color:#30415d; font-size:15px; font-weight:500; }.product-section { padding:18px; border-radius:13px; }.product-section.bms { background:#f4f8ff; }.product-section.rts { background:#f4fbf7; }.section-title { display:flex; align-items:start; justify-content:space-between; gap:12px; }.section-title p { margin:5px 0 0; color:#77849a; font-size:13px; }.section-title > span { min-height:25px; padding:4px 9px; border-radius:13px; color:#3860aa; background:#e5eeff; font-size:12px; }.rts .section-title > span { color:#27734a; background:#dff4e7; }@keyframes enter { from { opacity:0; transform:translateY(4px); } to { opacity:1; transform:translateY(0); } }@media (max-width:900px) { .card-grid { grid-template-columns:repeat(2,minmax(0,1fr)); }.capability-grid { grid-template-columns:1fr; }.page-title-row { flex-direction:column; }.online { align-self:flex-start; } }@media (max-width:620px) { .card-grid,.health-grid { grid-template-columns:1fr; }.page-title-row p { font-size:15px; } }
	.online.offline{border-color:#eadfc4;color:#85642f;background:#fff8ea}
</style>
