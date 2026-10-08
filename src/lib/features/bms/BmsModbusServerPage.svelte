<script lang="ts">
	import { Server } from '@lucide/svelte';
	import BmsModbusServerPanel from '$lib/features/connectivity/BmsModbusServerPanel.svelte';
</script>

<section class="page">
	<div class="head"><span><Server size={21}/></span><div><h2>Modbus Server</h2><p>Expose BMS string monitoring registers to a TCP or Serial RTU client.</p></div></div>
	<BmsModbusServerPanel />
</section>

<style>
	.page{animation:enter .18s ease-out}.head{display:flex;align-items:center;gap:11px;margin-bottom:18px}.head>span{display:grid;place-items:center;width:38px;height:38px;border-radius:10px;color:#2653ba;background:#eaf0ff}.head h2{margin:0;color:#172b4d;font-size:24px;font-weight:500}.head p{margin:6px 0 0;color:#718096;font-size:15px}@keyframes enter{from{opacity:0;transform:translateY(4px)}}
</style>
