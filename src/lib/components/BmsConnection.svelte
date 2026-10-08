<script lang="ts">
	import { onMount } from 'svelte';
	import { Check, Eye, EyeOff, LoaderCircle, LogIn, LogOut, RefreshCw, Server, X } from '@lucide/svelte';
	import {
		authenticateBms,
		clearBmsSession,
		getBmsTimeStatus,
		hasBmsSession,
		logoutBms,
		platformReady,
		resetBmsConnection
	} from '$lib/services/bms-api';
	import {
		getBackendSettings,
		saveBackendSettings,
		type BackendSettings
	} from '$lib/services/backend-settings';
	import { checkRtsConnection, resetRtsConnection } from '$lib/services/rts-api';

	let { product = 'unified', onSessionChange, sessionRevision = 0 }: { product?: 'bms' | 'rts' | 'unified'; onSessionChange?: () => void; sessionRevision?: number } = $props();
	let dialogOpen = $state(false);
	let settings = $state<BackendSettings>({ bmsHost: '', rtsHost: '' });
	let savedSettings = $state<BackendSettings>({ bmsHost: '', rtsHost: '' });
	let bmsReady = $state(false);
	let rtsReady = $state(false);
	let bmsChecking = $state(true);
	let rtsChecking = $state(true);
	let authenticated = $state(false);
	let saving = $state(false);
	let submitting = $state(false);
	let showPassword = $state(false);
	let username = $state('admin');
	let password = $state('');
	let formError = $state('');
	let bmsError = $state('');
	let rtsError = $state('');
	let authError = $state('');
	let applianceTime = $state('');
	let applianceTimezone = $state('');
	let bmsOnly = $derived(product === 'bms');
	let connectedCount = $derived((bmsReady ? 1 : 0) + (!bmsOnly && rtsReady ? 1 : 0));
	let expectedCount = $derived(bmsOnly ? 1 : 2);
	let checkingAny = $derived(bmsChecking || (!bmsOnly && rtsChecking));
	let connectionLabel = $derived(
		bmsOnly
			? checkingAny ? 'Checking BMS backend' : bmsReady ? 'BMS backend connected' : 'BMS backend offline'
			: checkingAny ? 'Checking backends' : connectedCount === 2 ? 'Backends connected' : connectedCount === 1 ? '1 backend connected' : 'Backends offline'
	);

	function anchoredDeviceTime(value: string) {
		const instant = Date.parse(value);
		const match = /(Z|[+-]\d{2}:\d{2})$/.exec(value);
		if (!Number.isFinite(instant) || !match) return null;
		const offsetLabel = match[1] === 'Z' ? '+00:00' : match[1];
		const sign = offsetLabel[0] === '-' ? -1 : 1;
		const offsetMinutes = sign * (Number(offsetLabel.slice(1, 3)) * 60 + Number(offsetLabel.slice(4, 6)));
		return { instant, sampledAt: Date.now(), offsetMinutes, offsetLabel };
	}

	function formatDeviceTime(anchor: NonNullable<ReturnType<typeof anchoredDeviceTime>>) {
		const date = new Date(anchor.instant + (Date.now() - anchor.sampledAt) + anchor.offsetMinutes * 60_000);
		const part = (value: number) => String(value).padStart(2, '0');
		return `${date.getUTCFullYear()}-${part(date.getUTCMonth() + 1)}-${part(date.getUTCDate())} ${part(date.getUTCHours())}:${part(date.getUTCMinutes())}:${part(date.getUTCSeconds())} ${anchor.offsetLabel}`;
	}

	$effect(() => {
		sessionRevision;
		if (!authenticated || !bmsReady) {
			applianceTime = '';
			applianceTimezone = '';
			return;
		}
		let active = true;
		let refreshRunning = false;
		let anchor: ReturnType<typeof anchoredDeviceTime> = null;
		const refresh = async () => {
			if (refreshRunning) return;
			refreshRunning = true;
			try {
				const status = await getBmsTimeStatus();
				const next = status.currentTime ? anchoredDeviceTime(status.currentTime) : null;
				if (!active) return;
				if (next) {
					anchor = next;
					applianceTime = formatDeviceTime(next);
					applianceTimezone = status.timezone ?? '';
				} else {
					anchor = null;
					applianceTime = '';
					applianceTimezone = '';
				}
			} catch {
				// Time status is supplementary; do not change the backend connection indicator.
				if (active) {
					anchor = null;
					applianceTime = '';
					applianceTimezone = '';
				}
			} finally {
				refreshRunning = false;
			}
		};
		void refresh();
		const tick = setInterval(() => {
			if (anchor) applianceTime = formatDeviceTime(anchor);
		}, 1000);
		const resync = setInterval(() => void refresh(), 60_000);
		return () => {
			active = false;
			clearInterval(tick);
			clearInterval(resync);
		};
	});

	$effect(() => {
		sessionRevision;
		authenticated = hasBmsSession();
	});

	onMount(() => {
		const stored = getBackendSettings();
		settings = { ...stored };
		savedSettings = { ...stored };
		authenticated = hasBmsSession();
		if (bmsOnly) {
			rtsChecking = false;
			void checkBms();
		} else {
			void Promise.all([checkBms(), checkRts()]);
		}
	});

	async function checkBms(forceReconnect = false) {
		bmsChecking = true;
		bmsError = '';
		if (forceReconnect) resetBmsConnection();
		try {
			bmsReady = await platformReady();
			if (!bmsReady) bmsError = 'OpenEMS responded, but the platform is not ready.';
			else onSessionChange?.();
		} catch (cause) {
			bmsReady = false;
			bmsError = cause instanceof Error ? cause.message : 'Unable to connect to OpenEMS.';
		} finally {
			bmsChecking = false;
		}
	}

	async function checkRts(forceReconnect = false) {
		rtsChecking = true;
		rtsError = '';
		if (forceReconnect) resetRtsConnection();
		try {
			await checkRtsConnection();
			rtsReady = true;
			onSessionChange?.();
		} catch (cause) {
			rtsReady = false;
			rtsError = cause instanceof Error ? cause.message : 'Unable to connect to the RTS backend.';
		} finally {
			rtsChecking = false;
		}
	}

	async function saveAndConnect() {
		saving = true;
		formError = '';
		try {
			const normalized = saveBackendSettings(settings, bmsOnly ? 'bms' : 'all');
			const bmsChanged = normalized.bmsHost !== savedSettings.bmsHost;
			const rtsChanged = normalized.rtsHost !== savedSettings.rtsHost;
			settings = { ...normalized };
			savedSettings = { ...normalized };
			if (bmsChanged) {
				resetBmsConnection();
				clearBmsSession();
				authenticated = false;
			}
			if (!bmsOnly && rtsChanged) resetRtsConnection();
			if (bmsOnly) await checkBms();
			else await Promise.all([checkBms(), checkRts()]);
			onSessionChange?.();
		} catch (cause) {
			formError = cause instanceof Error ? cause.message : 'Unable to save backend addresses.';
		} finally {
			saving = false;
		}
	}

	async function signInBms() {
		if (!username.trim() || !password) {
			authError = 'Enter both username and password.';
			return;
		}
		submitting = true;
		authError = '';
		try {
			await authenticateBms(username.trim(), password);
			authenticated = true;
			password = '';
			onSessionChange?.();
		} catch (cause) {
			authError = cause instanceof Error ? cause.message : 'Unable to authenticate with the BMS backend.';
		} finally {
			submitting = false;
		}
	}

	async function signOutBms() {
		submitting = true;
		authError = '';
		try {
			await logoutBms();
		} catch (cause) {
			authError = cause instanceof Error ? cause.message : 'Unable to close the BMS session.';
		} finally {
			authenticated = hasBmsSession();
			submitting = false;
			onSessionChange?.();
		}
	}

	function openDialog() {
		formError = '';
		authError = '';
		dialogOpen = true;
	}
</script>

<button
	type="button"
	class:connected={connectedCount === expectedCount}
	class:partial={!bmsOnly && connectedCount === 1}
	class:unavailable={!checkingAny && connectedCount === 0}
	class="connection-button"
	onclick={openDialog}
	aria-label="Backend connections"
>
	{#if checkingAny}<LoaderCircle class="spin" size={16} />{:else}<Server size={16} />{/if}
	<span class="status-dot"></span>
	<span class="connection-label">
		{connectionLabel}
	</span>
	{#if applianceTime}<span class="device-time" aria-label="Current appliance time">Device {applianceTime}{#if applianceTimezone} · {applianceTimezone}{/if}</span>{/if}
</button>

{#if dialogOpen}
	<div class="backdrop" role="presentation" onclick={() => !saving && !submitting && (dialogOpen = false)}>
		<dialog open aria-labelledby="backend-connection-title" onclick={(event) => event.stopPropagation()}>
			<header class="dialog-header">
				<div class="header-icon"><Server size={20} /></div>
				<div><h2 id="backend-connection-title">{bmsOnly ? 'BMS backend connection' : 'Backend connections'}</h2><p>Choose the device providing each backend.</p></div>
				<button class="close" type="button" onclick={() => dialogOpen = false} disabled={saving || submitting} aria-label="Close"><X size={19} /></button>
			</header>

			<form class="settings-form" onsubmit={(event) => { event.preventDefault(); void saveAndConnect(); }}>
				<div class:single={bmsOnly} class="connection-grid">
					<section class="backend-card">
						<div class="card-heading">
							<div><span>BMS</span><strong>OpenEMS backend</strong></div>
							<em class:online={bmsReady} class:checking={bmsChecking}>{bmsChecking ? 'Checking' : bmsReady ? 'Connected' : 'Offline'}</em>
						</div>
						<label>Backend IP<input bind:value={settings.bmsHost} placeholder="192.168.4.83" disabled={saving} /></label>
						<p class="ports">127.0.0.1 means the device serving this page, via /websocket and /rest.</p>
						<p class="ports">Other addresses connect directly: WebSocket :8085 · REST :8888.</p>
						{#if bmsError}<p class="connection-error">{bmsError}</p>{/if}
						<button class="retry" type="button" onclick={() => checkBms(true)} disabled={bmsChecking || saving}><RefreshCw size={15} />Retry BMS</button>
					</section>

					{#if !bmsOnly}<section class="backend-card">
						<div class="card-heading">
							<div><span>RTS</span><strong>Energy backend</strong></div>
							<em class:online={rtsReady} class:checking={rtsChecking}>{rtsChecking ? 'Checking' : rtsReady ? 'Connected' : 'Offline'}</em>
						</div>
						<label>Backend IP<input bind:value={settings.rtsHost} placeholder="100.125.139.45" disabled={saving} /></label>
						<p class="ports">HTTP :80 · WebSocket /jsonrpc</p>
						{#if rtsError}<p class="connection-error">{rtsError}</p>{/if}
						<button class="retry" type="button" onclick={() => checkRts(true)} disabled={rtsChecking || saving}><RefreshCw size={15} />Retry RTS</button>
					</section>{/if}
				</div>

				{#if formError}<p class="form-error" role="alert">{formError}</p>{/if}
				<footer class="settings-footer"><button class="secondary" type="button" onclick={() => dialogOpen = false} disabled={saving}>Cancel</button><button class="primary" type="submit" disabled={saving}>{#if saving}<LoaderCircle class="spin" size={16} />{:else}<Server size={16} />{/if}{saving ? 'Connecting…' : 'Save & connect'}</button></footer>
			</form>

			<section class="bms-session">
				<div class="session-heading"><div><span>BMS session</span><p>{authenticated ? 'The live BMS API session is authenticated.' : 'Authenticate after the BMS backend is reachable.'}</p></div>{#if authenticated}<i><Check size={15} />Active</i>{/if}</div>
				{#if authenticated}
					<div class="session-actions">{#if authError}<p class="form-error">{authError}</p>{/if}<button class="secondary danger" type="button" onclick={signOutBms} disabled={submitting}><LogOut size={16} />{submitting ? 'Signing out…' : 'Disconnect BMS session'}</button></div>
			{:else}
					<form class="auth-form" onsubmit={(event) => { event.preventDefault(); void signInBms(); }}>
						<label>Username<input bind:value={username} autocomplete="username" disabled={submitting} /></label>
						<label>Password<div class="password-field"><input bind:value={password} type={showPassword ? 'text' : 'password'} autocomplete="current-password" disabled={submitting} /><button type="button" onclick={() => showPassword = !showPassword} aria-label={showPassword ? 'Hide password' : 'Show password'}>{#if showPassword}<EyeOff size={18} />{:else}<Eye size={18} />{/if}</button></div></label>
						{#if authError}<p class="form-error">{authError}</p>{/if}
						<button class="primary" type="submit" disabled={submitting || !bmsReady}><LogIn size={16} />{submitting ? 'Connecting…' : 'Connect BMS session'}</button>
					</form>
				{/if}
			</section>
		</dialog>
	</div>
{/if}

<style>
	.connection-button{position:relative;display:inline-flex;align-items:center;gap:8px;height:36px;padding:0 12px;border:1px solid rgba(255,255,255,.17);border-radius:8px;color:#e7eeff;background:rgba(255,255,255,.09);cursor:pointer;font:inherit;font-size:13px;font-weight:400;white-space:nowrap}.connection-button:hover{background:rgba(255,255,255,.15)}.connection-button :global(svg){color:#fff}.device-time{margin-left:2px;padding-left:9px;border-left:1px solid rgba(255,255,255,.2);font-variant-numeric:tabular-nums;color:#fff}.status-dot{width:7px;height:7px;border-radius:50%;background:#f0a33a;box-shadow:0 0 0 3px rgba(240,163,58,.14)}.connection-button.connected .status-dot{background:#48d58a;box-shadow:0 0 0 3px rgba(72,213,138,.15)}.connection-button.partial .status-dot{background:#f0a33a}.connection-button.unavailable .status-dot{background:#f06a63;box-shadow:0 0 0 3px rgba(240,106,99,.15)}:global(.spin){animation:spin .9s linear infinite}
	.backdrop{position:fixed;z-index:300;inset:0;display:grid;padding:18px;place-items:center;background:rgba(17,31,55,.38);backdrop-filter:blur(2px)}dialog{position:relative;inset:auto;display:flex;width:min(730px,100%);max-height:calc(100vh - 36px);margin:0;padding:0;overflow:hidden;flex-direction:column;border:0;border-radius:12px;color:#283953;background:#fff;box-shadow:0 24px 60px rgba(20,38,70,.22);font:inherit}.dialog-header{display:flex;align-items:center;gap:12px;padding:19px 22px 16px;border-bottom:1px solid #e8edf4}.header-icon{display:grid;width:38px;height:38px;place-items:center;border-radius:9px;color:#2054b8;background:#edf3ff}.dialog-header h2{margin:0;font-size:20px;font-weight:500;letter-spacing:-.01em}.dialog-header p{margin:3px 0 0;color:#7a879c;font-size:13px}.close{display:grid;width:34px;height:34px;margin-left:auto;padding:0;place-items:center;border:0;border-radius:7px;color:#758197;background:transparent;cursor:pointer}.close:hover{background:#f3f6fa}.settings-form{min-height:0;overflow:auto;padding:19px 22px 0}.connection-grid{display:grid;grid-template-columns:1fr 1fr;gap:13px}.connection-grid.single{grid-template-columns:1fr}.backend-card{padding:15px;border:1px solid #e0e6ef;border-radius:10px;background:#fbfcfe}.card-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:15px}.card-heading div{display:grid;gap:3px}.card-heading span{color:#2754b5;font-size:12px;font-weight:500;letter-spacing:.05em}.card-heading strong{color:#31415c;font-size:15px;font-weight:500}.card-heading em{padding:4px 7px;border-radius:11px;color:#a2453e;background:#fff0ee;font-size:11px;font-style:normal}.card-heading em.online{color:#27764d;background:#eaf8ef}.card-heading em.checking{color:#7b622d;background:#fff7e5}.backend-card label,.auth-form label{display:grid;gap:6px;color:#536078;font-size:13px}.backend-card input,.auth-form input{width:100%;height:39px;padding:0 10px;border:1px solid #d6dfec;border-radius:7px;outline:0;color:#273853;background:#fff;font:inherit;font-size:14px;font-weight:400}.backend-card input:focus,.auth-form input:focus{border-color:#6c94df;box-shadow:0 0 0 3px rgba(52,103,200,.08)}.ports{margin:8px 0 0;color:#8a95a7;font-size:12px}.connection-error{min-height:34px;margin:11px 0 0;color:#a2463f;font-size:12px;line-height:1.4}.retry{display:inline-flex;align-items:center;gap:6px;margin-top:10px;padding:0;border:0;color:#2854ad;background:transparent;cursor:pointer;font:inherit;font-size:13px}.retry:disabled{cursor:wait;opacity:.55}.settings-footer{display:flex;justify-content:flex-end;gap:8px;margin-top:17px;padding:13px 0 15px;border-top:1px solid #e9edf3}.primary,.secondary{display:inline-flex;align-items:center;justify-content:center;gap:7px;min-height:39px;padding:0 14px;border-radius:8px;cursor:pointer;font:inherit;font-size:14px;font-weight:400}.secondary{border:1px solid #d6dfeb;color:#485a74;background:#fff}.primary{border:1px solid #1e52b9;color:#fff;background:#1e52b9}.primary :global(svg){color:#fff}.primary:disabled,.secondary:disabled,.close:disabled{cursor:default;opacity:.55}.form-error{margin:10px 0 0;padding:9px 11px;border-radius:7px;color:#a43d35;background:#fff2f0;font-size:13px;line-height:1.4}
	.bms-session{flex:0 0 auto;padding:16px 22px 19px;border-top:1px solid #e8edf4;background:#fafbfd}.session-heading{display:flex;align-items:center;justify-content:space-between;gap:12px}.session-heading span{color:#31415c;font-size:14px;font-weight:500}.session-heading p{margin:3px 0 0;color:#7d899c;font-size:12px}.session-heading i{display:inline-flex;align-items:center;gap:5px;padding:5px 8px;border-radius:12px;color:#27764d;background:#eaf8ef;font-size:12px;font-style:normal}.session-actions{display:flex;align-items:center;justify-content:flex-end;gap:10px;margin-top:12px}.session-actions .form-error{margin:0 auto 0 0}.danger{color:#b1423a}.auth-form{display:grid;grid-template-columns:1fr 1fr auto;align-items:end;gap:10px;margin-top:13px}.auth-form .form-error{grid-column:1/-1;margin:0}.password-field{position:relative}.password-field input{padding-right:42px}.password-field button{position:absolute;top:3px;right:3px;display:grid;width:33px;height:33px;padding:0;place-items:center;border:0;border-radius:6px;color:#748198;background:transparent;cursor:pointer}.password-field button:hover{background:#f1f4f8}@keyframes spin{to{transform:rotate(360deg)}}
	@media(max-width:1100px){.device-time{display:none}}
	@media(max-width:760px){.connection-label,.device-time{display:none}.connection-button{width:36px;padding:0;justify-content:center}.status-dot{position:absolute;right:5px;bottom:5px;width:6px;height:6px}.backdrop{padding:10px}dialog{max-height:calc(100vh - 20px)}.dialog-header{padding:16px 17px}.settings-form{padding:16px 17px 0}.bms-session{padding:14px 17px 17px}}
	@media(max-width:610px){.connection-grid{grid-template-columns:1fr}.auth-form{grid-template-columns:1fr}.auth-form .primary{width:100%}.dialog-header p{display:none}}
</style>
