export type BmsSiteProfile = {
	owner: string;
	operationalTeam: string;
	substation: string;
	coordinates: string;
	maxicomSerial: string;
};

export type BmsDeviceProfile = {
	dcLevel: string;
	batteryBankId: string;
	manufacturer: string;
	technology: string;
	normalVoltage: string;
	batchLotNumber: string;
	manufacturingDate: string;
	commissioningDate: string;
	installationDate: string;
	responsiblePerson: string;
	sensorMapping: string;
	sensorCalibrationStatus: string;
	currentLimit: string;
	testOcv: string;
	testFloatVoltage: string;
	testIr: string;
	testNegativeTerminalTemp: string;
	sohWarningThreshold: string;
	sohReplaceThreshold: string;
	replacementDate: string;
};

export function emptyBmsSiteProfile(): BmsSiteProfile {
	return { owner: '', operationalTeam: '', substation: '', coordinates: '', maxicomSerial: '' };
}

export function emptyBmsDeviceProfile(): BmsDeviceProfile {
	return { dcLevel: '', batteryBankId: '', manufacturer: '', technology: '', normalVoltage: '', batchLotNumber: '', manufacturingDate: '', commissioningDate: '', installationDate: '', responsiblePerson: '', sensorMapping: '', sensorCalibrationStatus: '', currentLimit: '', testOcv: '', testFloatVoltage: '', testIr: '', testNegativeTerminalTemp: '', sohWarningThreshold: '', sohReplaceThreshold: '', replacementDate: '' };
}
