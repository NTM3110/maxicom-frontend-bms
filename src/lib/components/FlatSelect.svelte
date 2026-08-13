<script lang="ts">
	import { ChevronDown } from '@lucide/svelte';

	let {
		value = $bindable(''),
		options = [],
		placeholder = 'Select an option',
		ariaLabel = 'Select an option'
	}: {
		value?: string;
		options?: Array<string | { value: string; label: string }>;
		placeholder?: string;
		ariaLabel?: string;
	} = $props();

	let open = $state(false);

	function optionValue(option: string | { value: string; label: string }) { return typeof option === 'string' ? option : option.value; }
	function optionLabel(option: string | { value: string; label: string }) { return typeof option === 'string' ? option : option.label; }
	let selectedLabel = $derived(options.find((option) => optionValue(option) === value));

	function choose(option: string | { value: string; label: string }) {
		value = optionValue(option);
		open = false;
	}
</script>

<div class="flat-select">
	<button type="button" class:open aria-haspopup="listbox" aria-expanded={open} aria-label={ariaLabel} onclick={() => open = !open}>
		<span class:placeholder={!value}>{selectedLabel ? optionLabel(selectedLabel) : value || placeholder}</span><ChevronDown size={17} />
	</button>
	{#if open}
		<div class="options" role="listbox" aria-label={ariaLabel}>
			{#each options as option}
				<button type="button" class:selected={value === optionValue(option)} role="option" aria-selected={value === optionValue(option)} onclick={() => choose(option)}>{optionLabel(option)}</button>
			{/each}
		</div>
	{/if}
</div>

<style>
	.flat-select { position:relative; }.flat-select > button { display:flex; align-items:center; justify-content:space-between; width:100%; height:38px; padding:0 10px 0 11px; border:1px solid #d7dfeb; border-radius:7px; color:#273853; background:#fff; cursor:pointer; font:inherit; font-size:14px; text-align:left; }.flat-select > button:hover { border-color:#bfcce1; }.flat-select > button.open { border-color:#3764c0; box-shadow:0 0 0 3px rgba(55,100,192,.12); }.flat-select > button :global(svg) { flex:0 0 auto; color:#6c7b93; transition:transform .15s ease; }.flat-select > button.open :global(svg) { transform:rotate(180deg); }.placeholder { color:#7d899b; }.options { position:absolute; z-index:5; top:calc(100% + 5px); right:0; left:0; overflow:hidden; border:1px solid #d7dfeb; border-radius:8px; background:#fff; box-shadow:0 8px 18px rgba(31,53,87,.12); }.options button { display:block; width:100%; min-height:34px; padding:0 11px; border:0; color:#354562; background:#fff; cursor:pointer; font:inherit; font-size:14px; text-align:left; }.options button:hover,.options button.selected { color:#19489e; background:#edf3ff; }
</style>
