<script lang="ts">
	import { Check, RefreshCw, Server } from '@lucide/svelte';
	import { onMount } from 'svelte';
	import { getBmsModbusServer, updateBmsModbusServer, type BmsModbusServerState, type BmsModbusServerTransport } from '$lib/services/bms-api';
	import BmsModbusRegisterMap from './BmsModbusRegisterMap.svelte';

	let serverState=$state<BmsModbusServerState|null>(null);
	let error=$state('');
	let notice=$state('');
	let loading=$state(true);
	let saving=$state(false);
	let enabled=$state(false);
	let transport=$state<BmsModbusServerTransport>('TCP');
	let unitId=$state(1);
	let bindAddress=$state('0.0.0.0');
	let tcpPort=$state(1502);
	let serialPortId=$state('');
	function apply(value:BmsModbusServerState){serverState=value;enabled=value.enabled;transport=value.transport;unitId=value.unitId;bindAddress=value.bindAddress;tcpPort=value.tcpPort;serialPortId=value.serialPortId??'';}
	async function load(){loading=true;error='';try{apply(await getBmsModbusServer())}catch(cause){error=cause instanceof Error?cause.message:'Unable to load the Modbus server.'}finally{loading=false}}
	async function save(){error='';notice='';if(unitId<1||unitId>247){error='Unit ID must be between 1 and 247.';return}if(transport==='TCP'&&!bindAddress.trim()){error='Enter a TCP bind IP address.';return}if(transport==='TCP'&&(tcpPort<1||tcpPort>65535)){error='TCP port must be between 1 and 65535.';return}if(transport==='SERIAL_RTU'&&!serialPortId){error='Select Port 1, Port 2 or Port 3.';return}saving=true;try{apply(await updateBmsModbusServer({enabled,transport,unitId:Number(unitId),bindAddress:bindAddress.trim()||'0.0.0.0',tcpPort:Number(tcpPort)||1502,serialPortId:transport==='SERIAL_RTU'?serialPortId:null}));notice='Modbus server configuration saved.'}catch(cause){error=cause instanceof Error?cause.message:'Unable to save the Modbus server.'}finally{saving=false}}
	onMount(()=>{void load()});
</script>

<section class="panel">
	<header><div class="title"><span><Server size={18}/></span><div><h3>BMS Modbus Server</h3><p>Expose the compact read-only FC4 register map over TCP or Serial RTU.</p></div></div>{#if serverState}<b class:active={serverState.runtimeState==='ACTIVE'} class:error-state={serverState.runtimeState==='ERROR'}>{serverState.runtimeState.replace('_',' ')}</b>{/if}</header>
	{#if loading}<div class="message">Loading authoritative server configuration…</div>{:else}
		<div class="body">
			{#if error}<div class="error">{error}</div>{/if}{#if notice}<div class="notice"><Check size={15}/>{notice}</div>{/if}{#if serverState?.runtimeError}<div class="error">{serverState.runtimeError}</div>{/if}
			<label class="toggle"><input type="checkbox" bind:checked={enabled}/><span>Enable Modbus server</span></label>
			<div class="transport"><button type="button" class:active={transport==='TCP'} onclick={()=>transport='TCP'}>TCP</button><button type="button" class:active={transport==='SERIAL_RTU'} onclick={()=>transport='SERIAL_RTU'}>Serial RTU</button></div>
			<div class="grid"><label>Unit ID<input type="number" min="1" max="247" bind:value={unitId}/></label>{#if transport==='TCP'}<label>Bind IP address<input bind:value={bindAddress} placeholder="0.0.0.0" spellcheck="false"/><small>IPv4 or IPv6 literal. Use 0.0.0.0 for all IPv4 interfaces.</small></label><label>Listen port<input type="number" min="1" max="65535" bind:value={tcpPort}/></label>{:else}<label>Serial port<select bind:value={serialPortId}><option value="" disabled>Select a port</option>{#each serverState?.ports??[] as port}<option value={port.id} disabled={!port.available&&!port.selected}>{port.displayName}{port.available||port.selected?'':` — Used by ${port.ownerIds.join(', ')||port.owner}`}</option>{/each}</select></label>{/if}</div>
			{#if transport==='SERIAL_RTU' && serverState}<div class="ports">{#each serverState.ports as port}<article class:selected={serialPortId===port.id} class:unavailable={!port.available&&!port.selected}><div><strong>{port.displayName}</strong><small>{port.id} · {port.portName} · {port.serialFormat}</small></div><span>{port.available||port.selected?'Available':`Used by ${port.ownerIds.join(', ')||port.owner}`}</span></article>{/each}</div>{/if}
			<div class="contract"><strong>Register contract v3</strong><span>Address = strId × 1000 · 36 registers per string · FC4 Input Registers only</span></div>
		</div>
		<footer><button class="secondary" type="button" onclick={load} disabled={saving}><RefreshCw size={15}/>Refresh</button><button class="primary" type="button" onclick={save} disabled={saving}>{saving?'Saving…':'Save configuration'}</button></footer>
	{/if}
</section>
{#if serverState?.registerMap}
	<BmsModbusRegisterMap map={serverState.registerMap} />
{:else if !loading && serverState}
	<p class="map-unavailable">This backend does not provide the register list yet. Update the BMS backend to view its current map.</p>
{/if}

<style>
	.map-unavailable{margin:16px 0;color:#718096;font-size:13px}
	.panel{margin-top:16px;border:1px solid #e1e7f0;border-radius:12px;background:#fff;overflow:hidden}.panel>header{display:flex;align-items:center;justify-content:space-between;padding:18px 20px;border-bottom:1px solid #e8edf5}.title{display:flex;align-items:center;gap:11px}.title>span{display:grid;place-items:center;width:34px;height:34px;border-radius:9px;color:#2454b6;background:#edf3ff}.title h3{margin:0;color:#263858;font-size:16px;font-weight:500}.title p{margin:4px 0 0;color:#7b879a;font-size:13px}.panel>header b{padding:5px 9px;border-radius:12px;color:#65738b;background:#eef1f5;font-size:11px;font-weight:500}.panel>header b.active{color:#28784e;background:#eaf8ef}.panel>header b.error-state{color:#b42318;background:#fff1f0}.body{padding:18px 20px}.message{padding:40px;text-align:center;color:#718096}.error,.notice{margin-bottom:13px;padding:10px 12px;border-radius:7px;font-size:13px}.error{border:1px solid #f3cac6;color:#b42318;background:#fff1f0}.notice{display:flex;gap:7px;border:1px solid #cae7d5;color:#28784e;background:#f2fbf5}.toggle{display:flex;align-items:center;gap:9px;color:#33435e;font-size:14px}.toggle input{width:17px;height:17px}.transport{display:inline-flex;margin:16px 0;padding:3px;border-radius:8px;background:#e9eef7}.transport button{height:33px;padding:0 17px;border:0;border-radius:6px;color:#65738a;background:transparent;font:inherit;font-size:13px;cursor:pointer}.transport button.active{color:#1749ad;background:#fff;box-shadow:0 1px 4px rgba(30,48,79,.1)}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.grid label{display:grid;align-content:start;gap:6px;color:#536078;font-size:13px}.grid label small{color:#7c889d;font-size:11px;line-height:1.35}.grid input,.grid select{height:39px;padding:0 10px;border:1px solid #d7dfeb;border-radius:7px;color:#273853;background:#fff;font:inherit}.ports{display:grid;gap:7px;margin-top:14px}.ports article{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border:1px solid #e1e7f0;border-radius:8px}.ports article.selected{border-color:#6c8fd7;background:#f5f8ff}.ports article.unavailable{opacity:.6}.ports strong,.ports small{display:block}.ports strong{color:#31415c;font-size:13px;font-weight:500}.ports small{margin-top:3px;color:#7c889d;font-size:12px}.ports span{color:#718096;font-size:12px}.contract{display:flex;justify-content:space-between;gap:12px;margin-top:16px;padding:11px 12px;border-radius:8px;color:#536078;background:#f7f9fc;font-size:12px}.contract strong{font-weight:500}.panel>footer{display:flex;justify-content:flex-end;gap:8px;padding:12px 20px;border-top:1px solid #edf0f4}.primary,.secondary{display:inline-flex;align-items:center;gap:7px;min-height:38px;padding:0 13px;border:1px solid transparent;border-radius:7px;font:inherit;font-size:13px;cursor:pointer}.primary{color:#fff;background:#1749ad}.secondary{border-color:#d7dfeb;color:#43536e;background:#fff}button:disabled{opacity:.55;cursor:wait}@media(max-width:680px){.grid{grid-template-columns:1fr}.panel>header,.contract,.ports article{align-items:flex-start;flex-direction:column}.panel>footer{flex-direction:column-reverse}.panel>footer button{justify-content:center;width:100%}}
</style>
