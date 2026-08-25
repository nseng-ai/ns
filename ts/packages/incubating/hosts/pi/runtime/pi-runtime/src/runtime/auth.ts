import { readStoredCredential } from "@earendil-works/pi-coding-agent";

/**
 * Non-refreshing provider auth probe backed by Pi's stored credentials. This only
 * answers whether a provider credential exists; it must not trigger OAuth refresh
 * or login flows.
 */
export function isProviderAuthConfigured(providerId: string): boolean {
	return readStoredCredential(providerId) !== undefined;
}
