/**
 * Connectivity contracts copied from the two existing frontends.
 * Keep property names and enum values stable: API adapters depend on them.
 */

export type ProductProfile = 'bms' | 'rts';

export const BMS_BAUD_RATES = ['9600', '19200', '38400', '57600', '115200'];
export const RTS_BAUD_RATES = ['1200', '2400', '4800', '9600', '19200', '38400', '57600', '115200'];
export const DATA_BITS = ['5', '6', '7', '8'];
export const BMS_STOP_BITS = ['1', '1.5', '2'];
export const RTS_STOP_BITS = ['ONE', 'ONE_POINT_FIVE', 'TWO'];
export const BMS_PARITIES = ['PARITY_NONE', 'PARITY_EVEN', 'PARITY_ODD', 'PARITY_MARK', 'PARITY_SPACE'];
export const RTS_PARITIES = ['NONE', 'EVEN', 'ODD', 'MARK', 'SPACE'];

export type RtsSerialForm = {
	template: string;
	baudRate: string;
	databits: string;
	stopbits: string;
	parity: string;
};

export type BmsSerialForm = {
	baudRate: string;
	dataBits: string;
	stopBits: string;
	parity: string;
};

export type RtsTcpForm = { displayName: string; ip: string; port: number };

export function buildRtsSerialCreatePayload(
	form: RtsSerialForm,
	template: { key: string; portName?: string }
) {
	return {
		apply: 'true',
		factoryPid: 'Bridge.Modbus.Serial',
		location: '',
		id: template.key,
		alias: template.key,
		enabled: 'true',
		portName: template.portName ?? '',
		baudRate: String(form.baudRate),
		databits: String(form.databits),
		stopbits: form.stopbits,
		parity: form.parity,
		enableTermination: 'false',
		delayBeforeTx: '0',
		delayAfterTx: '0',
		logVerbosity: 'NONE',
		invalidateElementsAfterReadErrors: '1',
		propertylist: 'id,alias,enabled,portName,baudRate,databits,stopbits,parity,enableTermination,delayBeforeTx,delayAfterTx,logVerbosity,invalidateElementsAfterReadErrors'
	};
}

export function buildRtsTcpCreatePayload(form: RtsTcpForm, id: string) {
	return {
		apply: 'true',
		factoryPid: 'Bridge.Modbus.Tcp',
		location: '',
		id,
		alias: form.displayName,
		enabled: 'true',
		ip: form.ip,
		port: String(form.port),
		logVerbosity: 'NONE',
		invalidateElementsAfterReadErrors: '1',
		propertylist: 'id,alias,enabled,ip,port,logVerbosity,invalidateElementsAfterReadErrors'
	};
}

export function buildBmsSerialUpdateParams(id: string, alias: string, form: BmsSerialForm) {
	return {
		id,
		alias,
		baudRate: Number(form.baudRate),
		databits: Number(form.dataBits),
		parity: form.parity,
		stopbits: `STOPBITS_${form.stopBits === '1.5' ? 'ONE_POINT_FIVE' : form.stopBits === '2' ? 'TWO' : 'ONE'}`
	};
}

export type BmsNetworkForm = {
	id: string;
	name: string;
	interfaceName: string;
	available: boolean;
	connected: boolean;
	status: string;
	error?: string | null;
	ipAddress: string;
	subnetMask: string;
	gateway: string;
	dns: string;
	mode: BmsNetworkMode;
};

export type BmsNetworkMode = 'DHCP' | 'STATIC' | 'UNKNOWN';

export function normalizeBmsNetworkMode(value: unknown): BmsNetworkMode {
	if (typeof value !== 'string') return 'UNKNOWN';
	switch (value.trim().toUpperCase()) {
		case 'DHCP': return 'DHCP';
		case 'STATIC': return 'STATIC';
		default: return 'UNKNOWN';
	}
}

export type RtsEthernetForm = {
	isDhcp: boolean;
	ipAddress: string;
	subnetMask: string;
	gateway: string;
	dnsPrimary: string;
	dnsSecondary: string;
};

export type RtsModem4GForm = {
	enabled: boolean;
	apn: string;
	username: string;
	password: string;
};

export const RTS_CARRIERS = [
	{ name: 'Viettel', apn: 'v-internet' },
	{ name: 'MobiFone', apn: 'm-wap' },
	{ name: 'Vinaphone', apn: 'm3-world' },
	{ name: 'Vietnamobile', apn: 'internet' },
	{ name: 'Custom', apn: '' }
];

export function buildBmsNetworkUpdateParams(form: BmsNetworkForm) {
	if (form.mode === 'UNKNOWN') throw new Error('Select Automatic or Manual address assignment before saving.');
	return {
		id: form.id,
		ipAddress: form.ipAddress ?? '',
		subnetMask: form.subnetMask ?? '',
		gateway: form.gateway ?? '',
		dns: form.dns ?? '',
		mode: form.mode
	};
}

export type BmsNetworkUpdateParams = ReturnType<typeof buildBmsNetworkUpdateParams>;
