<script lang="ts">import type { Snippet } from 'svelte';let{title,children}:{title:string;children:Snippet}=$props();</script>
<section class="panel"><h3>{title}</h3>{@render children()}</section>
<style>.panel{padding:18px;border:1px solid #e1e7f0;border-radius:11px;background:#fff}.panel h3{margin:0 0 15px;color:#31415c;font-size:16px;font-weight:500}</style>
