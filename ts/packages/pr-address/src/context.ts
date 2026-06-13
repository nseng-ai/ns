import { RealPrAddressGitGateway, RealPrAddressGitHubGateway, type PrAddressGitGateway, type PrAddressGitHubGateway } from "./gateways.ts";
import { createNodePayloadStoreFactory, type PayloadClock, type PayloadStoreFactory } from "./payload-store.ts";

export interface PrAddressContext {
	github: PrAddressGitHubGateway;
	git: PrAddressGitGateway;
	payloadStoreFactory: PayloadStoreFactory;
	/** Test seam for payload artifact timestamps; real runs use the system clock. */
	payloadClock?: PayloadClock | undefined;
}

export function createRealPrAddressContext(): PrAddressContext {
	return {
		github: new RealPrAddressGitHubGateway(),
		git: new RealPrAddressGitGateway(),
		payloadStoreFactory: createNodePayloadStoreFactory(),
	};
}
