import { defineCommand } from "@nseng-ai/sdk";

import {
	claimRequestSchema,
	claimResultSchema,
	renderClaim,
	runClaim,
} from "../../../../lifecycle/operations/claim.ts";
import { createSlotCliContext } from "../../../command-adapter.ts";

export async function command() {
	return defineCommand({
		name: "claim",
		summary: "Move a local branch into the current managed slot or lowest available slot.",
		description: "Move a local branch into the current managed slot or lowest available slot.",
		schema: claimRequestSchema,
		positionals: { branchName: { position: 0 } },
		resultSchema: claimResultSchema,
		handler: async (ctx, request) => runClaim(await createSlotCliContext(ctx), request),
		renderHuman: renderClaim,
	});
}
