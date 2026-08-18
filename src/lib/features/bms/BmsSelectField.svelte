<script lang="ts">
	import { onMount } from 'svelte';

	type Option = { value: string | number; label: string; disabled?: boolean };

	let {
		value,
		options,
		disabled = false,
		ariaLabel,
		onChange
	}: {
		value: string | number;
		options: Option[];
		disabled?: boolean;
		ariaLabel: string;
		onChange: (value: string | number) => void;
	} = $props();

	let open = $state(false);
	let root = $state<HTMLDivElement>();
	let selected = $derived(options.find((option) => option.value === value) ?? options[0]);

	onMount(() => {
		const close = (event: MouseEvent) => {
			if (root && !root.contains(event.target as Node)) open = false;
		};
		document.addEventListener('click', close);
		return () => document.removeEventListener('click', close);
	});

	function choose(option: Option) {
		if (option.disabled) return;
		onChange(option.value);
		open = false;
	}
</script>

<div class="select-field" bind:this={root}>
	<button class:open class="trigger" type="button" aria-label={ariaLabel} aria-haspopup="listbox" aria-expanded={open} disabled={disabled} onclick={() => open = !open} onkeydown={(event) => { if (event.key === 'Escape') open = false; }}>
		<span>{selected?.label ?? 'Select an option'}</span><i aria-hidden="true"></i>
	</button>
	{#if open}
		<div class="menu" role="listbox" aria-label={ariaLabel}>
			{#each options as option}
				<button class:selected={option.value === value} type="button" role="option" aria-selected={option.value === value} disabled={option.disabled} onclick={() => choose(option)}>{option.label}</button>
			{/each}
		</div>
	{/if}
</div>

<style>
	.select-field{position:relative}.trigger{display:flex;align-items:center;justify-content:space-between;width:100%;min-height:41px;padding:0 12px;border:1px solid #e4eaf2;border-radius:9px;color:#2d405e;background:#fbfcfe;box-shadow:inset 0 1px 2px rgba(35,54,89,.025);font:inherit;font-size:13px;text-align:left;cursor:pointer;transition:border-color .16s ease,box-shadow .16s ease,background-color .16s ease}.trigger:hover{border-color:#c7d4e5;background:#fff}.trigger.open,.trigger:focus-visible{outline:none;border-color:#7e9fd3;background:#fff;box-shadow:0 0 0 3px rgba(50,99,174,.12)}.trigger:disabled{opacity:.55;cursor:not-allowed}.trigger i{width:7px;height:7px;margin-left:12px;border-right:1.5px solid #71809a;border-bottom:1.5px solid #71809a;transform:rotate(45deg) translateY(-2px);transition:transform .16s ease}.trigger.open i{transform:rotate(225deg) translate(-2px,-1px)}.menu{position:absolute;z-index:20;top:calc(100% + 6px);right:0;left:0;display:grid;gap:3px;max-height:245px;padding:5px;overflow:auto;border:1px solid #e6edf6;border-radius:10px;background:#fff;box-shadow:0 14px 30px rgba(35,54,89,.14)}.menu button{min-height:36px;padding:0 10px;border:0;border-radius:7px;color:#40516f;background:transparent;font:inherit;font-size:13px;text-align:left;cursor:pointer}.menu button:hover,.menu button:focus-visible{outline:none;color:#1749ad;background:#f0f5fd}.menu button.selected{color:#1749ad;background:#eaf2ff;font-weight:500}.menu button:disabled{opacity:.5;cursor:not-allowed}
</style>
