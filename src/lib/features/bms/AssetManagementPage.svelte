<script lang="ts">
	import { onMount } from 'svelte';
	import { Check, ClipboardList, Save } from '@lucide/svelte';
	import Panel from './BmsPanel.svelte';
	import Field from './BmsField.svelte';
	import Read from './BmsReadField.svelte';
	import { getBmsAssetSite, getBmsAssetString, getBmsStringTelemetry, hasBmsSession, listBmsAssetSohHistory, listBmsStrings, saveBmsAssetProfiles, type BatteryString, type BmsSohHistoryPoint, type BmsStringTelemetry } from '$lib/services/bms-api';
	import { emptyBmsDeviceProfile, emptyBmsSiteProfile, type BmsDeviceProfile, type BmsSiteProfile } from '$lib/services/bms-asset-profile';

	let strings = $state<BatteryString[]>([]);
	let selectedIndex = $state(0);
	let telemetry = $state<BmsStringTelemetry | null>(null);
	let history = $state<BmsSohHistoryPoint[]>([]);
	let site = $state<BmsSiteProfile>(emptyBmsSiteProfile());
	let device = $state<BmsDeviceProfile>(emptyBmsDeviceProfile());
	let loading = $state(true);
	let loadingDevice = $state(false);
	let saving = $state(false);
	let ready = $state(false);
	let deviceReady = $state(false);
	let waitingForSession = $state(false);
	let notice = $state('');
	let error = $state('');
	let selectionVersion = 0;
	let selected = $derived(strings.find(s => s.stringIndex === Number(selectedIndex)) ?? null);

	onMount(() => {
		void load();
		const retry = setInterval(() => { if (waitingForSession && !loading && hasBmsSession()) void load(); }, 3000);
		return () => { clearInterval(retry); selectionVersion++; };
	});

	async function load() {
		loading = true;
		ready = false;
		error = '';
		try {
			if (!hasBmsSession()) { waitingForSession = true; throw new Error('Sign in to the BMS platform to load Asset Management.'); }
			waitingForSession = false;
			const [siteResult, availableStrings] = await Promise.all([getBmsAssetSite(), listBmsStrings()]);
			site = { ...emptyBmsSiteProfile(), ...(siteResult.profile ?? {}) };
			strings = availableStrings;
			selectedIndex = availableStrings[0]?.stringIndex ?? 0;
			await loadDevice();
			ready = !selectedIndex || deviceReady;
		} catch (cause) {
			error = cause instanceof Error ? cause.message : 'Unable to load Asset Management from the BMS database.';
		} finally {
			loading = false;
		}
	}

	async function loadDevice() {
		const version = ++selectionVersion;
		const index = Number(selectedIndex);
		deviceReady = false;
		device = emptyBmsDeviceProfile();
		history = [];
		telemetry = null;
		notice = '';
		error = '';
		if (!index) { deviceReady = true; return; }
		loadingDevice = true;
		try {
			const [asset, points, live] = await Promise.all([
				getBmsAssetString(index),
				listBmsAssetSohHistory(index),
				getBmsStringTelemetry(index).catch(() => null)
			]);
			if (version !== selectionVersion) return;
			device = { ...emptyBmsDeviceProfile(), ...(asset.profile ?? {}) };
			history = points;
			telemetry = live;
			deviceReady = true;
		} catch (cause) {
			if (version !== selectionVersion) return;
			error = cause instanceof Error ? cause.message : 'Unable to load this string profile from the BMS database.';
		} finally {
			if (version === selectionVersion) loadingDevice = false;
		}
	}

	async function save() {
		if (saving || loading || loadingDevice || !ready || !deviceReady) return;
		saving = true;
		notice = '';
		error = '';
		const index = Number(selectedIndex);
		let committed = false;
		try {
			await saveBmsAssetProfiles({ ...site }, index || undefined, index ? { ...device } : undefined);
			committed = true;
			const [savedSite, savedDevice, savedHistory] = await Promise.all([
				getBmsAssetSite(),
				index ? getBmsAssetString(index) : Promise.resolve(null),
				index ? listBmsAssetSohHistory(index) : Promise.resolve([])
			]);
			site = { ...emptyBmsSiteProfile(), ...(savedSite.profile ?? {}) };
			if (index === Number(selectedIndex)) {
				device = { ...emptyBmsDeviceProfile(), ...(savedDevice?.profile ?? {}) };
				history = savedHistory;
			}
			notice = index ? 'Site and device information saved to the BMS database.' : 'Site information saved to the BMS database.';
		} catch (cause) {
			error = committed ? 'Saved to the BMS database, but the page could not reload the saved values. Reload the page to retry.' : cause instanceof Error ? cause.message : 'Unable to save Asset Management to the BMS database.';
		} finally {
			saving = false;
		}
	}
	const fmt = (value: unknown, digits = 2) => value !== null && value !== undefined && Number.isFinite(Number(value)) ? Number(value).toFixed(digits) : 'N/A';
</script>
<section class="page"><div class="head"><div><h2><ClipboardList size={23}/>Asset Management</h2><p>Ownership, installation, technical configuration and battery test history.</p></div><button class="primary" onclick={save} disabled={saving || loading || loadingDevice || !ready || !deviceReady || !hasBmsSession()}><Save size={16}/>{saving ? 'Saving…' : 'Save'}</button></div>{#if loading}<div class="notice">Loading saved Asset Management data…</div>{/if}{#if loadingDevice}<div class="notice">Loading selected string profile…</div>{/if}{#if notice}<div class="notice"><Check size={16}/>{notice}</div>{/if}{#if error}<div class="error">{error}</div>{/if}
	<div class="wide shared"><Panel title="Site information — shared by all devices"><div class="grid shared-grid"><Field label="Owner" bind:value={site.owner}/><Field label="Operational team" bind:value={site.operationalTeam}/><Field label="Substation" bind:value={site.substation}/><Field label="Geographic coordinates" bind:value={site.coordinates}/><Field label="MAXiCom serial number" bind:value={site.maxicomSerial}/></div></Panel></div>
	<section class="device-records"><div><strong>Battery string records</strong><span>Select a string to edit only its device-specific information.</span></div><label>Battery string<select bind:value={selectedIndex} disabled={saving || loading} onchange={() => void loadDevice()}><option value={0}>No string selected</option>{#each strings as s}<option value={s.stringIndex}>str{s.stringIndex} — {s.stringName}</option>{/each}</select></label>{#if !hasBmsSession()}<span>Sign in to load saved profiles</span>{/if}</section>
	<div class="two"><Panel title="Battery identity"><div class="grid"><Field label="DC level" bind:value={device.dcLevel}/><Field label="Battery bank / string ID" bind:value={device.batteryBankId}/></div></Panel><Panel title="Technical"><div class="grid"><Field label="Manufacturer" bind:value={device.manufacturer}/><label>Technologies<select bind:value={device.technology}><option value="">Select technology</option><option>AGM</option><option>GEL</option></select></label><Field label="Rated voltage" bind:value={device.normalVoltage}/><Read label="Capacity (Ah)" value={`${fmt(selected?.ratedCapacity)} Ah`}/><Read label="Cell / block count per string" value={selected?.cellQty??'N/A'}/></div></Panel></div>
	<div class="two"><Panel title="Manufacturing"><div class="grid"><Field label="Batch / lot number" bind:value={device.batchLotNumber}/><Field label="Manufacturing date" type="date" bind:value={device.manufacturingDate}/><Field label="Commissioning date" type="date" bind:value={device.commissioningDate}/></div></Panel><Panel title="Installation"><div class="grid"><Field label="Installation date" type="date" bind:value={device.installationDate}/><Field label="Responsible person" bind:value={device.responsiblePerson}/><Field label="Sensor mapping" bind:value={device.sensorMapping}/><label>Sensor calibration status<select bind:value={device.sensorCalibrationStatus}><option value="">Select status</option><option>Calibrated</option><option>Due for calibration</option><option>Not calibrated</option></select></label></div></Panel></div>
	<div class="wide"><Panel title="Charging"><div class="grid eval"><Read label="Float voltage" value={`${fmt(selected?.floatVoltage)} V`}/><Read label="Boost / equalize voltage" value={`${fmt(selected?.boostVoltage)} V`}/><Field label="Current limit (A)" type="number" bind:value={device.currentLimit}/></div></Panel></div>
	<div class="wide"><Panel title="Testing &amp; Health"><div class="grid health"><Field label="Voc" bind:value={device.testOcv}/><Field label="Float voltage" bind:value={device.testFloatVoltage}/><Field label="Internal resistance" bind:value={device.testIr}/><Field label="Temperature (negative terminal)" bind:value={device.testNegativeTerminalTemp}/><Read label="SOC" value={telemetry?.summary.stringSoC==null?'N/A':`${fmt(telemetry.summary.stringSoC,1)} %`}/><Read label="SOH" value={telemetry?.summary.stringSoH==null?'N/A':`${fmt(telemetry.summary.stringSoH,1)} %`}/><Field label="SOH warning limit (%)" type="number" bind:value={device.sohWarningThreshold}/><Field label="SOH replacement limit (%)" type="number" bind:value={device.sohReplaceThreshold}/><Field label="Planned replacement date" type="date" bind:value={device.replacementDate}/></div></Panel></div>
	<div class="wide"><Panel title="Completed calibration SoH history">{#if !selected}<p class="history-empty">Select a string to view calibration results.</p>{:else if history.length}<div class="history-list"><table><thead><tr><th>Completed at</th><th>SoH</th><th>Source</th></tr></thead><tbody>{#each history as point}<tr><td>{new Date(point.measuredAt).toLocaleString()}</td><td>{fmt(point.soh, 1)} %</td><td>{point.source}</td></tr>{/each}</tbody></table></div>{:else}<p class="history-empty">No completed calibration SoH results for this string.</p>{/if}</Panel></div>
</section>
<style>
	.page{animation:in .18s ease}.head{display:flex;justify-content:space-between;gap:18px;margin-bottom:18px}.head h2{display:flex;align-items:center;gap:9px;margin:0;color:#172b4d;font-size:24px;font-weight:500}.head p{margin:7px 0 0;color:#718096;font-size:16px}.primary{display:inline-flex;align-items:center;gap:7px;height:39px;padding:0 14px;border:0;border-radius:8px;color:#fff;background:#1749ad;font:inherit;cursor:pointer}.device-records{display:flex;align-items:end;justify-content:space-between;gap:18px;margin-bottom:15px;padding:14px 17px;border:1px solid #e1e7f0;border-radius:11px;background:#fff}.device-records>div{display:grid;gap:5px}.device-records>div strong{color:#30425e;font-size:15px;font-weight:600}.device-records>div span,.device-records>span{color:#7b8799;font-size:12px}.device-records label{min-width:260px}.two{display:grid;grid-template-columns:1fr 1fr;gap:15px;margin-bottom:15px}.wide{margin-bottom:15px}.shared-grid{grid-template-columns:repeat(5,minmax(0,1fr))!important}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:13px 14px}.grid.eval,.grid.health{grid-template-columns:repeat(3,minmax(0,1fr))}label{display:grid;gap:6px;color:#536078;font-size:13px}input,select{width:100%;height:39px;padding:0 11px;border:1px solid #d7dfeb;border-radius:7px;color:#273853;background:#fff;font:inherit;font-size:14px}input:disabled{color:#718096;background:#f5f7fa}.history-empty{margin:0;color:#718096;font-size:13px}.history-list{overflow-x:auto}.history-list table{width:100%;border-collapse:collapse;color:#40516c;font-size:13px;text-align:left}.history-list th,.history-list td{padding:9px 11px;border-bottom:1px solid #e7ecf3}.primary:disabled{opacity:.55;cursor:not-allowed}.notice,.error{margin-bottom:13px;padding:10px 12px;border-radius:8px;font-size:13px}.notice{display:flex;align-items:center;gap:7px;color:#28784e;background:#f2fbf5;border:1px solid #cae7d5}.error{color:#b42318;background:#fff1f0;border:1px solid #f3cac6}@keyframes in{from{opacity:0;transform:translateY(4px)}}@media(max-width:1200px){.shared-grid{grid-template-columns:repeat(3,minmax(0,1fr))!important}}@media(max-width:950px){.two{grid-template-columns:1fr}.grid.eval,.grid.health,.shared-grid{grid-template-columns:1fr 1fr!important}}@media(max-width:650px){.head{flex-direction:column}.head .primary{justify-content:center}.grid,.grid.eval,.grid.health,.shared-grid{grid-template-columns:1fr!important}.device-records{align-items:stretch;flex-direction:column}.device-records label{min-width:0}}
</style>
