import { RealPrAddressGitGateway, RealPrAddressGitHubGateway, type PrAddressGitGateway, type PrAddressGitHubGateway } from "./gateways.ts";
import { RealLegacyPrAddressGateway, type LegacyPrAddressGateway } from "./legacy-python.ts";
import type { PayloadClock } from "./payload-store.ts";

export interface PrAddressContext {
	legacy: LegacyPrAddressGateway;
	github?: PrAddressGitHubGateway | undefined;
	git?: PrAddressGitGateway | undefined;
	/** Test seam for payload artifact timestamps; real runs use the system clock. */
	payloadClock?: PayloadClock | undefined;
}

export function createRealPrAddressContext(): PrAddressContext {
	return { legacy: new RealLegacyPrAddressGateway(), github: new RealPrAddressGitHubGateway(), git: new RealPrAddressGitGateway() };
}
