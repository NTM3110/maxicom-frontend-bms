<script lang="ts">
	import type { Component, Snippet } from 'svelte';
	let { icon: Icon, title, text, children }: { icon: Component; title: string; text: string; children: Snippet } = $props();
</script>

<section class="card">
	<Icon size={21} />
	<h3>{title}</h3>
	<p>{text}</p>
	<div class="actions">{@render children()}</div>
</section>

<style>
	.card{padding:18px;border:1px solid #e1e7f0;border-radius:11px;background:#fff}.card > :global(svg){color:#315db7}.card h3{margin:11px 0 6px;color:#31415c;font-size:16px;font-weight:500}.card p{min-height:54px;margin:0;color:#7d899b;font-size:13px;line-height:1.5}.actions{display:flex;flex-wrap:wrap;gap:7px;margin-top:14px}
</style>
