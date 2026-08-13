<script lang="ts">
	import { Cable, Check, Pencil, Plus, Trash2, X } from '@lucide/svelte';
	import { onMount } from 'svelte';
	import FlatSelect from '$lib/components/FlatSelect.svelte';
	import type { DeviceConfig } from '$lib/device-config';
	import { hasBmsSession, listBmsSerialPorts, updateBmsSerialPort } from '$lib/services/bms-api';
	import { createSerialPort, deleteFelixComponent, getEdgeConfig, getFelixPids, updateFelixComponent } from '$lib/services/rts-api';
	import {
		BMS_BAUD_RATES, BMS_PARITIES, BMS_STOP_BITS, DATA_BITS,
		RTS_BAUD_RATES, RTS_PARITIES, RTS_STOP_BITS,
		buildBmsSerialUpdateParams, buildRtsSerialCreatePayload, buildRtsTcpCreatePayload,
		type BmsSerialForm, type ProductProfile, type RtsSerialForm, type RtsTcpForm
	} from '$lib/contracts/connectivity';

	let { config }: { config: DeviceConfig | null } = $props();
	let configuredProduct = $derived(config?.device.product ?? 'unified');
	let profile = $state<ProductProfile>('rts');
	let tab = $state<'serial' | 'tcp'>('serial');
	let dialogOpen = $state(false);
	let error = $state('');
	let notice = $state('');
	let rtsPorts = $state<Array<RtsSerialForm & { componentId:string; pid?:string; displayName:string; portName:string }>>([]);
	let tcpBridges = $state<Array<RtsTcpForm & { componentId:string; pid?:string }>>([]);
	let bmsPorts = $state<Array<BmsSerialForm & { id:string; alias:string; port:string }>>([]);
	let rtsSerial = $state<RtsSerialForm>({ template:'', baudRate:'9600', databits:'8', stopbits:'ONE', parity:'NONE' });
	let bmsSerial = $state<BmsSerialForm>({ baudRate:'9600', dataBits:'8', stopBits:'1', parity:'PARITY_NONE' });
	let tcp = $state<RtsTcpForm>({ displayName:'', ip:'', port:502 });
	let editingBmsId = $state<string | null>(null);
	let editingBmsAlias = $state('');
	let editingRtsId = $state<string | null>(null);
	let editingRtsPid = $state<string | null>(null);
	let saving = $state(false);
	let templates = $derived(config?.rts?.serialPortTemplates ?? []);
	let showProfileSwitch = $derived(configuredProduct === 'unified');
	let showTcp = $derived(profile === 'rts' && (config?.connectivity.tcp ?? true));

	onMount(() => { void loadRtsPorts(); if(hasBmsSession()) void loadBmsPorts(); });
	async function loadRtsPorts(){try{const [edge,pids]=await Promise.all([getEdgeConfig(),getFelixPids()]);const pidFor=(id:string,factoryId:string,alias:string)=>pids.find((pid)=>pid.fpid===factoryId&&(pid.nameHint?.includes(`[${id}]`)||pid.nameHint?.includes(`[${alias}]`)))?.id;rtsPorts=Object.entries(edge.components).filter(([,component])=>component.factoryId==='Bridge.Modbus.Serial').map(([id,component])=>{const p=component.properties??{};const template=templates.find((item)=>item.key===id);return{componentId:id,pid:pidFor(id,'Bridge.Modbus.Serial',String(p.alias??id)),displayName:template?.displayName??String(p.alias??id),portName:String(p.portName??template?.portName??''),template:id,baudRate:String(p.baudRate??9600),databits:String(p.databits??8),stopbits:String(p.stopbits??'ONE'),parity:String(p.parity??'NONE')}});tcpBridges=Object.entries(edge.components).filter(([,component])=>component.factoryId==='Bridge.Modbus.Tcp').map(([id,component])=>{const p=component.properties??{};return{componentId:id,pid:pidFor(id,'Bridge.Modbus.Tcp',String(p.alias??id)),displayName:String(p.alias??id),ip:String(p.ip??''),port:Number(p.port??502)}});error='';}catch(cause){error=cause instanceof Error?cause.message:'Unable to load RTS Modbus bridges.';}}
	async function loadBmsPorts(){ try { const ports=await listBmsSerialPorts(); bmsPorts=ports.map((port)=>({id:port.id,alias:port.alias,port:port.port,baudRate:String(port.baudRate),dataBits:String(port.dataBits),stopBits:String(port.stopBits),parity:port.parity})); } catch(cause){ error=cause instanceof Error?cause.message:'Unable to load BMS serial ports.'; } }

	function openCreate() {
		error = ''; notice = ''; editingBmsId = null; editingRtsId=null; editingRtsPid=null;
		if (profile === 'rts' && tab === 'serial') rtsSerial = { template:'', baudRate:'9600', databits:'8', stopbits:'ONE', parity:'NONE' };
		if (profile === 'rts' && tab === 'tcp') tcp = { displayName:'', ip:'', port:502 };
		dialogOpen = true;
	}
	function close() { dialogOpen = false; error = ''; }
	function nextModbusId() {
		const ids = [...rtsPorts.map((item) => item.componentId), ...tcpBridges.map((item) => item.componentId)];
		let index = 0; while (ids.includes(`modbus${index}`)) index += 1;
		return `modbus${index}`;
	}
	async function save() {
		error = '';
		if (profile === 'rts' && tab === 'serial') {
			const template = templates.find((item) => item.key === rtsSerial.template);
			if (!template) { error = 'Select a port template.'; return; }
			if (!editingRtsId && rtsPorts.length >= 3) { error = 'Maximum 3 serial ports allowed.'; return; }
			saving=true;try{if(editingRtsId){if(!editingRtsPid)throw new Error(`Could not find Felix PID for ${editingRtsId}.`);await updateFelixComponent(editingRtsPid,{apply:'true',alias:editingRtsId,enabled:'true',portName:template.portName??'',baudRate:rtsSerial.baudRate,databits:rtsSerial.databits,stopbits:rtsSerial.stopbits,parity:rtsSerial.parity,propertylist:'alias,enabled,portName,baudRate,databits,stopbits,parity'});}else await createSerialPort('Bridge.Modbus.Serial',buildRtsSerialCreatePayload(rtsSerial,template));await loadRtsPorts();notice='RTS serial port saved successfully.';}catch(cause){error=cause instanceof Error?cause.message:'Unable to save RTS serial port.';return;}finally{saving=false;}
		} else if (profile === 'rts') {
			if (!tcp.displayName.trim()) { error = 'Enter a display name.'; return; }
			if (!/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(tcp.ip)) { error = 'Enter a valid IPv4 address.'; return; }
			if (tcp.port < 1 || tcp.port > 65535) { error = 'Port must be between 1 and 65535.'; return; }
			const componentId = editingRtsId??nextModbusId();saving=true;try{if(editingRtsId){if(!editingRtsPid)throw new Error(`Could not find Felix PID for ${editingRtsId}.`);await updateFelixComponent(editingRtsPid,{apply:'true',alias:tcp.displayName,enabled:'true',ip:tcp.ip,port:tcp.port,propertylist:'alias,enabled,ip,port'});}else await createSerialPort('Bridge.Modbus.Tcp',buildRtsTcpCreatePayload(tcp,componentId));await loadRtsPorts();notice='RTS TCP bridge saved successfully.';}catch(cause){error=cause instanceof Error?cause.message:'Unable to save RTS TCP bridge.';return;}finally{saving=false;}
		} else if (editingBmsId) {
			const current = bmsPorts.find((item) => item.id === editingBmsId);
			if (!current) { error='Serial bridge is no longer available.'; return; }
			buildBmsSerialUpdateParams(current.id, editingBmsAlias, bmsSerial);
			saving=true;
			try {
				if(hasBmsSession()) await updateBmsSerialPort({id:current.id,alias:editingBmsAlias.trim()||current.id,port:current.port,channel:current.id,baudRate:Number(bmsSerial.baudRate),dataBits:Number(bmsSerial.dataBits),stopBits:Number(bmsSerial.stopBits),parity:bmsSerial.parity});
				else bmsPorts=bmsPorts.map((item)=>item.id===editingBmsId?{...item,...bmsSerial,alias:editingBmsAlias.trim()||item.id}:item);
				if(hasBmsSession()) await loadBmsPorts();
				notice='BMS serial bridge updated with bms.tools.serial.update.';
			} catch(cause){ error=cause instanceof Error?cause.message:'Unable to update the BMS serial bridge.'; return; } finally { saving=false; }
		}
		close();
	}
	function editRtsSerial(port:(typeof rtsPorts)[number]){editingRtsId=port.componentId;editingRtsPid=port.pid??null;rtsSerial={template:port.template,baudRate:port.baudRate,databits:port.databits,stopbits:port.stopbits,parity:port.parity};tab='serial';dialogOpen=true;error='';}
	function editRtsTcp(bridge:(typeof tcpBridges)[number]){editingRtsId=bridge.componentId;editingRtsPid=bridge.pid??null;tcp={displayName:bridge.displayName,ip:bridge.ip,port:bridge.port};tab='tcp';dialogOpen=true;error='';}
	async function removeRts(componentId:string,pid?:string){if(!confirm(`Delete ${componentId}?`))return;try{if(!pid)throw new Error(`Could not find Felix PID for ${componentId}.`);await deleteFelixComponent(pid);await loadRtsPorts();notice=`${componentId} deleted.`;}catch(cause){error=cause instanceof Error?cause.message:'Unable to delete RTS bridge.';}}
	function selectProfile(value: ProductProfile) { profile = value; tab = 'serial'; notice = ''; }
</script>

<section class="page">
	<div class="page-head">
		<div><h2>Serial & TCP</h2><p>Configuration mapped directly from the {profile === 'rts' ? 'maxiems-web' : 'maxicom-bms-svelte'} source.</p></div>
		{#if profile === 'rts'}<button class="primary" type="button" onclick={openCreate}><Plus size={17} /> Add {tab === 'serial' ? 'serial port' : 'TCP bridge'}</button>{/if}
	</div>

	{#if showProfileSwitch}<div class="profile-switch" aria-label="Source profile"><button class:active={profile === 'rts'} type="button" onclick={() => selectProfile('rts')}>RTS configuration</button><button class:active={profile === 'bms'} type="button" onclick={() => selectProfile('bms')}>BMS configuration</button></div>{/if}
	<div class="tabs"><button class:active={tab === 'serial'} type="button" onclick={() => tab='serial'}>Serial Port Configuration</button>{#if showTcp}<button class:active={tab === 'tcp'} type="button" onclick={() => tab='tcp'}>TCP Configuration</button>{/if}</div>
	{#if notice}<div class="notice"><Check size={16} />{notice}</div>{/if}
	{#if error && !dialogOpen}<div class="request-error">{error}</div>{/if}

	<div class="table-wrap"><table><thead><tr>{#if tab === 'serial'}<th>#</th><th>Display name</th>{#if profile === 'bms'}<th>Device path</th>{/if}<th>Baud rate</th><th>Data bits</th><th>Stop bits</th><th>Parity</th><th></th>{:else}<th>#</th><th>Component ID</th><th>Display name</th><th>IP address</th><th>Port</th><th></th>{/if}</tr></thead><tbody>
		{#if profile === 'rts' && tab === 'serial' && rtsPorts.length}{#each rtsPorts as port,index}<tr><td>{index+1}</td><td><strong>{port.displayName}</strong><small>{port.portName}</small></td><td>{port.baudRate}</td><td>{port.databits}</td><td>{port.stopbits}</td><td>{port.parity}</td><td class="actions"><button aria-label="Edit" onclick={()=>editRtsSerial(port)}><Pencil size={16}/></button><button class="delete" aria-label="Delete" onclick={()=>removeRts(port.componentId,port.pid)}><Trash2 size={16}/></button></td></tr>{/each}
		{:else if profile === 'rts' && tab === 'tcp' && tcpBridges.length}{#each tcpBridges as bridge,index}<tr><td>{index+1}</td><td>{bridge.componentId}</td><td><strong>{bridge.displayName}</strong></td><td>{bridge.ip}</td><td>{bridge.port}</td><td class="actions"><button aria-label="Edit" onclick={()=>editRtsTcp(bridge)}><Pencil size={16}/></button><button class="delete" aria-label="Delete" onclick={()=>removeRts(bridge.componentId,bridge.pid)}><Trash2 size={16}/></button></td></tr>{/each}
		{:else if profile === 'bms' && bmsPorts.length}{#each bmsPorts as port,index}<tr><td>{index+1}</td><td><strong>{port.alias}</strong><small>{port.id}</small></td><td>{port.port}</td><td>{port.baudRate}</td><td>{port.dataBits}</td><td>{port.stopBits}</td><td>{port.parity}</td><td class="actions"><button aria-label="Edit" onclick={() => { editingBmsId=port.id; editingBmsAlias=port.alias; bmsSerial={ baudRate:port.baudRate,dataBits:port.dataBits,stopBits:port.stopBits,parity:port.parity }; dialogOpen=true; }}><Pencil size={16}/></button></td></tr>{/each}
		{:else}<tr><td class="empty" colspan="8"><Cable size={27}/><strong>{profile === 'rts' ? (tab === 'serial' ? 'No serial ports configured' : 'No TCP bridges configured') : 'No OpenEMS serial bridges returned'}</strong><span>{profile === 'bms' ? 'BMS loads existing bridges with bms.tools.serial.list; creating and deleting bridges are disabled in the original source.' : 'Add the first connection to begin configuration.'}</span></td></tr>{/if}
	</tbody></table></div>
</section>

{#if dialogOpen}<div class="backdrop" role="presentation" onclick={close}><dialog open onclick={(event)=>event.stopPropagation()}><header><div><h3>{profile === 'bms' ? 'Edit BMS serial port' : tab === 'serial' ? 'Add RTS serial port' : 'Add RTS TCP bridge'}</h3><p>Exact fields and enum values from the existing source.</p></div><button type="button" onclick={close} aria-label="Close"><X size={19}/></button></header><form onsubmit={(event)=>{event.preventDefault();save();}}><div class="body">
	{#if profile === 'rts' && tab === 'serial'}<div class="grid"><label>Port Template<FlatSelect bind:value={rtsSerial.template} options={templates.map((item)=>({value:item.key,label:`${item.displayName} · ${item.portName??item.key}`}))} placeholder="Select a template" /></label><label>Baud Rate<FlatSelect bind:value={rtsSerial.baudRate} options={RTS_BAUD_RATES}/></label><label>Data Bits<FlatSelect bind:value={rtsSerial.databits} options={DATA_BITS}/></label><label>Stop Bits<FlatSelect bind:value={rtsSerial.stopbits} options={RTS_STOP_BITS}/></label><label>Parity<FlatSelect bind:value={rtsSerial.parity} options={RTS_PARITIES}/></label></div>
	{:else if profile === 'rts'}<div class="grid"><label>Display Name<input bind:value={tcp.displayName} placeholder="e.g. Factory TCP Gateway"/></label><label>IP Address<input bind:value={tcp.ip} placeholder="192.168.1.100"/></label><label>Port<input type="number" min="1" max="65535" bind:value={tcp.port}/></label></div>
	{:else}<div class="grid"><label>Alias<input bind:value={editingBmsAlias} placeholder="e.g. Serial 1"/></label><label>Baud Rate<FlatSelect bind:value={bmsSerial.baudRate} options={BMS_BAUD_RATES}/></label><label>Data Bits<FlatSelect bind:value={bmsSerial.dataBits} options={DATA_BITS}/></label><label>Stop Bits<FlatSelect bind:value={bmsSerial.stopBits} options={BMS_STOP_BITS}/></label><label>Parity<FlatSelect bind:value={bmsSerial.parity} options={BMS_PARITIES}/></label></div>{/if}
	{#if error}<p class="error">{error}</p>{/if}</div><footer><button class="secondary" type="button" onclick={close}>Cancel</button><button class="primary" type="submit" disabled={saving}><Check size={16}/>{saving?'Saving…':'Save'}</button></footer></form></dialog></div>{/if}

<style>
	.page{animation:enter .18s ease-out}.page-head{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;margin-bottom:20px}.page-head h2{margin:0;color:#172b4d;font-size:24px;font-weight:500}.page-head p{margin:7px 0 0;color:#718096;font-size:16px}.primary,.secondary{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:39px;padding:0 14px;border:1px solid transparent;border-radius:8px;cursor:pointer;font:inherit;font-size:14px;font-weight:400}.primary{color:#fff;background:#1749ad}.secondary{border-color:#d7dfeb;color:#43536e;background:#fff}.profile-switch{display:inline-flex;margin-bottom:16px;padding:3px;border-radius:9px;background:#e9eef7}.profile-switch button{height:33px;padding:0 13px;border:0;border-radius:7px;color:#65738a;background:transparent;cursor:pointer;font:inherit;font-size:13px}.profile-switch button.active{color:#1749ad;background:#fff;box-shadow:0 1px 4px rgba(30,48,79,.1)}.tabs{display:flex;gap:5px;border-bottom:1px solid #e2e8f1}.tabs button{min-height:41px;padding:0 13px;border:0;border-bottom:2px solid transparent;color:#65738b;background:transparent;cursor:pointer;font:inherit;font-size:14px}.tabs button.active{border-color:#2454b6;color:#1d4ba7}.notice,.request-error{margin:14px 0 0;padding:10px 12px;border-radius:8px;font-size:13px}.notice{display:flex;align-items:center;gap:7px;border:1px solid #cae7d5;color:#28784e;background:#f2fbf5}.request-error{border:1px solid #f3cac6;color:#b42318;background:#fff1f0}.table-wrap{overflow-x:auto;margin-top:16px;border-top:1px solid #e5ebf3;border-bottom:1px solid #e5ebf3;background:#fff}table{width:100%;min-width:820px;border-collapse:collapse}th{padding:12px 16px;border-bottom:1px solid #e7edf5;color:#79869a;background:#f8faff;font-size:12px;font-weight:500;text-align:left;text-transform:uppercase}td{padding:15px 16px;border-bottom:1px solid #edf1f6;color:#526179;font-size:14px}td strong,td small{display:block}td strong{color:#2e405f;font-weight:500}td small{margin-top:3px;color:#8792a4;font-size:12px}.actions{display:flex;justify-content:flex-end;gap:7px}.actions button{display:grid;place-items:center;width:33px;height:33px;border:1px solid #dce6fb;border-radius:7px;color:#31569f;background:#f6f9ff;cursor:pointer}.actions .delete{border-color:#f4dddb;color:#ca3026;background:#fff8f7}.empty{height:270px;text-align:center}.empty :global(svg),.empty strong,.empty span{display:block;margin-right:auto;margin-left:auto}.empty :global(svg){margin-bottom:10px;color:#6d8bd1}.empty strong{color:#33435e;font-size:16px;font-weight:500}.empty span{max-width:610px;margin-top:7px;color:#7c889d;line-height:1.45}.backdrop{position:fixed;inset:0;z-index:30;display:grid;place-items:center;padding:16px;background:rgba(24,35,58,.25)}dialog{position:relative;display:flex;flex-direction:column;width:min(540px,calc(100% - 32px));max-height:calc(100vh - 24px);margin:0;padding:0;overflow:hidden;border:1px solid #e1e6ee;border-radius:12px;background:#fff;box-shadow:0 14px 38px rgba(26,42,70,.14)}dialog header{display:flex;justify-content:space-between;padding:17px 20px 14px;border-bottom:1px solid #edf0f4}dialog header h3{margin:0;color:#1d304f;font-size:19px;font-weight:500}dialog header p{margin:4px 0 0;color:#77849a;font-size:13px}dialog header button{display:grid;place-items:center;width:32px;height:32px;border:0;color:#65728a;background:transparent;cursor:pointer}dialog form{display:flex;min-height:0;flex:1;flex-direction:column}.body{padding:18px 20px;overflow:auto}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:13px 14px}.grid label{display:grid;gap:6px;color:#536078;font-size:13px}.grid input{width:100%;height:38px;padding:0 11px;border:1px solid #d7dfeb;border-radius:7px;color:#273853;background:#fff;font:inherit;font-size:14px}.error{margin:15px 0 0;color:#c5281c;font-size:13px}footer{display:flex;justify-content:flex-end;gap:8px;padding:11px 20px;border-top:1px solid #edf0f4}@keyframes enter{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}@media(max-width:700px){.page-head{flex-direction:column}.page-head .primary{width:100%}.grid{grid-template-columns:1fr}.profile-switch{display:flex}.profile-switch button{flex:1}.tabs{overflow-x:auto}}@media(max-height:820px) and (min-width:701px){dialog{max-height:calc(100vh - 20px)}.body{padding-top:14px;padding-bottom:14px}}
</style>
