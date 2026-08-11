import { defineCommand } from "@nseng-ai/sdk";

import { checkoutOptionSpecs } from "../../../../core/command-options.ts";
import {
	checkoutRequestSchema,
	checkoutResultSchema,
	renderCheckout,
	runCheckout,
} from "../../../../lifecycle/operations/checkout.ts";
import { checkoutBranchesCompletionProviderFor } from "../../../checkout-completion.ts";
import {
	adaptSlotCompletionProvider,
	createSlotCliContext,
	toModernSlotOutcome,
} from "../../../command-adapter.ts";

export async function command() {
	const completionProvider = adaptSlotCompletionProvider(
		checkoutBranchesCompletionProviderFor({
			completionKind: "checkout-branches",
			gitFromContext: async (ctx) => (await createSlotCliContext(ctx)).git,
		}),
	);
	return defineCommand({
		name: "checkout",
		summary: "Check out a branch into an available pool slot worktree.",
		description: "Check out a branch into an available pool slot worktree.",
		schema: checkoutRequestSchema,
		positionals: { branchName: { position: 0 }, base: { position: 1 } },
		options: checkoutOptionSpecs,
		...(completionProvider === undefined ? {} : { completionProvider }),
		resultSchema: checkoutResultSchema,
		handler: async (ctx, request) =>
			toModernSlotOutcome(await runCheckout(await createSlotCliContext(ctx), request)),
		renderHuman: renderCheckout,
	});
}
