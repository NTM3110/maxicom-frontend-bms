import { browser } from '$app/environment';
import type { DeviceConfig } from '$lib/device-config';

const APP_SESSION_KEY = 'maxicom-app-session';
const DEFAULT_USERNAME = 'admin';
const DEFAULT_PASSWORD_HASH = '8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918';

export type AppUser = {
	username: string;
	role: 'Administrator';
	signedInAt: number;
};

function configuredUser(config: DeviceConfig | null) {
	return config?.authentication?.defaultUser ?? config?.rts?.systemInfo?.defaultUser ?? {
		username: DEFAULT_USERNAME,
		passwordHash: DEFAULT_PASSWORD_HASH
	};
}

async function sha256(value: string) {
	if (!globalThis.crypto?.subtle) return null;
	const bytes = new TextEncoder().encode(value);
	const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
	return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function signInApp(username: string, password: string, config: DeviceConfig | null) {
	const expected = configuredUser(config);
	const normalizedUsername = username.trim();
	const passwordHash = await sha256(password);
	const validPassword = passwordHash
		? passwordHash === expected.passwordHash.toLowerCase()
		: expected.username === DEFAULT_USERNAME
			&& expected.passwordHash.toLowerCase() === DEFAULT_PASSWORD_HASH
			&& password === 'admin';

	if (normalizedUsername !== expected.username || !validPassword) {
		throw new Error('Incorrect username or password.');
	}

	const user: AppUser = {
		username: expected.username,
		role: 'Administrator',
		signedInAt: Date.now()
	};
	if (browser) sessionStorage.setItem(APP_SESSION_KEY, JSON.stringify(user));
	return user;
}

export function currentAppUser(): AppUser | null {
	if (!browser) return null;
	const value = sessionStorage.getItem(APP_SESSION_KEY);
	if (!value) return null;
	try {
		const user = JSON.parse(value) as Partial<AppUser>;
		if (typeof user.username !== 'string' || typeof user.signedInAt !== 'number') throw new Error();
		return { username: user.username, role: 'Administrator', signedInAt: user.signedInAt };
	} catch {
		sessionStorage.removeItem(APP_SESSION_KEY);
		return null;
	}
}

export function signOutApp() {
	if (browser) sessionStorage.removeItem(APP_SESSION_KEY);
}
