<script lang="ts">
	let { title, state, task, errorText }: { title:string; state:string; task?:string; errorText?:string } = $props();
</script>

<div class="status"><strong>{title}</strong><span>{state}{task ? ` · ${task}` : ''}</span>{#if errorText}<em>{errorText}</em>{/if}</div>

<style>
	.status{display:flex;align-items:center;gap:10px;margin-top:15px;padding:12px;border-radius:8px;background:#f6f8fc}.status strong{color:#31415c;font-size:13px}.status span{color:#617089}.status em{margin-left:auto;color:#c33127;font-size:12px}
</style>
