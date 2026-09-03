<script lang="ts">
	import { Bell, ChevronDown, LogOut, Menu, RefreshCw, UserRound } from '@lucide/svelte';
	import { onMount } from 'svelte';
	import AppSidebar from '$lib/components/AppSidebar.svelte';
	import BmsConnection from '$lib/components/BmsConnection.svelte';
	import LoginPage from '$lib/components/LoginPage.svelte';
	import BatteryStringsPage from '$lib/features/bms/BatteryStringsPage.svelte';
	import BmsDashboardPage from '$lib/features/bms/BmsDashboardPage.svelte';
	import AssetManagementPage from '$lib/features/bms/AssetManagementPage.svelte';
	import AccountWorkspace from '$lib/features/system/AccountWorkspace.svelte';
	import DischargeCalibrationPage from '$lib/features/bms/DischargeCalibrationPage.svelte';
	import EmailAlertsPage from '$lib/features/bms/EmailAlertsPage.svelte';
	import MaintenancePage from '$lib/features/bms/MaintenancePage.svelte';
	import SystemInfoPage from '$lib/features/system/SystemInfoPage.svelte';
	import SerialTcpPage from '$lib/features/connectivity/SerialTcpPage.svelte';
	import NetworkPage from '$lib/features/connectivity/NetworkPage.svelte';
	import HybridControllerPage from '$lib/features/rts/HybridControllerPage.svelte';
	import DeviceConfigurationPage from '$lib/features/rts/DeviceConfigurationPage.svelte';
	import VpnPage from '$lib/features/rts/VpnPage.svelte';
	import RtsStatusPage from '$lib/features/rts/RtsStatusPage.svelte';
	import { getDefaultItem, getNavigationForConfig, loadDeviceConfig, type DeviceConfig } from '$lib/device-config';
	import { accountItem, navigationGroups, type NavigationItem } from '$lib/navigation';
	import { currentAppUser, signOutApp, type AppUser } from '$lib/services/app-auth';
	import { authenticateBms, logoutBms } from '$lib/services/bms-api';

	let sidebarCollapsed = $state(false);
	let compactViewport = $state(false);
	let activeItem = $state<NavigationItem>(navigationGroups[0].items[0]);
	let deviceConfig = $state<DeviceConfig | null>(null);
	let bmsSessionRevision = $state(0);
	let authReady = $state(false);
	let currentUser = $state<AppUser | null>(null);
	let userMenuOpen = $state(false);
	let calibrationStringIndex = $state(0);
	let calibrationEventId = $state(0);
	let visibleGroups = $derived(deviceConfig ? getNavigationForConfig(deviceConfig) : navigationGroups);
	let effectiveSidebarCollapsed = $derived(sidebarCollapsed || compactViewport);

	onMount(() => {
		void loadDeviceConfig().then((config) => {
			deviceConfig = config;
			activeItem = getDefaultItem(config);
			currentUser = currentAppUser();
			authReady = true;
		});

		const media = window.matchMedia('(max-width: 620px)');
		const updateViewportMode = () => compactViewport = media.matches;
		updateViewportMode();
		media.addEventListener('change', updateViewportMode);
		return () => media.removeEventListener('change', updateViewportMode);
	});

	function selectItem(item: NavigationItem) {
		if (item.id === 'calibration') calibrationEventId = 0;
		activeItem = item;
	}

	function openCalibration(stringIndex: number, eventId = 0) {
		calibrationStringIndex = stringIndex;
		calibrationEventId = eventId;
		const item = visibleGroups.flatMap((group) => group.items).find((entry) => entry.id === 'calibration');
		if (item) activeItem = item;
	}

	function handleAuthenticated(user: AppUser, password: string) {
		currentUser = user;
		if (deviceConfig?.device.product !== 'rts') {
			void authenticateBms(user.username, password)
				.then(() => bmsSessionRevision += 1)
				.catch(() => undefined);
		}
	}

	function handleSignOut() {
		userMenuOpen = false;
		signOutApp();
		currentUser = null;
		void logoutBms().catch(() => undefined);
	}

	function openAccount() {
		selectItem(accountItem);
		userMenuOpen = false;
	}

</script>

<svelte:head>
	<title>{currentUser ? `${activeItem.label} | ${deviceConfig?.device.name ?? 'MAXiCom'}` : 'Sign in | MAXiCom'}</title>
</svelte:head>

<svelte:window onclick={() => userMenuOpen = false} onkeydown={(event) => event.key === 'Escape' && (userMenuOpen = false)} />

{#if !authReady}
	<div class="auth-loading"><img src="/brand/maxicom-logo.png" alt="MAXiCom" /><span></span></div>
{:else if !currentUser}
	<LoginPage config={deviceConfig} onAuthenticated={handleAuthenticated} />
{:else}
<div class:sidebar-collapsed={effectiveSidebarCollapsed} class="application-shell">
	<AppSidebar collapsed={effectiveSidebarCollapsed} activeItem={activeItem.id} groups={visibleGroups} onSelect={selectItem} onSignOut={handleSignOut} />

	<section class="workspace">
		<header class="topbar">
			{#if !compactViewport}
				<button class="menu-toggle" type="button" onclick={() => sidebarCollapsed = !sidebarCollapsed} aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
					<Menu size={21} strokeWidth={2.2} aria-hidden="true" />
				</button>
			{/if}
			<div class="page-heading">
				<h1>{activeItem.label}</h1>
				<p>{deviceConfig?.device.subtitle ?? 'MAXiCom energy management platform'}</p>
			</div>
			<div class="topbar-actions">
				<BmsConnection product={deviceConfig?.device.product} sessionRevision={bmsSessionRevision} onSessionChange={() => bmsSessionRevision += 1} />
				<button class="notification-button" type="button" aria-label="Notifications"><Bell size={20} strokeWidth={2} aria-hidden="true" /></button>
				<div class="user-menu-wrap">
					<button class="user-menu-trigger" type="button" onclick={(event) => { event.stopPropagation(); userMenuOpen = !userMenuOpen; }} aria-haspopup="menu" aria-expanded={userMenuOpen}>
						<span class="user-avatar" aria-hidden="true">{currentUser.username.slice(0, 2).toUpperCase()}</span>
						<span class="user-details"><strong>{currentUser.username}</strong><small>{currentUser.role}</small></span>
						<ChevronDown class={userMenuOpen ? 'user-chevron open' : 'user-chevron'} size={16} aria-hidden="true" />
					</button>
					{#if userMenuOpen}
						<div class="user-menu" role="menu">
							<div class="user-menu-heading"><span class="menu-avatar">{currentUser.username.slice(0, 2).toUpperCase()}</span><div><strong>{currentUser.username}</strong><small>{currentUser.role}</small></div></div>
							<button type="button" role="menuitem" onclick={openAccount}><UserRound size={17} />Account</button>
							<button class="menu-sign-out" type="button" role="menuitem" onclick={handleSignOut}><LogOut size={17} />Sign out</button>
						</div>
					{/if}
				</div>
			</div>
		</header>

		<main class="content" aria-label="Application content">
			{#key bmsSessionRevision}
			{#if activeItem.id === 'dashboard'}
				<BmsDashboardPage onOpenCalibration={openCalibration} />
			{:else if activeItem.id === 'status'}
				<RtsStatusPage config={deviceConfig} />
			{:else if activeItem.id === 'battery-strings'}
				<BatteryStringsPage />
			{:else if activeItem.id === 'system-info'}
				<SystemInfoPage config={deviceConfig} />
			{:else if activeItem.id === 'serial-tcp'}
				<SerialTcpPage config={deviceConfig} />
			{:else if activeItem.id === 'network'}
				<NetworkPage config={deviceConfig} />
			{:else if activeItem.id === 'vpn'}
				<VpnPage />
			{:else if activeItem.id === 'hybrid-controller'}
				<HybridControllerPage />
			{:else if activeItem.id === 'inverters'}
				<DeviceConfigurationPage kind="inverters" config={deviceConfig} />
			{:else if activeItem.id === 'meters'}
				<DeviceConfigurationPage kind="meters" config={deviceConfig} />
			{:else if activeItem.id === 'data-loggers'}
				<DeviceConfigurationPage kind="data-loggers" config={deviceConfig} />
			{:else if activeItem.id === 'ess'}
				<DeviceConfigurationPage kind="ess" config={deviceConfig} />
			{:else if activeItem.id === 'wika'}
				<DeviceConfigurationPage kind="wika" config={deviceConfig} />
			{:else if activeItem.id === 'calibration'}
				<DischargeCalibrationPage initialStringIndex={calibrationStringIndex} initialEventId={calibrationEventId} />
			{:else if activeItem.id === 'assets'}
				<AssetManagementPage />
			{:else if activeItem.id === 'alerts'}
				<EmailAlertsPage />
			{:else if activeItem.id === 'maintenance'}
				<MaintenancePage />
			{:else if activeItem.id === 'account'}
				<AccountWorkspace config={deviceConfig} />
			{:else}
				<div class="content-toolbar">
					<div><h2>{activeItem.label}</h2><p>Content is being migrated from the existing MAXiCom applications.</p></div>
					<button class="refresh-button" type="button"><RefreshCw size={17} aria-hidden="true" /> Refresh</button>
				</div>
				<section class="empty-content"><span>Coming soon</span><p>This area will contain the {activeItem.label.toLowerCase()} workspace.</p></section>
			{/if}
			{/key}
		</main>
	</section>
</div>
{/if}

<style>
	:global(*) { box-sizing: border-box; }
	:global(html), :global(body) { margin: 0; min-width: 320px; min-height: 100%; }
	:global(body) { color: #18233a; background: #f5f7fc; font-family: "Neue Haas Grotesk Text Pro", "Neue Haas Grotesk Display Pro", "Helvetica Neue", Arial, sans-serif; font-synthesis: none; font-weight:400; letter-spacing:0; -webkit-font-smoothing:antialiased; -moz-osx-font-smoothing:grayscale; text-rendering:optimizeLegibility; }
	button { font: inherit; }
	.auth-loading{display:grid;min-height:100vh;place-content:center;justify-items:center;gap:22px;background:#f5f7fc}.auth-loading img{width:190px;max-height:38px;object-fit:contain}.auth-loading span{width:26px;height:26px;border:2px solid #dbe4f4;border-top-color:#1749ad;border-radius:50%;animation:auth-spin .8s linear infinite}@keyframes auth-spin{to{transform:rotate(360deg)}}
	.application-shell { display: grid; grid-template-columns: 250px minmax(0, 1fr); min-height: 100vh; background: #f5f7fc; transition: grid-template-columns .24s ease; }
	.application-shell.sidebar-collapsed { grid-template-columns: 62px minmax(0, 1fr); }
	.workspace { display: flex; flex-direction: column; min-width: 0; }
	.topbar { display: flex; align-items: center; gap: 15px; height: 66px; padding: 0 24px; color: #fff; background: linear-gradient(100deg, #092f91 0%, #082a83 100%); box-shadow: 0 2px 10px rgba(7, 38, 119, .22); }
	.menu-toggle, .notification-button { display: grid; place-items: center; width: 38px; height: 38px; border: 0; border-radius: 8px; color: white; background: rgba(255,255,255,.1); cursor: pointer; }
	.menu-toggle:hover, .notification-button:hover { background: rgba(255,255,255,.18); }
	.page-heading { line-height: 1.12; }
	.page-heading h1 { margin: 0; font-size: 21px; font-weight: 600; letter-spacing: -.01em; }
	.page-heading p { margin: 4px 0 0; color: #c1d1ff; font-size: 13px; }
	.topbar-actions { display: flex; align-items: center; gap: 10px; margin-left: auto; }
	.user-menu-wrap { position: relative; }
	.user-menu-trigger { display:flex;align-items:center;gap:9px;min-height:42px;padding:4px 5px;border:0;border-radius:8px;color:#fff;background:transparent;cursor:pointer;text-align:left; }
	.user-menu-trigger:hover,.user-menu-trigger[aria-expanded="true"] { background:rgba(255,255,255,.1); }
	.user-avatar { display: grid; place-items: center; width: 34px; height: 34px; border-radius: 50%; color: #18419b; background: #fff; font-size: 12px; font-weight: 600; }
	.user-details { display: grid; gap: 3px; line-height: 1; }
	.user-details strong { font-size: 15px; font-weight: 500; }.user-details small { color: #c1d1ff; font-size: 12px; }:global(.user-chevron) { color: #cad7fd;transition:transform .16s ease; }:global(.user-chevron.open){transform:rotate(180deg)}
	.user-menu { position:absolute;z-index:250;top:calc(100% + 9px);right:0;width:220px;padding:7px;border:1px solid #dfe5ee;border-radius:10px;color:#354761;background:#fff;box-shadow:0 16px 38px rgba(18,37,70,.18); }
	.user-menu-heading { display:flex;align-items:center;gap:10px;margin:2px 2px 7px;padding:9px 9px 12px;border-bottom:1px solid #edf0f4; }
	.menu-avatar { display:grid;width:34px;height:34px;place-items:center;border-radius:50%;color:#fff;background:#1749ad;font-size:12px;font-weight:500; }
	.user-menu-heading div { display:grid;gap:4px; }.user-menu-heading strong{font-size:14px;font-weight:500}.user-menu-heading small{color:#8994a6;font-size:12px}
	.user-menu>button { display:flex;align-items:center;gap:9px;width:100%;height:38px;padding:0 10px;border:0;border-radius:7px;color:#526079;background:transparent;cursor:pointer;font:inherit;font-size:14px;text-align:left; }
	.user-menu>button:hover { color:#1749ad;background:#f2f5fb; }.user-menu>button.menu-sign-out{color:#c9362c}.user-menu>button.menu-sign-out:hover{color:#b42318;background:#fff1f0}
	.content { flex: 1; padding: 30px; }
	.content-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 20px; margin-bottom: 20px; }.content-toolbar h2 { margin: 0; color: #172b4d; font-size: 24px; font-weight: 600; line-height: 1.2; }.content-toolbar p { margin: 5px 0 0; color: #718096; font-size: 16px; }
	.refresh-button { display: inline-flex; align-items: center; gap: 8px; min-height: 40px; padding: 0 14px; border: 1px solid #cbd8f5; border-radius: 8px; color: #1749ad; background: #fff; cursor: pointer; font-size: 15px; font-weight: 500; }.refresh-button:hover { background: #f2f6ff; }
	.empty-content { display: grid; min-height: calc(100vh - 187px); place-content: center; border: 1px dashed #d7e0f1; border-radius: 14px; color: #7b879a; background: rgba(255,255,255,.42); text-align: center; }.empty-content span { color: #263858; font-size: 19px; font-weight: 600; }.empty-content p { margin: 8px 0 0; font-size: 16px; }
	/* Shared content scale: keep dense embedded layouts readable without enlarging the shell. */
	.content :global(.card p),
	.content :global(.panel p),
	.content :global(.table-card p),
	.content :global(.reference p),
	.content :global(article p),
	.content :global(.muted),
	.content :global(.hint) { font-size: 15px; line-height: 1.45; }
	.content :global(.card header p),
	.content :global(.panel header p),
	.content :global(.panel-title p),
	.content :global(.section-title p) { font-size: 14px; }
	.content :global(.card label),
	.content :global(.panel label),
	.content :global(.table-card label),
	.content :global(dialog label) { font-size: 15px; }
	.content :global(input),
	.content :global(select),
	.content :global(textarea),
	.content :global(.flat-select > button),
	.content :global(.flat-select .options button) { font-size: 15px; }
	.content :global(table td) { font-size: 15px; }
	.content :global(table th) { font-size: 13px; }
	.content :global(.card small),
	.content :global(.panel small),
	.content :global(.table-card small),
	.content :global(article small) { font-size: 14px; line-height: 1.4; }
	.content :global(.card article > span),
	.content :global(.panel article > span),
	.content :global(.card-grid article > span),
	.content :global(.health-grid span),
	.content :global(.capability-grid span),
	.content :global(.summary-grid span) { font-size: 14px; }
	.content :global(.notice),
	.content :global(.message),
	.content :global(.request-error),
	.content :global(.error) { font-size: 14px; }
	/* Icons on solid primary actions must keep enough contrast against the blue surface. */
	.content :global(button.primary svg),
	.content :global(button.primary-button svg) { color: #fff !important; stroke: #fff; }
	@media (max-width: 620px) { .application-shell, .application-shell.sidebar-collapsed { grid-template-columns: 62px minmax(0, 1fr); }.user-menu-trigger .user-details, .user-menu-trigger :global(.user-chevron) { display: none; }.topbar { height: 60px; padding: 0 16px; }.page-heading h1 { font-size: 19px; }.page-heading p { display: none; }.content { padding: 20px; }.content-toolbar h2 { font-size: 22px; }.content-toolbar p { font-size: 15px; }.refresh-button { padding: 0 11px; }.empty-content { min-height: calc(100vh - 157px); } }
	@media (max-width: 520px) { .content { padding: 16px; } }
	@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: .01ms !important; transition-duration: .01ms !important; } }
</style>
