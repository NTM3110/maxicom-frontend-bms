<script lang="ts">
	let { children } = $props();
</script>

<svelte:head>
	<title>MAXiCom</title>
	<meta name="description" content="MAXiCom energy management platform" />
</svelte:head>

{@render children()}
