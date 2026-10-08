<script lang="ts">
	import { AlertTriangle, CheckCircle2, Clock3, RefreshCw, Save, Server, XCircle } from '@lucide/svelte';
	import { onMount } from 'svelte';
	import { configureBmsTime, getBmsTimeStatus, hasBmsSession, type BmsTimeStatus } from '$lib/services/bms-api';

	let status = $state<BmsTimeStatus | null>(null);
	let serverIp = $state('');
	let loading = $state(true);
	let refreshing = $state(false);
	let configuring = $state(false);
	let error = $state('');
	let notice = $state('');

	const statusLabel = $derived(status?.serverReachable === false ? 'Server unreachable' : status?.serverReachable === true && status?.synchronized === true ? 'Synchronized' : status?.serverReachable === true ? 'Synchronizing' : 'NTP status unknown');
	const StatusIcon = $derived(status?.serverReachable === true && status?.synchronized === true ? CheckCircle2 : status?.serverReachable === false ? XCircle : AlertTriangle);

	onMount(() => void loadStatus(true));

	function message(cause: unknown) {
		return cause instanceof Error && cause.message ? cause.message : 'The NTP request failed.';
	}

	function booleanLabel(value: boolean | null | undefined) {
		return value === true ? 'Yes' : value === false ? 'No' : 'Unknown';
	}

	function display(value: string | null | undefined) {
		return value ?? 'Not available';
	}

	async function loadStatus(initial = false) {
		error = '';
		notice = '';
		if (!hasBmsSession()) {
			status = null;
			error = 'No active BMS session. Sign in or reconnect to OpenEMS, then retry.';
			loading = false;
			return;
		}
		if (initial) loading = true;
		else refreshing = true;
		try {
			status = await getBmsTimeStatus();
			if (status.configuredServer) serverIp = status.configuredServer;
		} catch (cause) {
			status = null;
			error = message(cause);
		} finally {
			loading = false;
			refreshing = false;
		}
	}

	async function configure() {
		if (configuring || refreshing) return;
		const value = serverIp.trim();
		error = '';
		notice = '';
		if (!value) {
			error = 'Enter one IPv4 or IPv6 address.';
			return;
		}
		if (!hasBmsSession()) {
			error = 'No active BMS session. Sign in or reconnect to OpenEMS, then retry.';
			return;
		}
		configuring = true;
		try {
			await configureBmsTime(value);
			status = await getBmsTimeStatus();
			serverIp = status.configuredServer ?? value;
			notice = 'NTP server configuration saved. Synchronization may take a few moments.';
		} catch (cause) {
			error = message(cause);
		} finally {
			configuring = false;
		}
	}
</script>

<section class="page">
	<div class="page-head">
		<div>
			<div class="title"><span class="title-icon"><Clock3 size={22} aria-hidden="true" /></span><h2>NTP Server</h2></div>
			<p>Connect the appliance clock to a trusted IPv4 or IPv6 NTP server.</p>
		</div>
		{#if status}
			<span class:good={status.serverReachable === true && status.synchronized === true} class:bad={status.serverReachable === false} class="overall-status"><StatusIcon size={16} aria-hidden="true" />{statusLabel}</span>
		{/if}
	</div>

	{#if notice}<div class="notice" role="status"><CheckCircle2 size={17} aria-hidden="true" />{notice}</div>{/if}
	{#if error}<div class="error" role="alert"><AlertTriangle size={17} aria-hidden="true" /><span>{error}</span><button type="button" disabled={loading || refreshing || configuring} onclick={() => loadStatus(false)}>Retry</button></div>{/if}

	{#if loading}
		<section class="loading" aria-live="polite"><RefreshCw class="spin" size={22} aria-hidden="true" /><span>Loading NTP status…</span></section>
	{:else}
		<section class="status-section" aria-label="NTP status">
			<div class="section-heading"><div><h3>Synchronization status</h3><p>Live values reported by the appliance.</p></div><button class="secondary" type="button" disabled={refreshing || configuring} onclick={() => loadStatus(false)}><RefreshCw class={refreshing ? 'spin' : ''} size={16} aria-hidden="true" />{refreshing ? 'Refreshing…' : 'Refresh status'}</button></div>
			<div class="status-grid">
				<article><span>Current appliance time</span><strong>{display(status?.currentTime)}</strong><small>Authoritative device timestamp with UTC offset</small></article>
				<article><span>Configured server</span><strong>{display(status?.configuredServer)}</strong><small>Persisted NTP address</small></article>
				<article><span>Active server</span><strong>{display(status?.serverName)}</strong><small>{status?.serverAddress ?? 'Address not available'}</small></article>
				<article><span>NTP server reachable</span><strong class:positive={status?.serverReachable === true} class:negative={status?.serverReachable === false}>{booleanLabel(status?.serverReachable)}</strong><small>{status?.reachabilityError ?? 'Validated current UDP/123 response'}</small></article>
				<article><span>Clock synchronizing status</span><strong class:positive={status?.serverReachable === true && status?.synchronized === true} class:negative={status?.serverReachable === false}>{statusLabel}</strong><small>Current reachability combined with the OS clock state</small></article>
				<article><span>Timezone</span><strong>{display(status?.timezone)}</strong><small>Appliance timezone</small></article>
				<article><span>NTP packet count</span><strong>{status?.packetCount ?? 'Not available'}</strong><small>systemd-timesyncd diagnostic counter</small></article>
				<article><span>Poll interval</span><strong>{display(status?.pollInterval)}</strong><small>Current systemd-timesyncd retry interval</small></article>
			</div>
			{#if status?.error}<div class="runtime-warning" role="alert"><AlertTriangle size={17} aria-hidden="true" /><div><strong>Runtime warning</strong><span>{status.error}</span></div></div>{/if}
		</section>

		<section class="panel">
			<div class="panel-head"><span><Server size={20} aria-hidden="true" /></span><div><h3>Configure NTP server</h3><p>The backend validates the address and reloads the system time service.</p></div></div>
			<form onsubmit={(event) => { event.preventDefault(); void configure(); }}>
				<label for="ntp-server-ip">NTP server IP address</label>
				<div class="form-row"><input id="ntp-server-ip" name="serverIp" bind:value={serverIp} disabled={configuring} autocomplete="off" spellcheck="false" placeholder="192.168.4.81" aria-describedby="ntp-server-help" /><button class="primary" type="submit" disabled={configuring || refreshing}><Save size={16} aria-hidden="true" />{configuring ? 'Saving…' : 'Save configuration'}</button></div>
				<small id="ntp-server-help">Enter exactly one IPv4 or IPv6 literal. Hostnames and multiple servers are rejected.</small>
			</form>
		</section>
	{/if}
</section>

<style>
	.page{animation:enter .18s ease-out}.page-head{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;margin-bottom:22px}.title{display:flex;align-items:center;gap:11px}.title-icon{display:grid;place-items:center;width:38px;height:38px;border-radius:10px;color:#2653ba;background:#eaf0ff}.title h2{margin:0;color:#172b4d;font-size:24px;font-weight:500}.page-head p{margin:7px 0 0;color:#718096;font-size:16px}.overall-status{display:inline-flex;align-items:center;gap:7px;min-height:34px;padding:0 11px;border:1px solid #eadfc4;border-radius:18px;color:#85642f;background:#fff8ea;font-size:14px}.overall-status.good{border-color:#ccebd8;color:#28784e;background:#f0faf4}.overall-status.bad{border-color:#f0cbc7;color:#b42318;background:#fff2f0}.notice,.error{display:flex;align-items:center;gap:8px;margin-bottom:14px;padding:11px 13px;border-radius:8px;font-size:13px}.notice{color:#28784e;border:1px solid #cae7d5;background:#f2fbf5}.error{color:#b42318;border:1px solid #f3cac6;background:#fff1f0}.error span{flex:1}.error button{padding:5px 9px;border:1px solid #e7b7b2;border-radius:6px;color:#a32920;background:#fff;cursor:pointer}.loading{display:flex;min-height:190px;align-items:center;justify-content:center;gap:10px;border:1px solid #e1e7f0;border-radius:11px;color:#66758d;background:#fff}.status-section,.panel{border:1px solid #e1e7f0;border-radius:11px;background:#fff}.status-section{padding:18px}.section-heading{display:flex;align-items:center;justify-content:space-between;gap:14px}.section-heading h3,.panel-head h3{margin:0;color:#31415c;font-size:16px;font-weight:500}.section-heading p,.panel-head p{margin:5px 0 0;color:#8792a4;font-size:13px}.status-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:13px;margin-top:16px}.status-grid article{display:grid;gap:6px;min-width:0;padding:15px;border:1px solid #e5eaf2;border-radius:9px;background:#fbfcff}.status-grid span{color:#77849a;font-size:13px}.status-grid strong{overflow-wrap:anywhere;color:#2b3b55;font-size:15px;font-weight:500}.status-grid strong.positive{color:#24764d}.status-grid strong.negative{color:#b42318}.status-grid small{color:#8a95a7;font-size:12px}.runtime-warning{display:flex;align-items:flex-start;gap:9px;margin-top:14px;padding:11px 12px;border:1px solid #eadfc4;border-radius:8px;color:#85642f;background:#fff8ea}.runtime-warning div{display:grid;gap:3px}.runtime-warning strong{font-size:13px}.runtime-warning span{font-size:13px;overflow-wrap:anywhere}.panel{margin-top:18px;overflow:hidden}.panel-head{display:flex;align-items:center;gap:11px;padding:17px 19px;border-bottom:1px solid #edf0f4}.panel-head>span{display:grid;place-items:center;width:36px;height:36px;border-radius:9px;color:#2653ba;background:#eaf0ff}.panel form{padding:18px 19px}.panel label{display:block;margin-bottom:7px;color:#536078;font-size:13px}.form-row{display:flex;gap:10px}.form-row input{min-width:0;flex:1;height:40px;padding:0 11px;border:1px solid #d7dfeb;border-radius:7px;color:#273853;background:#fff;font:inherit;font-size:14px}.panel form>small{display:block;margin-top:7px;color:#8a95a7;font-size:12px}.primary,.secondary{display:inline-flex;align-items:center;justify-content:center;gap:7px;min-height:38px;padding:0 14px;border-radius:8px;font:inherit;cursor:pointer}.primary{border:0;color:#fff;background:#1749ad}.secondary{border:1px solid #d7dfeb;color:#40516f;background:#fff}button:disabled,input:disabled{opacity:.58;cursor:not-allowed}:global(.spin){animation:spin .8s linear infinite}@keyframes enter{from{opacity:0;transform:translateY(4px)}}@keyframes spin{to{transform:rotate(360deg)}}@media(max-width:950px){.status-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:650px){.page-head,.section-heading{flex-direction:column}.overall-status,.section-heading .secondary{align-self:flex-start}.status-grid{grid-template-columns:1fr}.form-row{flex-direction:column}.form-row button{width:100%}.page-head p{font-size:15px}}
</style>
