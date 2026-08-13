<script lang="ts">
	let { title, hardware, direction = $bindable<'input'|'output'>('output'), alarmValue = $bindable(1), state }: { title:string; hardware:string; direction?:'input'|'output'; alarmValue?:number; state?:{ alarm?:boolean; desiredValue?:number|null; lastWrittenValue?:number|null } } = $props();
</script>

<article><div class="title"><div><strong>{title}</strong><span>{hardware}</span></div><em>{state?.alarm ? 'Alarm' : 'Normal'}</em></div><label>IO Direction<select bind:value={direction}><option value="output">Output</option><option value="input">Input</option></select></label><label>Alarm Output Value<select bind:value={alarmValue}><option value={1}>1</option><option value={0}>0</option></select></label><div class="mini"><span>Normal value <strong>{Number(alarmValue) === 1 ? 0 : 1}</strong></span><span>Target <strong>{state?.desiredValue ?? '—'}</strong></span><span>Last written <strong>{state?.lastWrittenValue ?? '—'}</strong></span></div></article>

<style>
	article{display:grid;gap:12px;padding:15px;border:1px solid #e5eaf2;border-radius:9px}.title{display:flex;justify-content:space-between}.title strong,.title span{display:block}.title span{margin-top:3px;color:#8792a4;font-size:11px}.title em{color:#28784e;font-size:12px;font-style:normal}label{display:grid;gap:6px;color:#536078;font-size:13px}select{width:100%;height:39px;padding:0 10px;border:1px solid #d7dfeb;border-radius:7px;color:#273853;background:#fff;font:inherit}.mini{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}.mini>span{padding:7px;border-radius:6px;color:#8792a4;background:#f7f9fc;font-size:10px}.mini strong{display:block;margin-top:3px;color:#31415c}
</style>
