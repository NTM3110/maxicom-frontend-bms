<script lang="ts">
	import type { BmsModbusRegisterMap } from '$lib/services/bms-api';

	let { map }: { map: BmsModbusRegisterMap } = $props();
	let stringId = $state(1);

	function address(relativeAddress: number) {
		return stringId * map.stringStride + relativeAddress;
	}

	function bitMask(bit: number) {
		return `0x${(1 << bit).toString(16).padStart(4, '0').toUpperCase()}`;
	}
</script>

<section class="register-map" aria-labelledby="register-map-title">
	<header>
		<div>
			<h3 id="register-map-title">Data and register list</h3>
			<p>Read-only FC{map.functionCode} Input Registers · contract v{map.version}</p>
		</div>
		<label for="register-string-id">String ID
			<select id="register-string-id" bind:value={stringId}>
				{#each Array.from({ length: map.maxStringId }, (_, index) => index + 1) as id}
					<option value={id}>{id}</option>
				{/each}
			</select>
		</label>
	</header>

	<div class="content">
		<p class="explanation">
			Addresses below are one-based references for String {stringId}. The protocol offset is the displayed address minus 1.
			Each measurement uses two registers: signed 32-bit, high word first. Decode with <code>modpoll -t 3:i32 -i</code>, then divide the raw value by its scale.
		</p>
		<div class="table-scroll">
			<table>
				<caption>String {stringId} measurement registers</caption>
				<thead><tr><th scope="col">Address</th><th scope="col">Data</th><th scope="col">Format</th><th scope="col">Scale</th><th scope="col">Unit</th></tr></thead>
				<tbody>
					{#each map.measurements as measurement (measurement.relativeAddress)}
						<tr>
							<td class="address">{address(measurement.relativeAddress)}–{address(measurement.relativeAddress + measurement.registerCount - 1)}</td>
							<td>{measurement.label}</td>
							<td>{measurement.type === 'SIGNED_32' ? 'Signed 32-bit' : measurement.type}</td>
							<td>÷ {measurement.scale}</td>
							<td>{measurement.unit}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
		<p class="note">Raw value <code>{map.unavailableS32}</code> means unavailable; it is not a measurement. For example, raw voltage 23128 with scale 100 means 231.28 V.</p>

		<h4>Alarm registers</h4>
		<div class="table-scroll">
			<table>
				<caption>String {stringId} alarm masks</caption>
				<thead><tr><th scope="col">Address</th><th scope="col">Register</th><th scope="col">Format</th><th scope="col">Meaning</th></tr></thead>
				<tbody>
					<tr><td class="address">{address(map.alarmActiveRelativeAddress)}</td><td>Alarm Active Mask</td><td>Unsigned 16-bit</td><td>1 = alarm active, when its validity bit is 1</td></tr>
					<tr><td class="address">{address(map.alarmValidityRelativeAddress)}</td><td>Alarm Validity Mask</td><td>Unsigned 16-bit</td><td>1 = alarm evaluation available</td></tr>
				</tbody>
			</table>
		</div>
		<div class="table-scroll alarm-bits">
			<table>
				<caption>Bit positions shared by both alarm masks</caption>
				<thead><tr><th scope="col">Bit</th><th scope="col">Mask</th><th scope="col">Alarm</th></tr></thead>
				<tbody>
					{#each map.alarmBits as alarm (alarm.bit)}
						<tr><td>{alarm.bit}</td><td class="address">{bitMask(alarm.bit)}</td><td>{alarm.label}</td></tr>
					{/each}
				</tbody>
			</table>
		</div>
		<p class="note">If a validity bit is 0, ignore the matching active bit. Both masks are 0 when no monitoring frame is available; bits 12–15 are unused.</p>
	</div>
</section>

<style>
	.register-map{margin-top:16px;border:1px solid #e1e7f0;border-radius:12px;background:#fff;overflow:hidden}
	header{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:18px 20px;border-bottom:1px solid #e8edf5}
	h3{margin:0;color:#263858;font-size:16px;font-weight:500}
	header p{margin:4px 0 0;color:#7b879a;font-size:13px}
	label{display:flex;align-items:center;gap:9px;white-space:nowrap;color:#536078;font-size:13px}
	select{min-width:80px;height:36px;padding:0 9px;border:1px solid #d7dfeb;border-radius:7px;background:#fff;color:#273853;font:inherit}
	.content{padding:18px 20px}
	.explanation,.note{margin:0 0 16px;color:#61708a;font-size:13px;line-height:1.55}
	.note{margin:12px 0 20px}
	.note:last-child{margin-bottom:0}
	code{padding:2px 4px;border-radius:4px;background:#f1f4f9;color:#31415c}
	h4{margin:24px 0 12px;color:#263858;font-size:14px;font-weight:500}
	.table-scroll{overflow-x:auto;border:1px solid #e1e7f0;border-radius:8px}
	.alarm-bits{margin-top:12px}
	table{width:100%;min-width:600px;border-collapse:collapse;text-align:left;font-size:13px}
	caption{padding:10px 12px;background:#f7f9fc;color:#536078;text-align:left;font-weight:500}
	th,td{padding:9px 12px;border-top:1px solid #e8edf5}
	th{color:#697993;background:#fafbfe;font-size:12px;font-weight:500}
	td{color:#34445f}
	.address{white-space:nowrap;font-variant-numeric:tabular-nums;color:#2454b6}
	tbody tr:nth-child(even){background:#fcfdff}
	@media(max-width:680px){header{align-items:flex-start;flex-direction:column}.content{padding:16px}}
</style>
