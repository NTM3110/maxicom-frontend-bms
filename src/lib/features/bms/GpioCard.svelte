<script lang="ts">
    let { title, hardware, alarmValue = $bindable(1), state, disabled = false }: {
        title: string;
        hardware: string;
        alarmValue?: number;
        state?: {
            alarm?: boolean | null;
            alarmSourceState?: 'ACTIVE' | 'INACTIVE' | 'UNKNOWN' | 'STRING_NOT_FOUND';
            synchronized?: boolean;
            desiredValue?: number | null;
            lastWrittenValue?: number | null;
            lastError?: string | null;
        };
        disabled?: boolean;
    } = $props();
</script>

<article>
    <div class="title">
        <div><strong>{title}</strong><span>{hardware} · Sensor/Module Failure</span></div>
        <em class:unsynced={!state?.synchronized}>
            {state?.synchronized ? (state?.alarmSourceState === 'STRING_NOT_FOUND' ? 'Unassigned' : state?.alarm ? 'Alarm active' : 'Normal') : 'Not synchronized'}
        </em>
    </div>
    <label>IO direction<input value="Output (fixed)" disabled /></label>
    <label>Alarm output value
        <select bind:value={alarmValue} {disabled}>
            <option value={1}>1</option><option value={0}>0</option>
        </select>
    </label>
    <div class="mini">
        <span>Alarm source <strong>{state?.alarmSourceState ?? 'Unavailable'}</strong></span>
        <span>Target <strong>{state?.desiredValue ?? '—'}</strong></span>
        <span>Readback <strong>{state?.lastWrittenValue ?? '—'}</strong></span>
    </div>
    {#if !state?.synchronized && state?.lastError}<small>{state.lastError}</small>{/if}
</article>

<style>
    article{display:grid;gap:12px;padding:15px;border:1px solid #e5eaf2;border-radius:9px}.title{display:flex;justify-content:space-between}.title strong,.title span{display:block}.title span{margin-top:3px;color:#8792a4;font-size:11px}.title em{color:#28784e;font-size:12px;font-style:normal}.title em.unsynced{color:#b45309}label{display:grid;gap:6px;color:#536078;font-size:13px}select,input{width:100%;height:39px;padding:0 10px;border:1px solid #d7dfeb;border-radius:7px;color:#273853;background:#fff;font:inherit}input:disabled{background:#f7f9fc}.mini{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}.mini>span{padding:7px;border-radius:6px;color:#8792a4;background:#f7f9fc;font-size:10px}.mini strong{display:block;margin-top:3px;color:#31415c}small{color:#b45309}
</style>
