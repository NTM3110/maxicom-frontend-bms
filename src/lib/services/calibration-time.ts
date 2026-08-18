const calibrationDateFormatter = new Intl.DateTimeFormat('en-GB', {
	timeZone: 'Asia/Ho_Chi_Minh',
	year: 'numeric',
	month: '2-digit',
	day: '2-digit',
	hour: '2-digit',
	minute: '2-digit',
	second: '2-digit',
	hourCycle: 'h23'
});

/** Formats server UTC instants consistently for calibration operators in Vietnam. */
export function formatCalibrationTime(value: string | null | undefined) {
	if (!value) return '—';
	const timestamp = Date.parse(value);
	return Number.isFinite(timestamp) ? `${calibrationDateFormatter.format(timestamp)} UTC+07:00` : value;
}
