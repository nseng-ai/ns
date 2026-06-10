import { RealLegacyPrAddressGateway, type LegacyPrAddressGateway } from "./legacy-python.ts";

export interface PrAddressContext {
	legacy: LegacyPrAddressGateway;
}

export function createRealPrAddressContext(): PrAddressContext {
	return { legacy: new RealLegacyPrAddressGateway() };
}
