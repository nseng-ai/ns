import { RealPrAddressGitGateway, RealPrAddressGitHubGateway, type PrAddressGitGateway, type PrAddressGitHubGateway } from "./gateways.ts";
import { RealLegacyPrAddressGateway, type LegacyPrAddressGateway } from "./legacy-python.ts";

export interface PrAddressContext {
	legacy: LegacyPrAddressGateway;
	github?: PrAddressGitHubGateway | undefined;
	git?: PrAddressGitGateway | undefined;
}

export function createRealPrAddressContext(): PrAddressContext {
	return { legacy: new RealLegacyPrAddressGateway(), github: new RealPrAddressGitHubGateway(), git: new RealPrAddressGitGateway() };
}
