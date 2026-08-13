<script lang="ts">let { value }: { value?:string[] } = $props();</script>
<div class="log"><strong>Task Log</strong><pre>{value?.join('\n') || 'No log yet.'}</pre></div>
<style>.log{margin-top:12px}.log>strong{color:#536078;font-size:12px}.log pre{max-height:130px;margin:6px 0 0;padding:10px;overflow:auto;border-radius:7px;color:#d9e3f8;background:#17233a;font:12px/1.5 monospace}</style>
