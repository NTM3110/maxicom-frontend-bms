<script lang="ts">
	import { onMount } from 'svelte';
	import { Check, Eye, EyeOff, LoaderCircle, LogIn, LogOut, Server, X } from '@lucide/svelte';
	import {
		authenticateBms,
		hasBmsSession,
		logoutBms,
		platformReady,
		resetBmsConnection
	} from '$lib/services/bms-api';

	let { onSessionChange }: { onSessionChange?: () => void } = $props();
	let dialogOpen = $state(false);
	let backendReady = $state(false);
	let checking = $state(true);
	let authenticated = $state(false);
	let submitting = $state(false);
	let showPassword = $state(false);
	let username = $state('');
	let password = $state('');
	let error = $state('');
	let backendError = $state('');

	onMount(() => {
		authenticated = hasBmsSession();
		void checkBackend();
	});

	async function checkBackend(forceReconnect = false) {
		checking = true;
		backendError = '';
		if (forceReconnect) resetBmsConnection();
		try {
			backendReady = await platformReady();
			if (!backendReady) backendError = 'OpenEMS responded, but the platform is not ready yet.';
			else onSessionChange?.();
		} catch (cause) {
			backendReady = false;
			backendError = cause instanceof Error ? cause.message : 'Unable to connect to OpenEMS.';
		} finally {
			checking = false;
		}
	}

	async function signIn() {
		if (!username.trim() || !password) {
			error = 'Enter both username and password.';
			return;
		}
		submitting = true;
		error = '';
		try {
			await authenticateBms(username.trim(), password);
			authenticated = true;
			password = '';
			dialogOpen = false;
			onSessionChange?.();
		} catch (cause) {
			error = cause instanceof Error ? cause.message : 'Unable to sign in to the BMS backend.';
		} finally {
			submitting = false;
		}
	}

	async function signOut() {
		submitting = true;
		error = '';
		try {
			await logoutBms();
			authenticated = false;
			dialogOpen = false;
			onSessionChange?.();
		} catch (cause) {
			error = cause instanceof Error ? cause.message : 'Unable to sign out from the BMS backend.';
		} finally {
			authenticated = hasBmsSession();
			submitting = false;
		}
	}
</script>

<button
	type="button"
	class:authenticated={authenticated && backendReady}
	class:unavailable={!checking && !backendReady}
	class="connection-button"
	onclick={() => { error = ''; dialogOpen = true; }}
	aria-label="BMS backend connection"
>
	{#if checking}<LoaderCircle class="spin" size={16} />{:else}<Server size={16} />{/if}
	<span class="status-dot"></span>
	<span class="connection-label">{checking ? 'Checking BMS' : authenticated && backendReady ? 'BMS connected' : backendReady ? 'Connect BMS' : 'BMS offline'}</span>
</button>

{#if dialogOpen}
	<div class="backdrop" role="presentation" onclick={() => !submitting && (dialogOpen = false)}>
		<dialog open aria-labelledby="bms-connection-title" onclick={(event) => event.stopPropagation()}>
			<header>
				<div class="header-icon"><Server size={20} /></div>
				<div>
					<h2 id="bms-connection-title">BMS connection</h2>
					<p>OpenEMS at 192.168.4.83:8085</p>
				</div>
				<button class="close" type="button" onclick={() => dialogOpen = false} disabled={submitting} aria-label="Close"><X size={19} /></button>
			</header>

			<div class:ready={backendReady} class="backend-status">
				<span></span>
				<div><strong>{checking ? 'Checking backend…' : backendReady ? 'Backend is ready' : 'Backend is unavailable'}</strong><small>{backendReady ? 'WebSocket JSON-RPC is accepting connections.' : backendError || 'Check the device network and OpenEMS service.'}</small></div>
				{#if !checking && !backendReady}<button type="button" onclick={() => checkBackend(true)}>Retry</button>{/if}
			</div>

			{#if authenticated}
				<section class="authenticated-panel">
					<div class="check"><Check size={19} /></div>
					<div><strong>{backendReady ? 'Authenticated session active' : 'Session saved · backend offline'}</strong><p>{backendReady ? 'BMS pages are using live backend data.' : 'Retry when the BMS device is reachable, or sign out to clear this session.'}</p></div>
				</section>
				{#if error}<p class="error">{error}</p>{/if}
				<footer><button class="secondary danger" type="button" onclick={signOut} disabled={submitting}><LogOut size={16} />{submitting ? 'Signing out…' : 'Sign out BMS'}</button></footer>
			{:else}
				<form onsubmit={(event) => { event.preventDefault(); void signIn(); }}>
					<label>Username<input bind:value={username} autocomplete="username" placeholder="Enter username" disabled={submitting} /></label>
					<label>Password<div class="password-field"><input type={showPassword ? 'text' : 'password'} bind:value={password} autocomplete="current-password" placeholder="Enter password" disabled={submitting} /><button type="button" onclick={() => showPassword = !showPassword} aria-label={showPassword ? 'Hide password' : 'Show password'}>{#if showPassword}<EyeOff size={18} />{:else}<Eye size={18} />{/if}</button></div></label>
					{#if error}<p class="error">{error}</p>{/if}
					<footer><button class="secondary" type="button" onclick={() => dialogOpen = false} disabled={submitting}>Cancel</button><button class="primary" type="submit" disabled={submitting || !backendReady}><LogIn size={16} />{submitting ? 'Connecting…' : 'Connect'}</button></footer>
				</form>
			{/if}
		</dialog>
	</div>
{/if}

<style>
	.connection-button{position:relative;display:inline-flex;align-items:center;gap:8px;height:36px;padding:0 12px;border:1px solid rgba(255,255,255,.17);border-radius:8px;color:#e7eeff;background:rgba(255,255,255,.09);cursor:pointer;font:inherit;font-size:13px;font-weight:400;white-space:nowrap}.connection-button:hover{background:rgba(255,255,255,.15)}.connection-button :global(svg){color:#fff}.status-dot{width:7px;height:7px;border-radius:50%;background:#f0a33a;box-shadow:0 0 0 3px rgba(240,163,58,.14)}.connection-button.authenticated .status-dot{background:#48d58a;box-shadow:0 0 0 3px rgba(72,213,138,.15)}.connection-button.unavailable .status-dot{background:#f06a63;box-shadow:0 0 0 3px rgba(240,106,99,.15)}:global(.spin){animation:spin .9s linear infinite}.backdrop{position:fixed;z-index:300;inset:0;display:grid;padding:20px;place-items:center;background:rgba(17,31,55,.38);backdrop-filter:blur(2px)}dialog{position:relative;inset:auto;width:min(440px,100%);max-height:calc(100vh - 40px);margin:0;padding:0;overflow:auto;border:0;border-radius:12px;color:#283953;background:#fff;box-shadow:0 24px 60px rgba(20,38,70,.22);font:inherit}header{display:flex;align-items:center;gap:12px;padding:20px 22px 17px;border-bottom:1px solid #e8edf4}.header-icon{display:grid;width:38px;height:38px;place-items:center;border-radius:9px;color:#2054b8;background:#edf3ff}.header-icon :global(svg){color:inherit}header h2{margin:0;font-size:20px;font-weight:500;letter-spacing:-.01em}header p{margin:3px 0 0;color:#7a879c;font-size:13px}.close{display:grid;width:34px;height:34px;margin-left:auto;padding:0;place-items:center;border:0;border-radius:7px;color:#758197;background:transparent;cursor:pointer}.close:hover{background:#f3f6fa}.backend-status{display:flex;align-items:center;gap:11px;margin:18px 22px 0;padding:12px 13px;border:1px solid #f0d7d5;border-radius:9px;background:#fff8f7}.backend-status>span{width:8px;height:8px;border-radius:50%;background:#df6259}.backend-status.ready{border-color:#cde8d8;background:#f4fbf7}.backend-status.ready>span{background:#39aa69}.backend-status div{display:grid;gap:2px;min-width:0}.backend-status strong{font-size:14px;font-weight:500}.backend-status small{color:#7a879b;font-size:12px}.backend-status button{margin-left:auto;border:0;color:#2051ad;background:transparent;cursor:pointer;font:inherit;font-size:13px}form{display:grid;gap:15px;padding:20px 22px 0}label{display:grid;gap:7px;color:#46566f;font-size:14px}input{width:100%;height:42px;padding:0 12px;border:1px solid #d6dfec;border-radius:8px;outline:0;color:#263952;background:#fff;font:inherit;font-size:15px;font-weight:400}input:focus{border-color:#6c94df;box-shadow:0 0 0 3px rgba(52,103,200,.09)}.password-field{position:relative}.password-field input{padding-right:44px}.password-field button{position:absolute;top:4px;right:4px;display:grid;width:34px;height:34px;padding:0;place-items:center;border:0;border-radius:6px;color:#748198;background:transparent;cursor:pointer}.password-field button :global(svg){color:inherit}.error{margin:0;padding:10px 12px;border-radius:8px;color:#a43d35;background:#fff2f0;font-size:13px;line-height:1.4}.authenticated-panel{display:flex;align-items:flex-start;gap:12px;margin:20px 22px 0;padding:15px;border-radius:9px;background:#f4faf6}.check{display:grid;width:32px;height:32px;place-items:center;border-radius:50%;color:#fff;background:#39a768}.check :global(svg){color:#fff}.authenticated-panel strong{font-size:15px;font-weight:500}.authenticated-panel p{margin:4px 0 0;color:#718097;font-size:13px}footer{display:flex;justify-content:flex-end;gap:9px;margin-top:4px;padding:15px 0 20px;border-top:1px solid #e9edf3}form footer{margin-top:2px}.authenticated-panel+footer{margin:18px 22px 0}.secondary,.primary{display:inline-flex;align-items:center;justify-content:center;gap:7px;min-height:39px;padding:0 14px;border-radius:8px;cursor:pointer;font:inherit;font-size:14px;font-weight:400}.secondary{border:1px solid #d6dfeb;color:#485a74;background:#fff}.primary{border:1px solid #1e52b9;color:#fff;background:#1e52b9}.primary :global(svg){color:#fff}.danger{color:#b1423a}.primary:disabled,.secondary:disabled,.close:disabled{cursor:default;opacity:.55}@keyframes spin{to{transform:rotate(360deg)}}@media(max-width:720px){.connection-label{display:none}.connection-button{width:36px;padding:0;justify-content:center}.status-dot{position:absolute;right:5px;bottom:5px;width:6px;height:6px}dialog{width:min(420px,100%)}header{padding:17px 18px}.backend-status{margin:15px 18px 0}form{padding:18px 18px 0}.authenticated-panel{margin:18px 18px 0}.authenticated-panel+footer{margin-right:18px;margin-left:18px}}
</style>
