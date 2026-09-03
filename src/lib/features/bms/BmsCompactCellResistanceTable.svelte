<script lang="ts">
	export type CompactCellResistance = {
		cellId: number;
		resistanceMohm: number | null;
		quality?: string | null;
		availabilityWarning?: string | null;
	};

	let { cells, expectedCount = cells.length, description = `${cells.length} of ${expectedCount} cells recorded for this demo event.` }: {
		cells: CompactCellResistance[];
		expectedCount?: number;
		description?: string;
	} = $props();

	let groups = $derived.by(() => {
		const result: CompactCellResistance[][] = [[], [], []];
		cells.forEach((cell, index) => result[index % 3].push(cell));
		return result;
	});
	let averageResistance = $derived.by(() => {
		const values = cells
			.filter((cell) => averageEligibleResistance(cell))
			.map((cell) => cell.resistanceMohm as number);
		return values.length === 0 ? null : values.reduce((total, value) => total + value, 0) / values.length;
	});

	function finiteResistance(cell: CompactCellResistance) {
		return cell.resistanceMohm !== null && Number.isFinite(cell.resistanceMohm);
	}

	function averageEligibleResistance(cell: CompactCellResistance) {
		return finiteResistance(cell)
			&& (cell.quality === undefined || cell.quality === 'VALID')
			&& !cell.availabilityWarning?.trim();
	}

	function resistanceOutlier(cell: CompactCellResistance) {
		return finiteResistance(cell) && averageResistance !== null
			&& (cell.resistanceMohm as number) > averageResistance * 1.25;
	}

	function issue(cell: CompactCellResistance) {
		return cell.resistanceMohm === null || !Number.isFinite(cell.resistanceMohm)
			|| cell.quality !== undefined && cell.quality !== 'VALID'
			|| Boolean(cell.availabilityWarning?.trim());
	}

	function issueDescription(cell: CompactCellResistance) {
		return [
			cell.resistanceMohm === null || !Number.isFinite(cell.resistanceMohm) ? 'Resistance was not recorded' : null,
			cell.quality !== undefined && cell.quality !== 'VALID' ? `Quality: ${cell.quality ?? 'not recorded'}` : null,
			cell.availabilityWarning?.trim() || null
		].filter((part): part is string => Boolean(part)).join('. ');
	}

	function warningDescription(cell: CompactCellResistance) {
		return [
			issue(cell) ? issueDescription(cell) : null,
			resistanceOutlier(cell) && averageResistance !== null
				? `High internal resistance: more than 125% of the ${averageResistance.toFixed(2)} mΩ cell average`
				: null
		].filter((part): part is string => Boolean(part)).join('. ');
	}
</script>

<section class="cell-panel">
	<header>
		<h4>Cell Data · Internal Resistance</h4>
		<p>{description}</p>
	</header>
	<div class="cell-scroll">
		<div class="cell-grid">
			{#each groups as group, groupIndex}
				<div class="cell-card">
					<table aria-label={`Cell internal resistance group ${groupIndex + 1}`}>
						<thead><tr><th>Cell ID</th><th>Resistance (mΩ)</th></tr></thead>
						<tbody>
							{#each group as cell (cell.cellId)}
								{@const invalid = issue(cell)}
								{@const outlier = resistanceOutlier(cell)}
								{@const warning = invalid || outlier ? warningDescription(cell) : ''}
								<tr class:invalid-cell={invalid} class:resistance-outlier={outlier} title={warning || undefined}>
									<td class="cell-id"><span>#{cell.cellId}</span>{#if invalid}<span class="status-flag" aria-hidden="true">Check</span>{/if}{#if outlier}<span class="status-flag outlier-flag" aria-hidden="true">High IR</span>{/if}{#if warning}<span class="sr-only">Warning: {warning}</span>{/if}</td>
									<td>{cell.resistanceMohm === null || !Number.isFinite(cell.resistanceMohm) ? '—' : cell.resistanceMohm.toFixed(2)}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/each}
		</div>
	</div>
</section>

<style>
	.cell-panel{overflow:hidden;border:1px solid #dfe6f0;border-radius:11px;background:#fff}.cell-panel header{padding:14px 15px;border-bottom:1px solid #e8edf4}.cell-panel h4{margin:0;color:#293b58;font-size:15px;font-weight:500}.cell-panel header p{margin:4px 0 0;color:#7d899b;font-size:12px}.cell-scroll{max-height:480px;padding:14px;overflow:auto;scrollbar-gutter:stable}.cell-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;align-items:start}.cell-card{overflow:hidden;border:1px solid #e0e6ef;border-radius:9px;background:#fff;box-shadow:0 1px 3px rgba(30,49,80,.045)}table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{width:50%;padding:9px 7px;text-align:center;vertical-align:middle}th{position:sticky;z-index:2;top:-14px;border-bottom:1px solid #dfe6ef;color:#65738a;background:#f5f7fb;font-size:11px;font-weight:500;line-height:1.25;text-transform:uppercase}td{height:43px;border-top:1px solid #edf1f6;color:#40506a;font-size:14px;font-weight:400;font-variant-numeric:tabular-nums}tbody tr:first-child td{border-top:0}.cell-id{color:#2450a5;text-align:left}.status-flag{display:inline-flex;align-items:center;margin-left:6px;padding:2px 4px;border:1px solid #e6bd50;border-radius:4px;color:#725318;background:#fff3bf;font-size:9px;font-weight:700;text-transform:uppercase}.invalid-cell td{color:#725718;background:#fff4c9}.invalid-cell .cell-id{color:#76571b}.outlier-flag{border-color:#c46b08;color:#7c3d00;background:#fff0d2}.resistance-outlier td{color:#5f3100;animation:resistance-warning 1.15s ease-in-out infinite alternate}.resistance-outlier .cell-id{color:#713a00}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}@keyframes resistance-warning{from{background:#ffe5b5}to{background:#f3a13d}}@media(prefers-reduced-motion:reduce){.resistance-outlier td{animation:none;background:#ffc56e}}@media(max-width:1120px){.cell-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:760px){.cell-grid{grid-template-columns:1fr}.cell-scroll{max-height:520px;padding:12px}th{top:-12px}}
</style>
