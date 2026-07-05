import { AuthStorage } from "@earendil-works/pi-coding-agent";

/**
 * Non-refreshing provider auth probe backed by Pi's AuthStorage. This only answers
 * whether auth is configured; it must not trigger OAuth refresh or login flows.
 */
export function isProviderAuthConfigured(providerId: string): boolean {
	return AuthStorage.create().getAuthStatus(providerId).configured;
}
