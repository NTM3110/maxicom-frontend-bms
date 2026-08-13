<script lang="ts">
	import type { Component } from 'svelte';
	let { icon: Icon, title, text }: { icon: Component; title: string; text: string } = $props();
</script>

<header><span><Icon size={19}/></span><div><h3>{title}</h3><p>{text}</p></div></header>

<style>
	header{display:flex;align-items:center;gap:11px;padding:16px 18px;border-bottom:1px solid #edf0f4}span{display:grid;width:34px;height:34px;place-items:center;border-radius:8px;color:#2855b4;background:#eaf0ff}h3{margin:0;color:#31415c;font-size:16px;font-weight:500}p{margin:4px 0 0;color:#8792a4;font-size:12px}
</style>
