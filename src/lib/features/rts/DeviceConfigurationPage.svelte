<script lang="ts">
	import { Box, Check, Database, Gauge, LoaderCircle, Pencil, Plus, RefreshCw, Trash2, X } from '@lucide/svelte';
	import FlatSelect from '$lib/components/FlatSelect.svelte';
	import type { DeviceConfig } from '$lib/device-config';
	import {
		createComponentConfigRpc, createInverter, deleteComponentConfig, deleteFelixComponent, getEdgeConfig,
		getFelixPids, updateComponentProperties, updateController, updateFelixComponent,
		type RtsComponent, type RtsEdgeConfig
	} from '$lib/services/rts-api';

	export type DeviceKind = 'inverters' | 'meters' | 'data-loggers' | 'ess' | 'wika';
	type Brand = { name: string; factoryId: string };
	type Tier = { label?: string; maxInverters: number; maxTotalPowerKW: number };
	type Device = {
		componentId: string; pid?: string; factoryId: string; alias: string; brandName: string; properties: Record<string, any>;
	};
	type Form = {
		alias: string; brand: string; maxActivePower: number; ip: string; pvInverterId: string; serialPort: string;
		modbusUnitId: number; inverterModel: string; enableMeter1: boolean; enableMeter2: boolean; enableMeter3: boolean;
		invert_meter: boolean; invert: boolean; Modbus_target: string; type: string; meterId: string; enabled: boolean;
		inverterAddresses: string; baseAddress: number; registerGap: number; maxActivePowerWatts: number;
		meterEnabled: boolean; meterUnitId: number;
	};

	let { kind, config }: { kind: DeviceKind; config: DeviceConfig | null } = $props();
	const wikaBrands: Brand[] = [
		{ name: 'Reader AMS01', factoryId: 'wika.ams01' }, { name: 'GD-20', factoryId: 'wika.sf6.gd20' },
		{ name: 'GDHT-20', factoryId: 'wika.sf6.GDHT20' }
	];
	const meta = {
		inverters: { title: 'Inverters', singular: 'inverter', empty: 'No inverters configured', description: 'Configure inverter communication, rated power and metering relationship.', icon: Gauge, prefix: 'pvInverter' },
		meters: { title: 'Meters', singular: 'meter', empty: 'No meters configured', description: 'Configure POI, grid and production meters.', icon: Gauge, prefix: 'meter' },
		'data-loggers': { title: 'Data Loggers', singular: 'data logger', empty: 'No data loggers configured', description: 'Configure Smart Logger communication and inverter address mapping.', icon: Database, prefix: 'SmartLogger' },
		ess: { title: 'ESS / Storage', singular: 'storage device', empty: 'No storage devices configured', description: 'Configure energy storage communication.', icon: Box, prefix: 'battery' },
		wika: { title: 'Wika', singular: 'Wika device', empty: 'No Wika devices configured', description: 'Configure Wika SF6 monitoring communication.', icon: Gauge, prefix: 'wika' }
	};

	let page = $derived(meta[kind]);
	let devices = $state<Device[]>([]);
	let edge = $state<RtsEdgeConfig>({ components: {}, raw: null });
	let pids = $state<any[]>([]);
	let loading = $state(false);
	let saving = $state(false);
	let apiError = $state('');
	let notice = $state('');
	let formOpen = $state(false);
	let editing = $state<Device | null>(null);
	let error = $state('');
	let selectedPoiId = $state('');
	let form = $state<Form>(blank());

	let brands = $derived.by((): Brand[] => {
		const rts = config?.rts as any;
		if (kind === 'inverters') return rts?.inverterSetup?.inverterBrands ?? [];
		if (kind === 'meters') return rts?.meterSetup?.meterBrands ?? [];
		if (kind === 'wika') return wikaBrands;
		if (kind === 'ess') return rts?.storageSetup?.storageBrands ?? [];
		return rts?.smartLoggerSetup?.smartLoggerBrands ?? [];
	});
	let selectableBrands = $derived(kind === 'meters'
		? brands.filter((brand) => !['Solar Edge (Inverter)', 'Huawei Meter (Smart Logger)'].includes(brand.name))
		: brands);
	let brandOptions = $derived(selectableBrands.map((brand) => ({ value: brand.factoryId, label: brand.name })));
	let meterTypes = $derived(((config?.rts as any)?.meterSetup?.meterTypes ?? []).map((type: any) => ({ value: type.value, label: type.display })));
	let ports = $derived.by(() => Object.entries(edge.components)
		.filter(([, component]) => component.factoryId === 'Bridge.Modbus.Serial' || component.factoryId === 'Bridge.Modbus.Tcp')
		.map(([id, component]) => ({ value: id, label: portLabel(id, component) })));
	let callApi = $derived((kind === 'inverters' && form.brand === 'PvInverter.CallApi') || (kind === 'meters' && form.brand === 'Meter.OneController'));
	let simpleLogger = $derived(kind === 'data-loggers' && ['Smart.Logger.Foxess', 'Smart.Logger.Sungrow'].includes(form.brand));

	$effect(() => {
		kind; config;
		if (typeof window !== 'undefined') void load();
	});

	function blank(): Form {
		return { alias: '', brand: '', maxActivePower: 0, ip: '', pvInverterId: '', serialPort: '', modbusUnitId: 1,
			inverterModel: 'DEFAULT', enableMeter1: false, enableMeter2: false, enableMeter3: false, invert_meter: false,
			invert: false, Modbus_target: '', type: 'GRID', meterId: '', enabled: true, inverterAddresses: '1', baseAddress: 51000,
			registerGap: 25, maxActivePowerWatts: 100000, meterEnabled: true, meterUnitId: 1 };
	}

	function componentsFromResponse() { return edge.components; }
	function portLabel(id: string, component: RtsComponent) {
		const templates = [...((config?.rts as any)?.serialPortTemplates ?? []), ...((config?.rts as any)?.tcpBridgeTemplates ?? [])];
		return templates.find((item: any) => item.key === id)?.displayName ?? String(component.properties?.alias ?? id);
	}
	function pidFor(componentId: string, component: RtsComponent) {
		const alias = String(component.properties?.alias ?? componentId);
		return pids.find((pid) => pid.fpid === component.factoryId && (pid.nameHint?.includes(`[${componentId}]`) || pid.nameHint?.includes(`[${alias}]`)))?.id;
	}
	function relevant(component: RtsComponent) { return brands.some((brand) => brand.factoryId === component.factoryId); }
	function readOnlyMeter(device: Device) {
		return kind === 'meters' && ['Meter.SolarEdge.Modbus', 'SolarEdge.Grid-Meter', 'smartlogger.meter.huawei'].includes(device.factoryId);
	}

	async function load() {
		loading = true; apiError = ''; notice = '';
		try {
			const [edgeConfig, felix] = await Promise.all([getEdgeConfig(), getFelixPids()]);
			edge = edgeConfig; pids = felix;
			devices = Object.entries(componentsFromResponse()).filter(([, component]) => relevant(component)).map(([componentId, component]) => ({
				componentId, pid: pidFor(componentId, component), factoryId: component.factoryId ?? '',
				alias: String(component.properties?.alias || componentId), brandName: brands.find((brand) => brand.factoryId === component.factoryId)?.name ?? component.factoryId ?? '-',
				properties: component.properties ?? {}
			})).sort((a, b) => a.componentId.localeCompare(b.componentId, undefined, { numeric: true }));
			if (kind === 'meters') selectedPoiId = String(componentsFromResponse().ctrlEvnModbus0?.properties?.['meter.id'] ?? selectedPoiId);
		} catch (cause) {
			devices = []; edge = { components: {}, raw: null };
			apiError = cause instanceof Error ? cause.message : 'Could not connect to the RTS controller.';
		} finally { loading = false; }
	}

	function nextId() { let index = 0; while (devices.some((device) => device.componentId === `${page.prefix}${index}`)) index++; return `${page.prefix}${index}`; }
	function tier(): Tier {
		const setup = (config?.rts as any)?.inverterSetup;
		return setup?.tiers?.[setup.currentTier] ?? { maxInverters: 20, maxTotalPowerKW: 1000 };
	}
	function openAdd() {
		editing = null; form = { ...blank(), brand: selectableBrands[0]?.factoryId ?? '', serialPort: ports[0]?.value ?? '' };
		error = ''; notice = ''; formOpen = true;
	}
	function openEdit(device: Device) {
		const p = device.properties;
		editing = device; form = { ...blank(), alias: device.alias, brand: device.factoryId,
			maxActivePower: Math.round(Number(p.maxActivePower ?? 0) / 10) / 100, ip: String(p.ip ?? ''), pvInverterId: String(p.pvInverterId ?? ''),
			serialPort: String(p['modbus.id'] ?? p.modbus_id ?? ''), modbusUnitId: Number(p.modbusUnitId ?? 1), inverterModel: String(p.inverterModel ?? 'DEFAULT'),
			enableMeter1: p.enableMeter1 === true || p.enableMeter1 === 'true', enableMeter2: p.enableMeter2 === true || p.enableMeter2 === 'true',
			enableMeter3: p.enableMeter3 === true || p.enableMeter3 === 'true', invert_meter: p.invert_meter === true || p.invert_meter === 'true',
			invert: p.invert === true || p.invert === 'true', Modbus_target: String(p.Modbus_target ?? ''), type: String(p.type ?? 'GRID'), meterId: String(p.meterId ?? ''),
			enabled: p.enabled !== false && p.enabled !== 'false', inverterAddresses: String(p.inverterAddresses ?? '1'), baseAddress: Number(p.baseAddress ?? 51000),
			registerGap: Number(p.registerGap ?? 25), maxActivePowerWatts: Number(p.maxActivePowerWatts ?? 100000), meterEnabled: p.meterEnabled !== false && p.meterEnabled !== 'false', meterUnitId: Number(p.meterUnitId ?? 1) };
		error = ''; notice = ''; formOpen = true;
	}

	function validate() {
		if (!form.alias.trim()) return 'Enter a device alias.';
		if (!form.brand) return 'Select a brand.';
		if (!callApi && !form.serialPort) return 'Select a Serial or TCP connection.';
		if (!callApi && (form.modbusUnitId < 1 || form.modbusUnitId > 247)) return 'Modbus unit ID must be between 1 and 247.';
		if (callApi && !form.ip.trim()) return 'Enter the device IP address.';
		if (kind === 'inverters' && !callApi && form.maxActivePower <= 0) return 'Rated active power must be greater than 0 kW.';
		if (kind === 'inverters') {
			const limits=tier(); const oldPower=editing?Number(editing.properties.maxActivePower??0)/1000:0;
			if (!editing && devices.length>=limits.maxInverters) return `Maximum inverter limit of ${limits.maxInverters} has been reached.`;
			const total=devices.reduce((sum,item)=>sum+Number(item.properties.maxActivePower??0)/1000,0)-oldPower+form.maxActivePower;
			if (!callApi && total>limits.maxTotalPowerKW) return `Total inverter capacity cannot exceed ${limits.maxTotalPowerKW} kWp.`;
		}
		return '';
	}

	function common(id: string) { return { apply: 'true', factoryPid: form.brand, id, alias: form.alias.trim(), enabled: 'true' }; }
	function inverterPayload(id: string) {
		const payload: Record<string, unknown> = common(id); const names = ['id', 'alias', 'enabled'];
		if (callApi) Object.assign(payload, { ip: form.ip, pvInverterId: form.pvInverterId, invert: form.invert }), names.push('ip', 'pvInverterId', 'invert');
		else Object.assign(payload, { maxActivePower: Math.round(form.maxActivePower * 1000), 'modbus.id': form.serialPort, modbusUnitId: form.modbusUnitId,
			inverterModel: form.inverterModel, enableMeter1: form.enableMeter1, enableMeter2: form.enableMeter2, enableMeter3: form.enableMeter3,
			invert_meter: form.invert_meter, Modbus_target: form.Modbus_target }), names.push('maxActivePower', 'modbus.id', 'modbusUnitId', 'inverterModel', 'enableMeter1', 'enableMeter2', 'enableMeter3', 'invert_meter', 'Modbus_target');
		payload.propertylist = names.join(','); return payload;
	}
	function meterPayload(id: string) {
		const payload: Record<string, unknown> = common(id); const names = ['id', 'alias', 'enabled'];
		if (kind !== 'wika') Object.assign(payload, { type: form.type, invert: form.invert }), names.push('type', 'invert');
		if (callApi) Object.assign(payload, { ip: form.ip, meterId: form.meterId }), names.push('ip', 'meterId');
		else Object.assign(payload, { 'modbus.id': form.serialPort, modbusUnitId: form.modbusUnitId }), names.push('modbus.id', 'modbusUnitId');
		payload.propertylist = names.join(','); return payload;
	}
	function storagePayload(id: string) { return { ...common(id), 'modbus.id': form.serialPort, modbusUnitId: form.modbusUnitId, propertylist: 'id,alias,enabled,modbus.id,modbusUnitId' }; }
	function loggerProperties(id?: string) {
		const result = [{ name: 'alias', value: form.alias.trim() }, { name: 'enabled', value: form.enabled }, { name: 'modbus_id', value: form.serialPort }, { name: 'modbusUnitId', value: form.modbusUnitId }];
		if (!simpleLogger) result.push({ name: 'inverterAddresses', value: form.inverterAddresses }, { name: 'baseAddress', value: form.baseAddress }, { name: 'registerGap', value: form.registerGap }, { name: 'maxActivePowerWatts', value: form.maxActivePowerWatts }, { name: 'meterEnabled', value: form.meterEnabled }, { name: 'meterUnitId', value: form.meterUnitId }, { name: 'invert_meter', value: form.invert_meter });
		if (id) result.push({ name: 'id', value: id }); return result;
	}

	async function updatePpcInverters() {
		const current = await getEdgeConfig(); const controllerEntry = Object.entries(current.components).find(([, component]) => component.factoryId === 'Controller.PvInverter.FixPowerLimit');
		if (!controllerEntry) return;
		const [componentId, controller] = controllerEntry; const alias = String(controller.properties?.alias ?? componentId);
		const servicePid = (await getFelixPids()).find((pid) => pid.nameHint?.includes(`[${alias}]`))?.id; if (!servicePid) return;
		const inverterIds = Object.keys(current.components).filter((id) => id.startsWith('pvInverter'));
		await updateController(servicePid, { apply: 'true', alias, enabled: controller.properties?.enabled, powerLimit: controller.properties?.powerLimit, 'pvInverter.id': inverterIds, propertylist: 'alias,enabled,powerLimit,pvInverter.id' });
	}

	async function save() {
		error = validate(); if (error) return; saving = true;
		try {
			const id = editing?.componentId ?? nextId();
			if (kind === 'data-loggers') {
				if (editing) await updateComponentProperties(id, loggerProperties()); else await createComponentConfigRpc(form.brand, loggerProperties(id));
			} else {
				const payload = kind === 'inverters' ? inverterPayload(id) : (kind === 'ess' ? storagePayload(id) : meterPayload(id));
				if (editing) {
					if (!editing.pid) throw new Error(`Could not find Felix PID for ${editing.componentId}.`);
					if (kind === 'inverters' && editing.factoryId !== form.brand) { await deleteFelixComponent(editing.pid); await createInverter(form.brand, payload); }
					else await updateFelixComponent(editing.pid, payload);
				} else await createInverter(form.brand, payload);
			}
			if (kind === 'inverters') await updatePpcInverters();
			formOpen = false; notice = `${page.title} configuration saved successfully.`; await load();
		} catch (cause) { error = cause instanceof Error ? cause.message : 'Could not save the RTS configuration.'; }
		finally { saving = false; }
	}

	async function remove(device: Device) {
		if (!confirm(`Delete ${device.alias}? This action cannot be undone.`)) return;
		try {
			if (kind === 'data-loggers') await deleteComponentConfig(device.componentId);
			else { if (!device.pid) throw new Error(`Could not find Felix PID for ${device.componentId}.`); await deleteFelixComponent(device.pid); }
			if (kind === 'inverters') await updatePpcInverters(); notice = `${device.alias} deleted.`; await load();
		} catch (cause) { apiError = cause instanceof Error ? cause.message : 'Could not delete the RTS component.'; }
	}

	async function savePoi() {
		if (!selectedPoiId) return; saving = true;
		try {
			const targets = ['ctrlEvnModbus0', 'ctrlPvInverterFixPowerLimit0', 'ctrlPvInverterLimitReactivePower0'].filter((id) => edge.components[id]);
			await Promise.all(targets.map((id) => updateComponentProperties(id, [{ name: 'meter.id', value: selectedPoiId }])));
			notice = targets.length ? `POI meter updated on ${targets.length} controllers.` : 'No target controller is currently configured.';
		} catch (cause) { apiError = cause instanceof Error ? cause.message : 'Could not update the POI meter.'; }
		finally { saving = false; }
	}

	function connection(device: Device) { return String(device.properties.ip ?? device.properties['modbus.id'] ?? device.properties.modbus_id ?? 'Not assigned'); }
	function details(device: Device) {
		const p = device.properties;
		if (kind === 'inverters') return device.factoryId === 'PvInverter.CallApi' ? `ID ${p.pvInverterId || '-'}` : `${Number(p.maxActivePower ?? 0) / 1000} kW · Unit ${p.modbusUnitId ?? '-'}`;
		if (kind === 'meters') return `${p.type ?? 'GRID'} · Unit ${p.modbusUnitId ?? '-'}`;
		if (kind === 'data-loggers') return `${p.inverterAddresses ?? '-'} · Unit ${p.modbusUnitId ?? '-'}`;
		return `Unit ${p.modbusUnitId ?? '-'}`;
	}
</script>

<section class="device-page">
	<div class="page-title-row"><div><div class="title"><span class="title-icon"><page.icon size={22} /></span><h2>{page.title}</h2></div><p>{page.description}</p></div><div class="head-actions"><button class:loading class="icon-button" type="button" aria-label="Refresh" onclick={load} disabled={loading}><RefreshCw size={17}/></button><button class="primary-button" type="button" onclick={openAdd}><Plus size={18}/> Add {page.singular}</button></div></div>
	{#if apiError}<div class="message warning"><strong>RTS controller is unavailable</strong><span>{apiError}</span></div>{/if}
	{#if notice}<div class="message success"><Check size={16}/><span>{notice}</span></div>{/if}
	{#if kind === 'inverters'}<div class="limits"><span>{devices.length} / {tier().maxInverters} inverters</span><span>{devices.reduce((sum, item) => sum + Number(item.properties.maxActivePower ?? 0) / 1000, 0).toFixed(2)} / {tier().maxTotalPowerKW} kWp</span><small>{tier().label ?? 'RTS'} tier</small></div>{/if}
	{#if kind === 'meters' && devices.length}<div class="poi-bar"><div><strong>Point of interconnection meter</strong><span>Applied to EVN, active power and reactive power controllers.</span></div><FlatSelect bind:value={selectedPoiId} options={devices.map((device) => ({ value: device.componentId, label: `${device.alias} (${device.componentId})` }))} placeholder="Select POI meter"/><button type="button" onclick={savePoi} disabled={saving}>Save POI</button></div>{/if}
	<div class="table-scroll"><table><thead><tr><th>#</th><th>Alias</th><th>Brand</th><th>Connection</th><th>Configuration</th><th aria-label="Actions"></th></tr></thead><tbody>
		{#if devices.length === 0}<tr><td class="empty" colspan="6"><page.icon size={28}/><strong>{page.empty}</strong><span>Add the first device to begin configuration.</span><button type="button" onclick={openAdd}>Add {page.singular}</button></td></tr>
		{:else}{#each devices as device, index (device.componentId)}<tr><td><span class="index">{index + 1}</span></td><td><strong>{device.alias}</strong><small>{device.componentId}</small></td><td>{device.brandName}</td><td><span class:unassigned={connection(device)==='Not assigned'} class="connection"><i></i>{connection(device)}</span></td><td class="detail">{details(device)}</td><td class="actions"><button type="button" aria-label={`Edit ${device.alias}`} title={readOnlyMeter(device) ? 'This meter is managed by its parent device' : 'Edit device'} disabled={readOnlyMeter(device)} onclick={() => openEdit(device)}><Pencil size={17}/></button><button class="delete" type="button" aria-label={`Delete ${device.alias}`} onclick={() => remove(device)}><Trash2 size={17}/></button></td></tr>{/each}{/if}
	</tbody></table></div>
</section>

{#if formOpen}<div class="backdrop" role="presentation" onclick={() => formOpen=false}><dialog open class="dialog" onclick={(event)=>event.stopPropagation()}><header><div><h2>{editing ? `Edit ${page.singular}` : `Add ${page.singular}`}</h2><p>RTS fields and payload names match the existing Angular application.</p></div><button type="button" onclick={()=>formOpen=false} aria-label="Close"><X size={20}/></button></header><form onsubmit={(event)=>{event.preventDefault();void save();}}><div class="form-body">
	<section><h3>Device details</h3><div class="form-grid"><label>Alias<input bind:value={form.alias} placeholder="e.g. Device 1"/></label>{#if editing && kind !== 'inverters'}<label>Brand<input value={editing.brandName} disabled/></label>{:else}<label>Brand<FlatSelect bind:value={form.brand} options={brandOptions} placeholder="Select a brand" ariaLabel="Device brand"/></label>{/if}
	{#if kind === 'inverters' && !callApi}<label>Max active power (kW)<input type="number" min="0" step="0.01" bind:value={form.maxActivePower}/></label><label>Inverter model<input bind:value={form.inverterModel}/></label>{/if}
	{#if kind === 'meters'}<label>Meter type<FlatSelect bind:value={form.type} options={meterTypes}/></label>{/if}
	{#if kind === 'data-loggers'}<label class="check"><input type="checkbox" bind:checked={form.enabled}/> Enabled</label>{/if}</div></section>
	<section><h3>{callApi ? 'CallApi connection' : 'Modbus connection'}</h3><div class="form-grid">{#if callApi}<label>IP address<input bind:value={form.ip} placeholder="192.168.1.10"/></label>{#if kind === 'inverters'}<label>PV inverter ID<input bind:value={form.pvInverterId}/></label>{:else}<label>Meter ID<input bind:value={form.meterId}/></label>{/if}{:else}<label>Serial / TCP bridge<FlatSelect bind:value={form.serialPort} options={ports} placeholder="Select a connection"/></label><label>Modbus unit ID<input type="number" min="1" max="247" bind:value={form.modbusUnitId}/></label>{/if}</div></section>
	{#if kind === 'inverters'}<section><h3>Inverter options</h3><div class="checks">{#if callApi}<label><input type="checkbox" bind:checked={form.invert}/> Invert values</label>{:else}<label><input type="checkbox" bind:checked={form.enableMeter1}/> Enable meter 1</label><label><input type="checkbox" bind:checked={form.enableMeter2}/> Enable meter 2</label><label><input type="checkbox" bind:checked={form.enableMeter3}/> Enable meter 3</label><label><input type="checkbox" bind:checked={form.invert_meter}/> Invert meter values</label>{/if}</div>{#if !callApi}<label class="modbus-target">Modbus target<input bind:value={form.Modbus_target} placeholder="Optional target"/></label>{/if}</section>{/if}
	{#if kind === 'meters'}<section><h3>Meter options</h3><label class="check"><input type="checkbox" bind:checked={form.invert}/> Invert meter values</label></section>{/if}
	{#if kind === 'data-loggers' && !simpleLogger}<section><h3>Smart Logger registers</h3><div class="form-grid"><label>Inverter addresses<input bind:value={form.inverterAddresses}/></label><label>Base address<input type="number" bind:value={form.baseAddress}/></label><label>Register gap<input type="number" bind:value={form.registerGap}/></label><label>Max active power (W)<input type="number" bind:value={form.maxActivePowerWatts}/></label><label>Meter unit ID<input type="number" min="1" bind:value={form.meterUnitId}/></label></div><div class="checks"><label><input type="checkbox" bind:checked={form.meterEnabled}/> Enable meter</label><label><input type="checkbox" bind:checked={form.invert_meter}/> Invert meter values</label></div></section>{/if}
	{#if error}<p class="error">{error}</p>{/if}</div><footer><button class="secondary-button" type="button" onclick={()=>formOpen=false}>Cancel</button><button class="primary-button" type="submit" disabled={saving}>{#if saving}<LoaderCircle class="spin" size={16}/>{:else}<Check size={16}/>{/if} Save {page.singular}</button></footer></form></dialog></div>{/if}

<style>
	.device-page{animation:enter .18s ease-out}.page-title-row{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;margin-bottom:22px}.title{display:flex;align-items:center;gap:11px}.title h2{margin:0;color:#172b4d;font-size:24px;font-weight:500}.title-icon{display:grid;place-items:center;width:38px;height:38px;border-radius:10px;color:#2653ba;background:#eaf0ff}.page-title-row p{margin:7px 0 0;color:#718096;font-size:16px}.head-actions{display:flex;gap:8px}.primary-button,.secondary-button,.icon-button{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:38px;padding:0 14px;border:1px solid transparent;border-radius:8px;cursor:pointer;font:inherit;font-size:14px;font-weight:400}.primary-button{color:#fff;background:#1749ad}.primary-button:disabled{opacity:.55}.secondary-button,.icon-button{border-color:#d9e0eb;color:#40516f;background:#fff}.icon-button{width:38px;padding:0}.message{display:flex;align-items:center;gap:8px;margin:-8px 0 14px;padding:10px 13px;border-radius:8px;font-size:13px}.message strong{font-weight:500}.message.warning{align-items:flex-start;flex-direction:column;gap:3px;color:#7a5727;background:#fff8e9;border:1px solid #f0dfb9}.message.success{color:#23734a;background:#eefaf3;border:1px solid #cae8d6}.limits{display:flex;align-items:center;gap:17px;margin-bottom:13px;color:#526179;font-size:13px}.limits small{margin-left:auto;color:#7b879a}.poi-bar{display:grid;grid-template-columns:minmax(260px,1fr) 260px auto;align-items:center;gap:14px;margin-bottom:14px;padding:13px 15px;border:1px solid #dde5f0;border-radius:10px;background:#fff}.poi-bar strong,.poi-bar span{display:block}.poi-bar strong{color:#31415c;font-weight:500}.poi-bar span{margin-top:4px;color:#7f8b9e;font-size:13px}.poi-bar button{height:38px;padding:0 13px;border:0;border-radius:7px;color:#fff;background:#1749ad;font:inherit;cursor:pointer}.table-scroll{overflow-x:auto;border-top:1px solid #e5ebf3;border-bottom:1px solid #e5ebf3;background:#fff}table{width:100%;min-width:790px;border-collapse:collapse}th{padding:13px 18px;color:#79869a;background:#f8faff;border-bottom:1px solid #e7edf5;font-size:12px;font-weight:500;letter-spacing:.035em;text-align:left;text-transform:uppercase}td{padding:15px 18px;border-bottom:1px solid #edf1f6;color:#526179;font-size:15px}td strong,td small{display:block}td strong{color:#34445e;font-weight:500}td small{margin-top:3px;color:#8a95a7;font-size:12px}tbody tr:last-child td{border-bottom:0}.index{display:grid;place-items:center;width:27px;height:27px;border-radius:8px;color:#4e67a0;background:#f0f4fc;font-size:13px}.connection{display:inline-flex;align-items:center;gap:7px;padding:6px 9px;border-radius:14px;color:#3a7757;background:#ecf8f0;font-size:13px}.connection i{width:6px;height:6px;border-radius:50%;background:#35a866}.connection.unassigned{color:#8a6a3c;background:#fff7e9}.connection.unassigned i{background:#d8a34d}.actions{display:flex;justify-content:flex-end;gap:7px}.actions button{display:grid;place-items:center;width:34px;height:34px;border:1px solid #dce6fb;border-radius:8px;color:#31569f;background:#f6f9ff;cursor:pointer}.actions button.delete{border-color:#f7dfdd;color:#d92d20;background:#fff8f7}.empty{height:270px;text-align:center}.empty :global(svg),.empty strong,.empty span,.empty button{display:block;margin-right:auto;margin-left:auto}.empty :global(svg){margin-bottom:11px;color:#6d8bd1}.empty strong{font-size:16px}.empty span{margin-top:7px;color:#7c889d}.empty button{margin-top:16px;padding:8px 12px;border:0;border-radius:7px;color:#1647a8;background:#eaf0ff;font:inherit;cursor:pointer}.backdrop{position:fixed;inset:0;z-index:20;display:grid;place-items:center;padding:16px;background:rgba(24,35,58,.24)}.dialog{display:flex;flex-direction:column;width:min(560px,calc(100% - 32px));max-height:calc(100vh - 32px);margin:0;overflow:hidden;border:1px solid #e1e6ee;border-radius:12px;background:#fff;box-shadow:0 14px 38px rgba(26,42,70,.14)}.dialog header{display:flex;justify-content:space-between;gap:14px;padding:18px 22px 15px;border-bottom:1px solid #edf0f4}.dialog header h2{margin:0;color:#1d304f;font-size:20px;font-weight:500}.dialog header p{margin:4px 0 0;color:#77849a;font-size:13px}.dialog header button{width:32px;height:32px;border:0;color:#65728a;background:transparent;cursor:pointer}.dialog form{display:flex;min-height:0;flex:1;flex-direction:column}.form-body{flex:1;min-height:0;padding:18px 22px;overflow:auto}.form-body section+section{margin-top:18px}.form-body h3{margin:0 0 11px;color:#31415c;font-size:15px;font-weight:500}.form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:11px 14px}label{display:grid;gap:5px;color:#536078;font-size:13px}input{width:100%;height:38px;padding:0 11px;border:1px solid #d7dfeb;border-radius:7px;outline:0;color:#273853;background:#fff;font:inherit;font-size:14px}input:focus{border-color:#3764c0;box-shadow:0 0 0 3px rgba(55,100,192,.12)}.checks{display:flex;flex-wrap:wrap;gap:11px 17px}.checks label,.check{display:flex;align-items:center;gap:7px}.checks input,.check input{width:16px;height:16px;accent-color:#1749ad}.error{margin:15px 0 0;color:#c5281c;font-size:13px}.dialog footer{display:flex;justify-content:flex-end;gap:9px;padding:12px 22px;border-top:1px solid #edf0f4;background:#fff}.spin{animation:spin .8s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}@keyframes enter{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}@media(max-height:820px) and (min-width:621px){.dialog{width:min(540px,calc(100% - 32px));max-height:calc(100vh - 24px)}.dialog header{padding:14px 20px 12px}.form-body{padding:14px 20px}.form-body section+section{margin-top:14px}.dialog footer{padding:10px 20px}}@media(max-width:760px){.poi-bar{grid-template-columns:1fr}.page-title-row{align-items:stretch;flex-direction:column}.head-actions{justify-content:flex-end}}@media(max-width:620px){.form-grid{grid-template-columns:1fr}.backdrop{padding:12px}.dialog{width:100%;max-height:calc(100vh - 24px)}}
	.empty{height:330px}
	.icon-button.loading :global(svg){animation:spin .8s linear infinite}
	.icon-button:disabled{cursor:wait;opacity:.72}
	.actions button:disabled{cursor:not-allowed;opacity:.42}
	.dialog{position:relative}.modbus-target{margin-top:11px}
</style>
