<script lang="ts">
	import type { MaintenanceString } from '$lib/services/bms-api';
	let { value = $bindable(1), strings, onchange }: { value?: number; strings: MaintenanceString[]; onchange: (value:number)=>void } = $props();
</script>

<label>String<select bind:value disabled={!strings.length} onchange={(event)=>onchange(Number(event.currentTarget.value))}>{#each strings as item}<option value={item.stringIndex}>String {item.stringIndex} — {item.stringName}</option>{/each}</select></label>

<style>
	label{display:grid;gap:6px;color:#536078;font-size:13px}select{width:100%;height:39px;padding:0 10px;border:1px solid #d7dfeb;border-radius:7px;color:#273853;background:#fff;font:inherit}
</style>
