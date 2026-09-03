import { browser } from '$app/environment';

export const BMS_ASSET_PROFILE_KEY = 'maxicom-asset-management';
export const BMS_ASSET_PROFILE_EVENT = 'maxicom:asset-profile-updated';

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

export type BmsAssetProfile = {
	version: 2;
	site: BmsSiteProfile;
	devices: Record<string, BmsDeviceProfile>;
};

export function emptyBmsSiteProfile(): BmsSiteProfile {
	return { owner: '', operationalTeam: '', substation: '', coordinates: '', maxicomSerial: '' };
}

export function emptyBmsDeviceProfile(): BmsDeviceProfile {
	return { dcLevel: '', batteryBankId: '', manufacturer: '', technology: '', normalVoltage: '', batchLotNumber: '', manufacturingDate: '', commissioningDate: '', installationDate: '', responsiblePerson: '', sensorMapping: '', sensorCalibrationStatus: '', currentLimit: '', testOcv: '', testFloatVoltage: '', testIr: '', testNegativeTerminalTemp: '', sohWarningThreshold: '', sohReplaceThreshold: '', replacementDate: '' };
}

export function emptyBmsAssetProfile(): BmsAssetProfile {
	return { version: 2, site: emptyBmsSiteProfile(), devices: {} };
}

export function loadBmsAssetProfile(): BmsAssetProfile {
	const empty = emptyBmsAssetProfile();
	if (!browser) return empty;
	try {
		const raw = localStorage.getItem(BMS_ASSET_PROFILE_KEY);
		if (!raw) return empty;
		const value = JSON.parse(raw) as Record<string, unknown>;
		if (value.version === 2 && value.site && value.devices) {
			return {
				version: 2,
				site: { ...empty.site, ...(value.site as Partial<BmsSiteProfile>) },
				devices: value.devices as Record<string, BmsDeviceProfile>
			};
		}
		const legacy = value as Record<string, string>;
		return {
			version: 2,
			site: {
				owner: legacy.owner ?? '',
				operationalTeam: legacy.managementUnit ?? '',
				substation: legacy.location ?? '',
				coordinates: legacy.coordinates ?? '',
				maxicomSerial: legacy.maxicomSerial ?? ''
			},
			devices: {
				str1: {
					...emptyBmsDeviceProfile(),
					dcLevel: legacy.dcSystem ?? '', batteryBankId: legacy.batteryBankId ?? '', manufacturer: legacy.manufacturer ?? '', technology: legacy.technology ?? '', normalVoltage: legacy.normalVoltage ?? '', batchLotNumber: legacy.batchLotNumber ?? '', manufacturingDate: legacy.manufacturingDate ?? '', commissioningDate: legacy.commissioningDate ?? '', installationDate: legacy.installationDate ?? '', responsiblePerson: legacy.responsiblePerson ?? '', sensorMapping: legacy.sensorMapping ?? '', sensorCalibrationStatus: legacy.sensorCalibrationStatus ?? '', currentLimit: legacy.currentLimit ?? '', testOcv: legacy.testOcv ?? '', testFloatVoltage: legacy.testFloatVoltage ?? '', testIr: legacy.testIr ?? '', testNegativeTerminalTemp: legacy.testNegativeTerminalTemp ?? '', sohWarningThreshold: legacy.sohWarningThreshold ?? '', sohReplaceThreshold: legacy.sohReplaceThreshold ?? '', replacementDate: legacy.replacementDate ?? ''
				}
			}
		};
	} catch {
		return empty;
	}
}

export function saveBmsAssetProfile(profile: BmsAssetProfile) {
	if (!browser) return;
	localStorage.setItem(BMS_ASSET_PROFILE_KEY, JSON.stringify(profile));
	window.dispatchEvent(new CustomEvent(BMS_ASSET_PROFILE_EVENT));
}
