<script lang="ts">
    import { BellRing, Mail } from '@lucide/svelte';
    import AlarmMonitorPage from './AlarmMonitorPage.svelte';
    import EmailAlertsPage from './EmailAlertsPage.svelte';

    let activeTab = $state<'monitor' | 'email'>('monitor');
</script>

<section class="workspace">
    <nav class="tabs" aria-label="Alerts workspace">
        <button type="button" aria-pressed={activeTab === 'monitor'} class:active={activeTab === 'monitor'} onclick={() => activeTab = 'monitor'}><BellRing size={17} />Alarm Monitor</button>
        <button type="button" aria-pressed={activeTab === 'email'} class:active={activeTab === 'email'} onclick={() => activeTab = 'email'}><Mail size={17} />Email Alerts</button>
    </nav>
    {#if activeTab === 'monitor'}
        <AlarmMonitorPage />
    {:else}
        <EmailAlertsPage />
    {/if}
</section>

<style>
    .workspace{min-width:0}.tabs{display:flex;gap:4px;margin-bottom:20px;padding:4px;border:1px solid #e1e7f0;border-radius:10px;background:#fff}.tabs button{display:inline-flex;align-items:center;justify-content:center;gap:7px;min-height:38px;padding:0 15px;border:0;border-radius:7px;color:#67758c;background:transparent;cursor:pointer;font:inherit;font-size:14px}.tabs button.active{color:#1749ad;background:#edf3ff;font-weight:500}@media(max-width:480px){.tabs button{flex:1;padding:0 8px}}
</style>
