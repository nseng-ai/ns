import { createNsGitGateway } from "@nseng-ai/extension-kit";

import { createGsListCommand } from "../../../../core/list-command.ts";
import { RealGsLocalInventoryGateway } from "../../../../core/real-local-inventory-gateway.ts";

export async function command() {
	return createGsListCommand({
		createGateway: (ctx) => new RealGsLocalInventoryGateway({ git: createNsGitGateway(ctx) }),
	});
}
