<script lang="ts">
	import type { DeviceConfig } from '$lib/device-config';
	import BmsAccountPage from '$lib/features/bms/BmsAccountPage.svelte';
	import RtsAccountPage from '$lib/features/rts/RtsAccountPage.svelte';
	let {config}:{config:DeviceConfig|null}=$props();
	let profile=$state<'bms'|'rts'>('rts');
</script>
<div class="switch"><button class:active={profile==='rts'} onclick={()=>profile='rts'}>RTS account</button><button class:active={profile==='bms'} onclick={()=>profile='bms'}>BMS account</button></div>
{#if profile==='rts'}<RtsAccountPage {config}/>{:else}<BmsAccountPage/>{/if}
<style>.switch{display:inline-flex;margin-bottom:17px;padding:3px;border-radius:9px;background:#e9eef7}.switch button{height:33px;padding:0 13px;border:0;border-radius:7px;color:#65738a;background:transparent;font:inherit;cursor:pointer}.switch button.active{color:#1749ad;background:#fff;box-shadow:0 1px 4px rgba(30,48,79,.1)}</style>
