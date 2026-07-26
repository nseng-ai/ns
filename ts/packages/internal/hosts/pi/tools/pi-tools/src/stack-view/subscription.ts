/** Dispose an optional subscription and return the cleared field value. */
export function detachSubscription(unsubscribe: (() => void) | undefined): undefined {
	unsubscribe?.();
	return undefined;
}
