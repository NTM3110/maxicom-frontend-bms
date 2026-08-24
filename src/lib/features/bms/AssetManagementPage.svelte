<script lang="ts">
	import { onMount } from 'svelte';
	import { Check, ClipboardList, Save } from '@lucide/svelte';
	import Panel from './BmsPanel.svelte';
	import Field from './BmsField.svelte';
	import Read from './BmsReadField.svelte';
	import { hasBmsSession, listBmsStrings, type BatteryString } from '$lib/services/bms-api';

	type SystemInfo = {
		owner: string;
		operationalTeam: string;
		substation: string;
		coordinates: string;
		dcLevel: string;
		batteryBankId: string;
		technology: string;
		ratedVoltage: string;
		batchLotNumber: string;
		manufacturingDate: string;
		commissioningDate: string;
		installationDate: string;
		responsiblePerson: string;
		sensorMapping: string;
		sensorCalibrationStatus: string;
	};

	const STORAGE_KEY = 'maxicom-asset-management';
	let strings = $state<BatteryString[]>([]);
	let selectedIndex = $state(0);
	let notice = $state('');
	let error = $state('');
	let info = $state<SystemInfo>({
		owner: '', operationalTeam: '', substation: '', coordinates: '', dcLevel: '', batteryBankId: '',
		technology: '', ratedVoltage: '', batchLotNumber: '', manufacturingDate: '', commissioningDate: '',
		installationDate: '', responsiblePerson: '', sensorMapping: '', sensorCalibrationStatus: ''
	});
	let selected = $derived(strings.find((item) => item.stringIndex === Number(selectedIndex)) ?? strings[0] ?? null);

	onMount(async () => {
		try {
			const raw = localStorage.getItem(STORAGE_KEY);
			if (raw) info = { ...info, ...JSON.parse(raw) };
			if (hasBmsSession()) {
				strings = await listBmsStrings();
				selectedIndex = strings[0]?.stringIndex ?? 0;
			}
		} catch (cause) {
			error = cause instanceof Error ? cause.message : 'Failed to load system information.';
		}
	});

	function save() {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(info));
		notice = 'System information saved on this appliance.';
	}

	function displayNumber(value: unknown, digits = 2) {
		return Number.isFinite(Number(value)) ? Number(value).toFixed(digits) : 'N/A';
	}

	function currentLimit() {
		const capacity = Number(selected?.ratedCapacity);
		return Number.isFinite(capacity) ? `${displayNumber(capacity * 0.2)} A` : 'N/A';
	}
</script>

<section class="page">
	<div class="head">
		<div><h2><ClipboardList size={23}/>System Info</h2><p>System identity, battery configuration, installation and charging settings.</p></div>
		<button class="primary" onclick={save}><Save size={16}/>Save</button>
	</div>
	{#if notice}<div class="notice"><Check size={16}/>{notice}</div>{/if}
	{#if error}<div class="error">{error}</div>{/if}

	<section class="selector">
		<label>Battery string<select bind:value={selectedIndex}><option value={0}>No string selected</option>{#each strings as string}<option value={string.stringIndex}>{string.stringName}</option>{/each}</select></label>
		{#if !hasBmsSession()}<span>Preview mode · data will load after BMS authentication</span>{/if}
	</section>

	<div class="two">
		<Panel title="IDENTITY"><div class="grid"><Field label="Owner" bind:value={info.owner}/><Field label="Operational team" bind:value={info.operationalTeam}/><Field label="Substation" bind:value={info.substation}/><Field label="Coordinates" bind:value={info.coordinates}/><Field label="DC level" bind:value={info.dcLevel}/><Field label="Battery bank / string ID" bind:value={info.batteryBankId}/></div></Panel>
		<Panel title="TECHNICAL"><div class="grid"><Read label="Manufacturer" value={selected?.cellBrand || 'N/A'}/><Field label="Technology" bind:value={info.technology}/><Field label="Rated voltage" bind:value={info.ratedVoltage}/><Read label="Rated capacity" value={`${displayNumber(selected?.ratedCapacity)} Ah`}/><Read label="Cell / block count per string" value={selected?.cellQty ?? 'N/A'}/><Read label="Cell / block model" value={selected?.cellModel || 'N/A'}/></div></Panel>
	</div>

	<div class="two">
		<Panel title="MANUFACTURING"><div class="grid"><Field label="Batch / lot number" bind:value={info.batchLotNumber}/><Field label="Manufacturing date" type="date" bind:value={info.manufacturingDate}/><Field label="Commissioning date" type="date" bind:value={info.commissioningDate}/></div></Panel>
		<Panel title="INSTALLATION"><div class="grid"><Field label="Installation date" type="date" bind:value={info.installationDate}/><Field label="Responsible person" bind:value={info.responsiblePerson}/><Field label="Sensor mapping" bind:value={info.sensorMapping}/><Field label="Sensor calibration status" bind:value={info.sensorCalibrationStatus}/></div></Panel>
	</div>

	<div class="two"><Panel title="CHARGING"><div class="grid"><Read label="Float voltage" value={`${displayNumber(selected?.floatVoltage)} V`}/><Read label="Boost / equalize voltage" value={`${displayNumber(selected?.boostVoltage)} V`}/><Read label="Current limit (0.2C)" value={currentLimit()}/></div></Panel></div>
</section>

<style>
	.page{animation:in .18s ease}.head{display:flex;justify-content:space-between;gap:18px;margin-bottom:18px}.head h2{display:flex;align-items:center;gap:9px;margin:0;color:#172b4d;font-size:24px;font-weight:500}.head p{margin:7px 0 0;color:#718096;font-size:16px}.primary{display:inline-flex;align-items:center;gap:7px;height:39px;padding:0 14px;border:0;border-radius:8px;color:#fff;background:#1749ad;font:inherit;cursor:pointer}.selector{border:1px solid #e1e7f0;border-radius:11px;background:#fff}.selector{display:flex;align-items:end;justify-content:space-between;gap:15px;margin-bottom:15px;padding:14px 17px}.selector span{color:#8a95a7;font-size:12px}.two{display:grid;grid-template-columns:1fr 1fr;gap:15px;margin-bottom:15px}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:13px 14px}label{display:grid;gap:6px;color:#536078;font-size:13px}select{width:100%;height:39px;padding:0 11px;border:1px solid #d7dfeb;border-radius:7px;color:#273853;background:#fff;font:inherit;font-size:14px}.notice,.error{margin-bottom:13px;padding:10px 12px;border-radius:8px;font-size:13px}.notice{display:flex;align-items:center;gap:7px;color:#28784e;background:#f2fbf5;border:1px solid #cae7d5}.error{color:#b42318;background:#fff1f0;border:1px solid #f3cac6}@keyframes in{from{opacity:0;transform:translateY(4px)}}@media(max-width:950px){.two{grid-template-columns:1fr}}@media(max-width:650px){.head{flex-direction:column}.head .primary{justify-content:center}.grid{grid-template-columns:1fr}.selector{align-items:stretch;flex-direction:column}}
</style>
