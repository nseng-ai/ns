import {
	gsListRequestSchema,
	gsListResultSchema,
	renderGsListHuman,
	runGsList,
} from "../../../../core/list-command.ts";
import { gsNsCommand } from "../../../command.ts";

export async function command() {
	let verbose = false;
	return gsNsCommand({
		schema: gsListRequestSchema,
		resultSchema: gsListResultSchema,
		options: { verbose: { short: "-v" } },
		renderHuman: (result) => renderGsListHuman(result, verbose),
		handler: async (inventory, invocation, request) => {
			const result = await runGsList(inventory, invocation, request);
			if (result.status === "success") verbose = request.verbose;
			return result;
		},
	});
}
