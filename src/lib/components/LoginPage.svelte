<script lang="ts">
	import { Eye, EyeOff, LoaderCircle } from '@lucide/svelte';
	import type { DeviceConfig } from '$lib/device-config';
	import { signInApp, type AppUser } from '$lib/services/app-auth';

	let { config, onAuthenticated }: {
		config: DeviceConfig | null;
		onAuthenticated: (user: AppUser, password: string) => void;
	} = $props();

	let username = $state('admin');
	let password = $state('');
	let showPassword = $state(false);
	let submitting = $state(false);
	let error = $state('');

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		error = '';
		if (!username.trim() || !password) {
			error = 'Enter both username and password.';
			return;
		}
		submitting = true;
		try {
			const user = await signInApp(username, password, config);
			onAuthenticated(user, password);
		} catch (cause) {
			error = cause instanceof Error ? cause.message : 'Unable to sign in.';
		} finally {
			submitting = false;
		}
	}
</script>

<svelte:head><title>Sign in | MAXiCom</title></svelte:head>

<main class="login-page">
	<section class="login-card">
		<div class="form-side">
			<img class="logo" src="/brand/maxicom-logo.png" alt="MAXiCom" />
			<form onsubmit={submit}>
				<label>
					<span>Username</span>
					<input bind:value={username} autocomplete="username" spellcheck="false" />
				</label>
				<label>
					<span>Password</span>
					<div class="password-field">
						<input bind:value={password} type={showPassword ? 'text' : 'password'} autocomplete="current-password" placeholder="Enter your password" />
						<button class="reveal" type="button" onclick={() => showPassword = !showPassword} aria-label={showPassword ? 'Hide password' : 'Show password'}>
							{#if showPassword}<EyeOff size={18} />{:else}<Eye size={18} />{/if}
						</button>
					</div>
				</label>

				{#if error}<p class="error" role="alert">{error}</p>{/if}

				<button class="submit" type="submit" disabled={submitting}>
					{#if submitting}<LoaderCircle class="spin" size={18} />{/if}
					{submitting ? 'Signing in…' : 'Sign in'}
				</button>
			</form>

			<p class="default-account">Default account: <span>admin / admin</span></p>
			<footer>© 2026 AT Energy JSC.</footer>
		</div>
	</section>
</main>

<style>
	:global(*){box-sizing:border-box}:global(html),:global(body){margin:0;min-width:320px;min-height:100%}:global(body){font-family:"Neue Haas Grotesk Text Pro","Neue Haas Grotesk Display Pro","Helvetica Neue",Arial,sans-serif;font-synthesis:none;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale}
	.login-page{display:grid;min-height:100vh;padding:22px;place-items:center;color:#263952;background:#f5f7fc}
	.login-card{width:min(410px,100%);overflow:hidden;border:1px solid #dfe6f0;border-radius:13px;background:#fff;box-shadow:0 14px 38px rgba(29,48,82,.08)}
	.form-side{display:flex;min-width:0;flex-direction:column;padding:36px 38px 24px}.form-side>form,.default-account{width:100%;margin-right:auto;margin-left:auto}.logo{display:block;width:180px;max-height:38px;margin:0 auto 32px;object-fit:contain}
	form{display:grid;gap:17px}label{display:grid;gap:7px;color:#46556e;font-size:14px}input{width:100%;height:43px;padding:0 12px;border:1px solid #d5deea;border-radius:7px;outline:0;color:#263952;background:#fff;font:inherit;font-size:15px;font-weight:400}input:focus{border-color:#6f96de;box-shadow:0 0 0 3px rgba(43,93,188,.08)}.password-field{position:relative}.password-field input{padding-right:46px}.reveal{position:absolute;top:5px;right:5px;display:grid;width:33px;height:33px;padding:0;place-items:center;border:0;border-radius:6px;color:#77869d;background:transparent;cursor:pointer}.reveal:hover{background:#f2f5f9}.error{margin:0;padding:10px 12px;border:1px solid #f1d1cd;border-radius:7px;color:#a43d35;background:#fff5f3;font-size:13px;line-height:1.4}.submit{display:flex;width:100%;height:43px;align-items:center;justify-content:center;gap:8px;border:0;border-radius:7px;color:#fff;background:#1749ad;cursor:pointer;font:inherit;font-size:15px;font-weight:400}.submit:hover{background:#103d95}.submit:disabled{cursor:wait;opacity:.7}.submit :global(svg){color:#fff}.submit :global(.spin){animation:spin .8s linear infinite}.default-account{margin-top:17px;color:#8591a3;font-size:13px;text-align:center}.default-account span{color:#52627b}.form-side footer{margin-top:27px;padding-top:18px;border-top:1px solid #edf0f4;color:#9aa4b3;font-size:12px;text-align:center}@keyframes spin{to{transform:rotate(360deg)}}
	@media(max-width:520px){.login-page{padding:16px}.login-card{border-radius:11px}.form-side{padding:31px 24px 22px}.logo{width:170px;margin-bottom:28px}}
	@media(max-height:560px){.login-page{align-items:start}.login-card{margin-top:12px}.form-side{padding-top:26px;padding-bottom:18px}.logo{margin-bottom:22px}.form-side footer{margin-top:20px}}
</style>
