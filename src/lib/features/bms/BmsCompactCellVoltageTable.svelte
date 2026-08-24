<script lang="ts">
	export type CompactCellVoltage = {
		id: number;
		voltage: number | null;
		quality?: string | null;
		availabilityWarning?: string | null;
	};

	let { cells, ariaLabel = 'Cell voltage', emptyMessage = 'No cell telemetry returned',
		title = 'Cell Data · Voltage', expectedCount = cells.length }: {
		cells: CompactCellVoltage[];
		ariaLabel?: string;
		emptyMessage?: string;
		title?: string;
		expectedCount?: number;
	} = $props();

	let groups = $derived.by(() => {
		const result: CompactCellVoltage[][] = [[], [], []];
		cells.forEach((cell, index) => result[index % 3].push(cell));
		return result;
	});

	function value(input: number | null, digits = 3) {
		return input === null || !Number.isFinite(input) ? '—' : input.toFixed(digits);
	}

	function issue(cell: CompactCellVoltage) {
		return cell.quality !== null && cell.quality !== undefined && cell.quality !== 'VALID'
			|| Boolean(cell.availabilityWarning?.trim());
	}

	function issueDescription(cell: CompactCellVoltage) {
		const parts = [cell.quality && cell.quality !== 'VALID' ? `Quality: ${cell.quality}` : null, cell.availabilityWarning?.trim() || null]
			.filter((part): part is string => Boolean(part));
		return parts.join('. ');
	}
</script>

{#if cells.length}
	<section class="cell-panel">
		<header><h4>{title}</h4><p>{cells.length} of {expectedCount} configured cells returned by the BMS.</p></header>
		<div class="cell-scroll">
			<div class="cell-grid">
				{#each groups as group, groupIndex}
					<div class="cell-card">
						<table aria-label={`${ariaLabel} group ${groupIndex + 1}`}>
							<thead><tr><th>Cell ID</th><th>Voltage (V)</th></tr></thead>
							<tbody>
								{#each group as cell (cell.id)}
									{@const invalid = issue(cell)}
									<tr class:invalid-cell={invalid} title={invalid ? issueDescription(cell) : undefined}>
										<td class="cell-id"><span>#{cell.id}</span>{#if invalid}<span class="status-flag" aria-hidden="true">Check</span><span class="sr-only">Attention: {issueDescription(cell)}</span>{/if}</td>
										<td>{value(cell.voltage)}</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{/each}
			</div>
		</div>
	</section>
{:else}
	<p class="empty">{emptyMessage}</p>
{/if}

<style>
	.cell-panel{overflow:hidden;border:1px solid #dfe6f0;border-radius:11px;background:#fff}.cell-panel header{padding:14px 15px;border-bottom:1px solid #e8edf4}.cell-panel h4{margin:0;color:#293b58;font-size:15px;font-weight:500}.cell-panel header p{margin:4px 0 0;color:#7d899b;font-size:12px}.cell-scroll{max-height:480px;padding:14px;overflow:auto;scrollbar-gutter:stable}.cell-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;align-items:start}.cell-card{overflow:hidden;border:1px solid #e0e6ef;border-radius:9px;background:#fff;box-shadow:0 1px 3px rgba(30,49,80,.045)}table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{width:50%;padding:9px 7px;text-align:center;vertical-align:middle}th{position:sticky;z-index:2;top:-14px;border-bottom:1px solid #dfe6ef;color:#65738a;background:#f5f7fb;font-size:11px;font-weight:500;line-height:1.25;text-transform:uppercase}td{height:43px;border-top:1px solid #edf1f6;color:#40506a;font-size:14px;font-weight:400;font-variant-numeric:tabular-nums}tbody tr:first-child td{border-top:0}.cell-id{color:#2450a5;text-align:left}.status-flag{display:inline-flex;align-items:center;margin-left:6px;padding:2px 4px;border:1px solid #e6bd50;border-radius:4px;color:#725318;background:#fff3bf;font-size:9px;font-weight:700;text-transform:uppercase}.invalid-cell td{color:#725718;background:#fff4c9}.invalid-cell .cell-id{color:#76571b}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}.empty{margin:0;padding:22px 14px;color:#718096;font-size:13px;text-align:center}@media(max-width:1120px){.cell-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:760px){.cell-grid{grid-template-columns:1fr}.cell-scroll{max-height:520px;padding:12px}th{top:-12px}}
</style>
