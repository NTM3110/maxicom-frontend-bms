<script lang="ts">let { label, value }: { label:string; value:unknown } = $props();</script>
<div><span>{label}</span><strong>{String(value)}</strong></div>
<style>div{padding:11px;border-radius:8px;background:#f7f9fc}span,strong{display:block}span{color:#8792a4;font-size:11px}strong{margin-top:5px;color:#31415c;font-size:13px;font-weight:500}</style>
