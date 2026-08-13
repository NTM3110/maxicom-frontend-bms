<script lang="ts">let{label,value=$bindable(''),type='text'}:{label:string;value?:string;type?:string}=$props();</script>
<label>{label}<input {type} bind:value/></label>
<style>label{display:grid;gap:6px;color:#536078;font-size:13px}input{width:100%;height:39px;padding:0 11px;border:1px solid #d7dfeb;border-radius:7px;color:#273853;background:#fff;font:inherit;font-size:14px}</style>
