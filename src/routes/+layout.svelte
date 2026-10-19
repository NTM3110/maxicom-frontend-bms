<script lang="ts">
	import { onMount } from 'svelte';
	import { notifyBmsKeyboard, type BmsKeyboardAction } from '$lib/services/bms-api';

	let { children } = $props();
	let keyboardRequest = Promise.resolve();
	const OPEN_REQUEST_WINDOW_MS = 300;

	function keyboardActionFor(target: EventTarget | null): Exclude<BmsKeyboardAction, 'hide'> | null {
		if (target instanceof HTMLInputElement) {
			if (target.disabled || target.readOnly) return null;
			const inputMode = (target.inputMode || target.getAttribute('inputmode') || '').toLowerCase();
			if (['numeric', 'decimal', 'tel'].includes(inputMode)
				|| ['number', 'tel'].includes(target.type.toLowerCase())) return 'dialer';
			return ['text', 'password', 'search', 'email', 'url'].includes(target.type.toLowerCase())
				? 'normal' : null;
		}
		if (target instanceof HTMLTextAreaElement) {
			if (target.disabled || target.readOnly) return null;
			return ['numeric', 'decimal', 'tel'].includes(target.inputMode.toLowerCase())
				? 'dialer' : 'normal';
		}
		if (target instanceof HTMLElement && target.isContentEditable) return 'normal';
		return null;
	}

	function requestKeyboard(action: BmsKeyboardAction): void {
		const requestedAt = performance.now();
		// Preserve focus event order even when readiness/authentication RPCs have
		// different response times. A delayed open must not revive a keyboard
		// after focus has already moved elsewhere.
		keyboardRequest = keyboardRequest.catch(() => undefined).then(() => {
			const remainingMs = OPEN_REQUEST_WINDOW_MS - (performance.now() - requestedAt);
			if (action !== 'hide' && remainingMs <= 0) return;
			return notifyBmsKeyboard(action, action === 'hide' ? 1000 : remainingMs);
		}).catch(() => {
			// Physical keyboard and ordinary browser use remain available when the
			// appliance keyboard service is absent or the backend is still starting.
		});
	}

	onMount(() => {
		const focusIn = (event: FocusEvent) => {
			const action = keyboardActionFor(event.target);
			if (action) requestKeyboard(action);
		};
		const focusOut = (event: FocusEvent) => {
			const next = event.relatedTarget;
			// A Wayland keyboard touch may temporarily blur Chromium without a
			// related target. Keep the keyboard alive in that case; hide it only
			// when focus definitely moved to a non-editable browser control.
			if (!next || next === document || keyboardActionFor(next)) return;
			requestKeyboard('hide');
		};
		document.addEventListener('focusin', focusIn);
		document.addEventListener('focusout', focusOut);
		return () => {
			document.removeEventListener('focusin', focusIn);
			document.removeEventListener('focusout', focusOut);
		};
	});
</script>

<svelte:head>
	<title>MAXiCom</title>
	<meta name="description" content="MAXiCom energy management platform" />
</svelte:head>

{@render children()}
