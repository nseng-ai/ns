import {
	RealPrAddressGitGateway,
	RealPrAddressGitHubGateway,
	type PrAddressGitGateway,
	type PrAddressGitHubGateway,
} from "./gateways.ts";

export interface PrAddressContext {
	github: PrAddressGitHubGateway;
	git: PrAddressGitGateway;
}

export function createRealPrAddressContext(): PrAddressContext {
	return {
		github: new RealPrAddressGitHubGateway(),
		git: new RealPrAddressGitGateway(),
	};
}
