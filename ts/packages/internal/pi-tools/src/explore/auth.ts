import { AuthStorage } from "@earendil-works/pi-coding-agent";

export type IsProviderAuthConfigured = (providerId: string) => boolean;

/**
 * Dispatch-time auth probe backed by Pi's AuthStorage. Uses the non-refreshing status
 * check, so it never triggers OAuth token refresh; it only answers whether any form of
 * auth (stored, runtime, or environment) is configured for the provider.
 */
export function isProviderAuthConfiguredViaAuthStorage(providerId: string): boolean {
	return AuthStorage.create().getAuthStatus(providerId).configured;
}
