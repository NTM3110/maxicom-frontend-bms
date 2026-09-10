<script lang="ts">
    import { onMount } from 'svelte';
    import { AlertTriangle, BellRing, RefreshCw, ShieldAlert } from '@lucide/svelte';
    import {
        getBmsMonitoring,
        hasBmsSession,
        listBmsMonitoringAlarms,
        listBmsStrings,
        type BatteryString,
        type BmsAlarmOccurrence,
        type BmsMonitoringFrame
    } from '$lib/services/bms-api';

    type ViewMode = 'active' | 'history';

    let strings = $state<BatteryString[]>([]);
    let selectedStringKey = $state('');
    let viewMode = $state<ViewMode>('active');
    let frame = $state<BmsMonitoringFrame | null>(null);
    let alarms = $state<BmsAlarmOccurrence[]>([]);
    let loading = $state(true);
    let refreshing = $state(false);
    let error = $state('');
    let frameError = $state('');
    let lastUpdatedAt = $state<Date | null>(null);
    let refreshPromise: Promise<void> | null = null;

    const sensorFailures = $derived(alarms.filter((alarm) => alarm.alarm === 'SENSOR_MODULE_FAILURE'));
    const regularAlarms = $derived(alarms.filter((alarm) => alarm.alarm !== 'SENSOR_MODULE_FAILURE'));
    const sensorFrameDetails = $derived(frame?.alarmDetails.filter((detail) => detail.alarm === 'SENSOR_MODULE_FAILURE') ?? []);
    const liveStateUnavailable = $derived(!frame || frame.stale);
    const unavailableEvaluations = $derived(Object.entries(frame?.alarmEvaluations ?? {}).filter(([, status]) => status === 'UNAVAILABLE').map(([alarm]) => label(alarm)));
    const activeCount = $derived(regularAlarms.filter((alarm) => alarm.conditionActive).length + (sensorFailures.some((alarm) => alarm.conditionActive) ? 1 : 0));
    const clearedCount = $derived(regularAlarms.filter((alarm) => !!alarm.clearedAt).length + (sensorFailures.length > 0 && sensorFailures.every((alarm) => !!alarm.clearedAt) ? 1 : 0));
    const topLevelCount = $derived(regularAlarms.length + (sensorFailures.length ? 1 : 0));

    onMount(() => {
        let cancelled = false;
        let timer: ReturnType<typeof setInterval> | undefined;
        void initialize().finally(() => {
            if (!cancelled) timer = setInterval(() => void refresh(), 15_000);
        });
        return () => {
            cancelled = true;
            if (timer) clearInterval(timer);
        };
    });

    async function initialize() {
        loading = true;
        error = '';
        try {
            if (!hasBmsSession()) throw new Error('Authenticate with the BMS platform to view alarms.');
            strings = await listBmsStrings();
            if (!selectedStringKey && strings.length) selectedStringKey = strings[0].id;
            if (selectedStringKey) await refresh();
        } catch (reason) {
            error = message(reason);
        } finally {
            loading = false;
        }
    }

    function refresh(afterCurrent = false): Promise<void> {
        if (refreshPromise) return afterCurrent ? refreshPromise.then(() => refresh()) : refreshPromise;
        if (!selectedStringKey) return Promise.resolve();
        refreshPromise = runRefresh().finally(() => refreshPromise = null);
        return refreshPromise;
    }

    async function runRefresh() {
        const requestedStringKey = selectedStringKey;
        const requestedViewMode = viewMode;
        refreshing = true;
        error = '';
        frameError = '';
        const [frameResult, alarmResult] = await Promise.allSettled([
            getBmsMonitoring(requestedStringKey),
            listBmsMonitoringAlarms({ stringKey: requestedStringKey, includeCleared: requestedViewMode === 'history', limit: 200 })
        ]);
        if (requestedStringKey !== selectedStringKey || requestedViewMode !== viewMode) {
            refreshing = false;
            return;
        }
        if (frameResult.status === 'fulfilled') {
            frame = frameResult.value;
        } else {
            frame = null;
            frameError = message(frameResult.reason);
        }
        if (alarmResult.status === 'fulfilled') {
            alarms = alarmResult.value;
        } else {
            error = message(alarmResult.reason);
        }
        lastUpdatedAt = new Date();
        refreshing = false;
    }

    async function changeString(event: Event) {
        selectedStringKey = (event.currentTarget as HTMLSelectElement).value;
        frame = null;
        alarms = [];
        await refresh(true);
    }

    async function changeView(next: ViewMode) {
        if (viewMode === next) return;
        viewMode = next;
        alarms = [];
        await refresh(true);
    }

    function message(reason: unknown) {
        return reason instanceof Error ? reason.message : 'The monitoring request failed.';
    }


    function label(value: string) {
        return value.toLowerCase().split('_').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
    }

    function date(value: string | null) {
        if (!value) return '—';
        const parsed = new Date(value);
        return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
    }

    function number(value: number | null, suffix = '') {
        return value === null ? '—' : `${value.toLocaleString(undefined, { maximumFractionDigits: 3 })}${suffix}`;
    }

    function evaluationUnavailable(alarm: string) {
        return liveStateUnavailable || frame?.alarmEvaluations[alarm] === 'UNAVAILABLE';
    }
</script>

<section class="page">
    <header class="page-head">
        <div>
            <h2><ShieldAlert size={23} />Alarm Monitor</h2>
            <p>Live BMS alarm state and authoritative persisted occurrence history.</p>
        </div>
        <button class="refresh" type="button" disabled={refreshing || !selectedStringKey} onclick={() => refresh()}>
            <RefreshCw size={16} class={refreshing ? 'spin' : ''} />{refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
    </header>

    <section class="toolbar" aria-label="Alarm filters">
        <label>Battery string
            <select value={selectedStringKey} onchange={changeString} disabled={loading || !strings.length}>
                {#if !strings.length}<option value="">No strings available</option>{/if}
                {#each strings as item}<option value={item.id}>{item.stringName} ({item.id})</option>{/each}
            </select>
        </label>
        <div class="view-switch" role="group" aria-label="Alarm status filter">
            <button type="button" class:active={viewMode === 'active'} aria-pressed={viewMode === 'active'} onclick={() => changeView('active')}>Active</button>
            <button type="button" class:active={viewMode === 'history'} aria-pressed={viewMode === 'history'} onclick={() => changeView('history')}>History</button>
        </div>
        {#if lastUpdatedAt}<span class="updated">Updated {lastUpdatedAt.toLocaleTimeString()}</span>{/if}
    </section>

    {#if error}<div class="message error" role="alert">{error}</div>{/if}
    {#if frameError}<div class="message warning"><AlertTriangle size={16} />Live monitoring unavailable: {frameError}. Persisted alarm history remains available.</div>{/if}

    {#if loading}
        <section class="state">Loading alarm monitoring…</section>
    {:else if !strings.length}
        <section class="state">No battery string is configured.</section>
    {:else}
        {#if !frame?.reference}
            <div class="message warning reference-warning"><AlertTriangle size={17} />Monitoring reference unavailable. Complete and publish an Initial Baseline first.</div>
        {/if}
        {#if unavailableEvaluations.length}
            <div class="message warning"><AlertTriangle size={17} />Evaluation unavailable: {unavailableEvaluations.join(', ')}. Existing occurrences retain their last known condition; unavailable does not mean cleared.</div>
        {/if}

        <section class="summary-grid" aria-label="Alarm summary">
            <article><BellRing size={20} /><div><span>{liveStateUnavailable ? 'Last known active' : 'Active'}</span><strong>{activeCount}</strong></div></article>
            <article><ShieldAlert size={20} /><div><span>Cleared history</span><strong>{clearedCount}</strong></div></article>
            <article><ShieldAlert size={20} /><div><span>{liveStateUnavailable ? 'Last known alarm mask' : 'Alarm mask'}</span><strong>{frame ? `${frame.alarmMask} / 0x${frame.alarmMask.toString(16).toUpperCase()}` : '—'}</strong></div></article>
        </section>

        <section class="live-card">
            <div class="live-grid">
                <div><span>Operating mode</span><strong>{frame?.operatingMode ? label(frame.operatingMode.mode) : '—'}</strong><small>{frame?.operatingMode?.quality ?? 'No live frame'}</small></div>
                <div><span>Measurement snapshot</span><strong>{frame?.snapshotSequence ?? '—'}</strong><small>{date(frame?.capturedAt ?? null)}{#if frame?.publicationRevision != null} · publication {frame.publicationRevision}{/if}</small></div>
                <div><span>Current quality</span><strong>{frame?.currentQuality ?? '—'}</strong><small>{!frame ? 'No live frame' : frame.stale ? 'Snapshot is stale' : 'Latest frame'}</small></div>
            </div>
            {#if frame?.reference}
                <details>
                    <summary>Initial Baseline reference</summary>
                    <div class="reference-grid">
                        <span>Event <strong>#{frame.reference.calibrationEventId}</strong></span>
                        <span>Curve version <strong>#{frame.reference.curveVersionId}</strong></span>
                        <span>Process <strong>#{frame.reference.calibrationProcessId}</strong></span>
                        <span>Attempt <strong>{frame.reference.processAttemptNumber}</strong></span>
                        <span>Recovery Float sample <strong>#{frame.reference.recoveryFloatSampleId}</strong></span>
                        <span>Voc sample <strong>#{frame.reference.vocSampleId}</strong></span>
                        <span class="hash">Content hash <strong>{frame.reference.contentHash}</strong></span>
                    </div>
                </details>
            {/if}
        </section>

        <section class="alarms-card">
            <header><div><h3>{viewMode === 'active' ? 'Open alarm occurrences' : 'Alarm history'}</h3><p>{topLevelCount} top-level alarm row{topLevelCount === 1 ? '' : 's'} ({alarms.length} persisted occurrence{alarms.length === 1 ? '' : 's'}); {activeCount} condition{activeCount === 1 ? '' : 's'} currently {liveStateUnavailable ? 'last known active' : 'active'}.</p></div></header>
            {#if refreshing && !alarms.length}
                <div class="state compact">Loading occurrences…</div>
            {:else if !alarms.length}
                <div class="state compact">{viewMode === 'active' ? 'No active alarm occurrence.' : 'No alarm history has been recorded.'}</div>
            {:else}
                <div class="occurrences">
                    {#if sensorFailures.length}
                        <article class="occurrence sensor-group" class:condition-active={sensorFailures.some((alarm) => alarm.conditionActive)}>
                            <div class="occurrence-main sensor-main">
                                <div class="identity"><span class="status" class:active={sensorFailures.some((alarm) => alarm.conditionActive)}>{sensorFailures.some((alarm) => alarm.conditionActive) ? liveStateUnavailable ? 'LAST KNOWN ACTIVE' : 'ACTIVE' : sensorFailures.every((alarm) => !!alarm.clearedAt) ? 'CLEARED' : 'CLEARING'}</span><strong>Sensor / Module Failure</strong><small>{sensorFailures.length} persisted member occurrence{sensorFailures.length === 1 ? '' : 's'}</small></div>
                                <dl>
                                    <div><dt>Affected subjects</dt><dd>{sensorFailures.map((alarm) => alarm.cellIndex ? `Cell ${alarm.cellIndex}` : alarm.subjectKey).join(', ')}</dd></div>
                                    <div><dt>First raised</dt><dd>{date(sensorFailures.map((alarm) => alarm.raisedAt).filter((value): value is string => !!value).sort()[0] ?? null)}</dd></div>
                                    <div><dt>Open members</dt><dd>{sensorFailures.filter((alarm) => !alarm.clearedAt).length}</dd></div>
                                    <div><dt>{liveStateUnavailable ? 'Last frame details' : 'Live details'}</dt><dd>{sensorFrameDetails.length || '—'}</dd></div>
                                </dl>
                            </div>
                            <details>
                                <summary>Affected cells/modules and transition audit ({sensorFailures.length})</summary>
                                {#if sensorFrameDetails.length}
                                    <div class="sensor-live-details">
                                        {#each sensorFrameDetails as detail}
                                            <span><strong>{detail.cellIndex ? `Cell ${detail.cellIndex}` : 'String / module'}</strong>{detail.reason ?? 'Measurement unavailable'}</span>
                                        {/each}
                                    </div>
                                {/if}
                                <div class="sensor-members">
                                    {#each sensorFailures as alarm (alarm.id)}
                                        <article>
                                            <div><strong>{alarm.cellIndex ? `Cell ${alarm.cellIndex}` : alarm.subjectKey}</strong><span>Occurrence #{alarm.id} · {alarm.conditionActive && liveStateUnavailable ? 'LAST KNOWN ACTIVE' : alarm.status}</span><small>{alarm.triggerReason ?? 'No reason recorded'} · source {date(alarm.triggerCapturedAt)}</small></div>
                                            <details>
                                                <summary>Transitions ({alarm.transitions.length})</summary>
                                                {#if alarm.transitions.length}
                                                    <div class="transitions">
                                                        {#each alarm.transitions as transition}
                                                            <div><span>{label(transition.type)}</span><time>{date(transition.transitionedAt)}</time><small>{transition.actor ?? 'System'} · {transition.reason ?? 'No reason recorded'}</small></div>
                                                        {/each}
                                                    </div>
                                                {:else}<p class="provenance">No transition has been recorded.</p>{/if}
                                            </details>
                                        </article>
                                    {/each}
                                </div>
                            </details>
                        </article>
                    {/if}
                    {#each regularAlarms as alarm (alarm.id)}
                        <article class="occurrence" class:condition-active={alarm.conditionActive}>
                            <div class="occurrence-main">
                                <div class="identity"><span class="status" class:active={alarm.conditionActive}>{alarm.conditionActive ? evaluationUnavailable(alarm.alarm) ? 'LAST KNOWN ACTIVE' : 'ACTIVE' : alarm.status}</span><strong>{label(alarm.alarm)}</strong><small>#{alarm.id} · {alarm.subjectKey}{#if evaluationUnavailable(alarm.alarm)} · evaluation unavailable{/if}</small></div>
                                <dl>
                                    <div><dt>Raised</dt><dd>{date(alarm.raisedAt)}</dd></div>
                                    <div><dt>Observed</dt><dd>{number(alarm.triggerObservedValue)}</dd></div>
                                    <div><dt>Threshold</dt><dd>{number(alarm.triggerThresholdValue)}</dd></div>
                                    <div><dt>Lifecycle</dt><dd>{alarm.clearedAt ? `Auto-cleared · ${date(alarm.clearedAt)}` : alarm.conditionActive ? 'Condition active' : 'Clearing'}</dd></div>
                                </dl>
                            </div>
                            <details>
                                <summary>Details, provenance and transitions ({alarm.transitions.length})</summary>
                                <div class="detail-grid">
                                    <div><span>Trigger reason</span><strong>{alarm.triggerReason ?? '—'}</strong></div>
                                    <div><span>Trigger frame</span><strong>{alarm.triggerGeneration ?? '—'} / {alarm.triggerSequence ?? '—'} · {date(alarm.triggerCapturedAt)}</strong></div>
                                    <div><span>Condition cleared</span><strong>{date(alarm.conditionClearedAt)}</strong></div>
                                    <div><span>Occurrence closed</span><strong>{date(alarm.clearedAt)}</strong></div>
                                    <div><span>Policy</span><strong>v{alarm.policyVersion} · raise {alarm.raiseSamples} / clear {alarm.clearSamples}</strong></div>
                                    <div><span>Auto-clear policy</span><strong>{alarm.clearSamples} clear samples · hysteresis {alarm.hysteresisValue} {alarm.hysteresisUnit}</strong></div>
                                </div>
                                {#if alarm.reference}<p class="provenance">Initial Baseline event #{alarm.reference.calibrationEventId}, curve #{alarm.reference.curveVersionId}, process #{alarm.reference.calibrationProcessId}, hash {alarm.reference.contentHash}</p>{/if}
                                {#if alarm.transitions.length}
                                    <div class="transitions">
                                        {#each alarm.transitions as transition}
                                            <div><span>{label(transition.type)}</span><time>{date(transition.transitionedAt)}</time><small>{transition.actor ?? 'System'} · {transition.reason ?? 'No reason recorded'}</small></div>
                                        {/each}
                                    </div>
                                {/if}
                            </details>
                        </article>
                    {/each}
                </div>
            {/if}
        </section>
    {/if}
</section>

<style>
    .page{animation:in .18s ease;min-width:0}.page-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:16px}.page-head h2{display:flex;align-items:center;gap:9px;margin:0;color:#172b4d;font-size:24px;font-weight:500}.page-head p{margin:7px 0 0;color:#718096}.refresh{display:inline-flex;align-items:center;gap:7px;min-height:38px;padding:0 13px;border:1px solid #cbd8f5;border-radius:8px;color:#1749ad;background:#fff;cursor:pointer}.refresh:disabled{opacity:.55;cursor:not-allowed}:global(.spin){animation:spin .8s linear infinite}.toolbar{display:flex;align-items:flex-end;gap:14px;padding:14px 16px;border:1px solid #e1e7f0;border-radius:10px;background:#fff}.toolbar label{display:grid;gap:6px;min-width:240px;color:#536078;font-size:13px}.toolbar select{height:39px;padding:0 34px 0 10px;border:1px solid #d7dfeb;border-radius:7px;color:#273853;background:#fff}.view-switch{display:flex;padding:3px;border-radius:8px;background:#f0f3f8}.view-switch button{height:33px;padding:0 13px;border:0;border-radius:6px;color:#66748b;background:transparent;cursor:pointer}.view-switch button.active{color:#1749ad;background:#fff;box-shadow:0 1px 4px rgba(28,51,91,.12)}.updated{margin-left:auto;padding-bottom:9px;color:#8792a4;font-size:12px}.message{display:flex;align-items:center;gap:8px;margin-top:12px;padding:11px 13px;border:1px solid;border-radius:8px;font-size:13px}.error{color:#b42318;border-color:#f3cac6;background:#fff1f0}.warning{color:#8a5812;border-color:#f0d9a9;background:#fff9e9}.reference-warning{font-weight:500}.state{display:grid;min-height:220px;place-content:center;margin-top:14px;border:1px dashed #d7e0f1;border-radius:11px;color:#7b879a;background:rgba(255,255,255,.55);text-align:center}.state.compact{min-height:125px;margin:0;border:0;border-radius:0}.summary-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-top:14px}.summary-grid article{display:flex;align-items:center;gap:12px;padding:16px;border:1px solid #e1e7f0;border-radius:10px;color:#315ea9;background:#fff}.summary-grid article div{display:grid;gap:3px}.summary-grid span{color:#7d899d;font-size:12px}.summary-grid strong{color:#263858;font-size:20px;font-weight:600}.live-card,.alarms-card{margin-top:14px;border:1px solid #e1e7f0;border-radius:11px;background:#fff}.live-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1px;background:#edf0f4}.live-grid>div{display:grid;gap:4px;padding:15px;background:#fff}.live-grid span,.detail-grid span{color:#8792a4;font-size:12px}.live-grid strong,.detail-grid strong{color:#31415c;font-weight:500}.live-grid small{color:#8a95a7}.live-card details,.occurrence details{border-top:1px solid #edf0f4}.live-card summary,.occurrence summary{padding:12px 15px;color:#40516f;cursor:pointer;font-size:13px;font-weight:500}.reference-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;padding:0 15px 15px;color:#7d899d;font-size:12px}.reference-grid span{display:grid;gap:3px}.reference-grid strong{overflow-wrap:anywhere;color:#31415c;font-weight:500}.reference-grid .hash{grid-column:1/-1}.alarms-card>header{padding:15px 16px;border-bottom:1px solid #edf0f4}.alarms-card h3{margin:0;color:#31415c;font-size:16px;font-weight:500}.alarms-card header p{margin:4px 0 0;color:#8792a4;font-size:12px}.occurrences{display:grid}.occurrence+.occurrence{border-top:1px solid #edf0f4}.occurrence{border-left:3px solid transparent}.occurrence.condition-active{border-left-color:#e04f45}.occurrence-main{display:grid;grid-template-columns:minmax(190px,1.1fr) minmax(0,3fr);align-items:center;gap:14px;padding:14px}.identity{display:grid;grid-template-columns:max-content 1fr;align-items:center;gap:4px 8px;min-width:0}.identity strong{overflow:hidden;color:#2f405c;font-weight:500;text-overflow:ellipsis;white-space:nowrap}.identity small{grid-column:1/-1;color:#8792a4}.status{padding:3px 6px;border-radius:5px;color:#52705e;background:#edf7f1;font-size:10px;font-weight:600}.status.active{color:#a7372f;background:#fff0ee}.occurrence dl{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:0}.occurrence dl div{min-width:0}.occurrence dt{color:#8792a4;font-size:11px}.occurrence dd{overflow-wrap:anywhere;margin:4px 0 0;color:#40516f;font-size:12px}.detail-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;padding:2px 15px 13px}.detail-grid>div{display:grid;gap:3px}.detail-grid strong{overflow-wrap:anywhere;font-size:12px}.provenance{margin:0;padding:0 15px 13px;color:#718096;font-size:12px;overflow-wrap:anywhere}.transitions{display:grid;margin:0 15px 15px;border:1px solid #e5eaf2;border-radius:8px}.transitions>div{display:grid;grid-template-columns:150px 190px minmax(0,1fr);gap:8px;padding:9px 11px;color:#40516f;font-size:12px}.transitions>div+div{border-top:1px solid #edf0f4}.transitions small{color:#718096}@keyframes spin{to{transform:rotate(360deg)}}@keyframes in{from{opacity:0;transform:translateY(4px)}}
    .sensor-group{background:#fffdf8}.sensor-main{grid-template-columns:minmax(220px,1.1fr) minmax(0,3fr)}.sensor-live-details{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;padding:2px 15px 13px}.sensor-live-details span{display:grid;gap:3px;padding:9px;border-radius:7px;color:#6f5b3f;background:#fff8e8;font-size:12px}.sensor-live-details strong{color:#81521d}.sensor-members{display:grid;margin:0 15px 15px;border:1px solid #e5eaf2;border-radius:8px;background:#fff}.sensor-members>article{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:10px;padding:11px}.sensor-members>article+article{border-top:1px solid #edf0f4}.sensor-members>article>div{display:grid;gap:3px;min-width:0}.sensor-members strong{color:#31415c;font-size:13px;font-weight:500}.sensor-members span,.sensor-members small{overflow-wrap:anywhere;color:#718096;font-size:12px}.sensor-members>article>details{grid-column:1/-1;margin:0 -11px -11px}.sensor-members .transitions{margin-top:0}
    @media(max-width:1000px){.summary-grid{grid-template-columns:repeat(2,1fr)}.occurrence-main{grid-template-columns:1fr auto}.occurrence dl{grid-column:1/-1;grid-row:2}.reference-grid,.detail-grid{grid-template-columns:repeat(2,1fr)}}
    @media(max-width:650px){.page-head,.toolbar{align-items:stretch;flex-direction:column}.refresh{justify-content:center}.toolbar label{min-width:0}.view-switch button{flex:1}.updated{margin:0;padding:0}.summary-grid{grid-template-columns:1fr}.live-grid,.reference-grid,.detail-grid,.sensor-live-details{grid-template-columns:1fr}.reference-grid .hash{grid-column:auto}.occurrence-main,.sensor-main{grid-template-columns:1fr}.occurrence dl{grid-column:auto;grid-row:auto;grid-template-columns:repeat(2,1fr)}.transitions>div{grid-template-columns:1fr}.transitions time{color:#718096}.sensor-members>article{grid-template-columns:1fr}}
    @media(max-width:380px){.occurrence dl{grid-template-columns:1fr}.page-head h2{font-size:21px}}
</style>
