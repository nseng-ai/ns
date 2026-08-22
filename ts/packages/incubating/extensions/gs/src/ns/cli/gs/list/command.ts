import { defineCommand } from "@nseng-ai/sdk";

import {
	gsListRequestSchema,
	gsListResultSchema,
	renderGsListHuman,
	runGsList,
} from "../../../../core/list-command.ts";
import { createNsGsLocalInventoryGateway } from "../../../local-inventory.ts";

export async function command() {
	let verbose = false;
	return defineCommand({
		schema: gsListRequestSchema,
		resultSchema: gsListResultSchema,
		options: { verbose: { short: "-v" } },
		renderHuman: (result) => renderGsListHuman(result, verbose),
		handler: async (ctx, request) => {
			const result = await runGsList(createNsGsLocalInventoryGateway(ctx), ctx, request);
			if (result.status === "success") verbose = request.verbose;
			return result;
		},
	});
}
