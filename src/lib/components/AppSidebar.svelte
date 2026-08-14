<script lang="ts">
	import { LogOut, Settings } from '@lucide/svelte';
	import { accountItem, type NavigationItem } from '$lib/navigation';

	let {
		collapsed = false,
		activeItem = 'dashboard',
		groups,
		onSelect,
		onSignOut
	}: {
		collapsed?: boolean;
		activeItem?: string;
		groups: { label?: string; items: NavigationItem[] }[];
		onSelect: (item: NavigationItem) => void;
		onSignOut: () => void;
	} = $props();

	function select(item: NavigationItem) {
		onSelect(item);
	}

	const AccountIcon = accountItem.icon;
</script>

<aside class:collapsed class="sidebar" aria-label="Main navigation">
	<div class="brand">
		<img class="full-logo" src="/brand/maxicom-logo.png" alt="MAXiCom" />
		<img class="compact-logo" src="/brand/at-energy-key-visual.png" alt="AT Energy" />
	</div>

	<nav class="navigation">
		{#each groups as group}
			<section class="navigation-group">
				{#if group.label}<p class="group-label">{group.label}</p>{/if}
				{#each group.items as item}
					{@const Icon = item.icon}
					<button
						class:active={activeItem === item.id}
						class="navigation-item"
						type="button"
						onclick={() => select(item)}
						title={collapsed ? item.label : undefined}
					>
						<Icon size={20} strokeWidth={2} aria-hidden="true" />
						<span>{item.label}</span>
					</button>
				{/each}
			</section>
		{/each}
	</nav>

	<div class="sidebar-footer">
		<button class:active={activeItem === accountItem.id} class="navigation-item" type="button" onclick={() => select(accountItem)} title={collapsed ? accountItem.label : undefined}>
			<AccountIcon size={20} strokeWidth={2} aria-hidden="true" />
			<span>{accountItem.label}</span>
		</button>
		<button class="navigation-item" type="button" title={collapsed ? 'Settings' : undefined}>
			<Settings size={20} strokeWidth={2} aria-hidden="true" /><span>Settings</span>
		</button>
		<button class="navigation-item sign-out" type="button" onclick={onSignOut} title={collapsed ? 'Sign out' : undefined}>
			<LogOut size={20} strokeWidth={2} aria-hidden="true" /><span>Sign out</span>
		</button>
	</div>
</aside>

<style>
	.sidebar { z-index: 2; display: flex; flex-direction: column; min-height: 100vh; overflow: hidden; background: #fff; border-right: 1px solid #e5e9f2; }
	.brand { height: 66px; display: grid; place-items: center; padding: 14px 18px; border-bottom: 1px solid #edf0f5; }
	.brand img { display: block; object-fit: contain; }
	.full-logo { width: 180px; max-height: 32px; }
	.compact-logo { display: none !important; width: 29px; height: 29px; object-position: left; }
	.navigation { flex: 1; padding: 12px 10px 20px; overflow-y: auto; }
	.navigation-group + .navigation-group { margin-top: 20px; }
	.group-label { margin: 0 0 7px; padding: 0 10px; color: #98a2b3; font-size: 11px; font-weight: 600; letter-spacing: .065em; }
	.navigation-item { display: flex; align-items: center; gap: 12px; width: 100%; min-height: 44px; padding: 0 10px; border: 0; border-radius: 8px; color: #526079; background: transparent; cursor: pointer; font-family: inherit; font-size: 16px; font-weight: 400; line-height: 1; text-align: left; white-space: nowrap; }
	.navigation-item:hover { color: #1749ad; background: #f3f6fd; }
	.navigation-item.active { color: #1749ad; background: #e9efff; font-weight: 500; }
	.navigation-item :global(svg) { flex: 0 0 auto; }
	.sidebar-footer { padding: 10px; border-top: 1px solid #edf0f5; }
	.sign-out { color: #d92d20; }
	.sign-out:hover { color: #b42318; background: #fff1f0; }
	.collapsed .full-logo { display: none; }
	.collapsed .compact-logo { display: block !important; }
	.collapsed .brand { padding: 14px; }
	.collapsed .navigation, .collapsed .sidebar-footer { padding-left: 8px; padding-right: 8px; }
	.collapsed .group-label { display: none; }
	.collapsed .navigation-group + .navigation-group { margin-top: 14px; }
	.collapsed .navigation-item { justify-content: center; padding: 0; }
	.collapsed .navigation-item span { display: none; }
</style>
