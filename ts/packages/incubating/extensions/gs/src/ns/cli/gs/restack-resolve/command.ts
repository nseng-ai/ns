import { defineCommand } from "@nseng-ai/sdk";

import {
	gsRestackRequestSchema,
	gsRestackResultSchema,
	renderGsRestackHuman,
	runGsRestackResolve,
} from "../../../../core/restack/command.ts";
import { createRealGsRestackContext } from "../../../restack.ts";

export async function command() {
	return defineCommand({
		schema: gsRestackRequestSchema,
		resultSchema: gsRestackResultSchema,
		options: {
			downstack: {},
			yes: { short: "-y" },
		},
		renderHuman: renderGsRestackHuman,
		handler: async (ctx, request) =>
			await runGsRestackResolve(
				createRealGsRestackContext(ctx),
				{
					isInteractive: () => ctx.isInteractive(),
					confirm: async (message) =>
						(
							await ctx.confirm("Confirm local branch rewrite", message, {
								defaultAnswer: "no",
							})
						).type === "confirmed",
				},
				request,
			),
	});
}
