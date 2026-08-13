<script lang="ts">let{label,value}:{label:string;value:unknown}=$props();</script>
<label>{label}<input value={String(value)} disabled/></label>
<style>label{display:grid;gap:6px;color:#536078;font-size:13px}input{width:100%;height:39px;padding:0 11px;border:1px solid #d7dfeb;border-radius:7px;color:#718096;background:#f5f7fa;font:inherit;font-size:14px}</style>
