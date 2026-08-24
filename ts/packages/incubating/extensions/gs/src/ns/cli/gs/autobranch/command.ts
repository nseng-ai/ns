import { defineCommand, failure } from "@nseng-ai/sdk";

import {
	gsAutobranchRequestSchema,
	gsAutobranchResultSchema,
	renderGsAutobranchHuman,
	runGsAutobranch,
} from "../../../../core/autobranch.ts";
import { createRealGsAutobranchContext } from "../../../autobranch.ts";

export async function command() {
	return defineCommand({
		schema: gsAutobranchRequestSchema,
		resultSchema: gsAutobranchResultSchema,
		options: { slug: { short: "-s" }, yes: { short: "-y" } },
		renderHuman: renderGsAutobranchHuman,
		handler: async (ctx, request) => {
			const composed = await createRealGsAutobranchContext(ctx);
			if (!composed.ok) return failure("autobranch-preparation-failed", composed.message);
			return await runGsAutobranch(
				composed.context,
				{
					isInteractive: () => ctx.isInteractive(),
					confirm: async (message) =>
						(await ctx.confirm("Create GS child and checkpoint", message, { defaultAnswer: "no" }))
							.type === "confirmed",
				},
				request,
			);
		},
	});
}
