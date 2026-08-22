import { createNsGitGateway } from "@nseng-ai/extension-kit";
import type { NsExtensionApi } from "@nseng-ai/sdk";

import type { GsLocalInventoryGateway } from "../core/local-inventory.ts";
import { RealGsLocalInventoryGateway } from "../core/real-local-inventory-gateway.ts";

export function createNsGsLocalInventoryGateway(ctx: NsExtensionApi): GsLocalInventoryGateway {
	return new RealGsLocalInventoryGateway({ git: createNsGitGateway(ctx) });
}
