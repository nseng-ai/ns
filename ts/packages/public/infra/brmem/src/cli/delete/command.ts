import {
	cliOption,
	cliPositional,
	confirmOrUsageError,
	defineCommand,
	failure,
	negative,
	ok,
} from "@nseng-ai/clinkr/app";
import { optionalEntries } from "@nseng-ai/foundation/primitives";
import { z } from "zod";

import type { BrmemCliContext } from "../../context.ts";
import { mustEntryLocator, namespaceDisplayLabel, namespaceValueLabel } from "../../ref-layout.ts";
import { gatewayFailure, resolveOperationEntryRequest } from "../../entry-request.ts";

const deleteRequestSchema = z.object({
	key: cliPositional(z.string().describe("Entry Key."), { position: 0 }),
	namespace: cliOption(
		z.string().optional().describe("Namespace. Omit for ad-hoc base Entries."),
		{},
	),
	branch: cliOption(z.string().optional().describe("Branch. Defaults to current branch."), {}),
	yes: cliOption(z.boolean().default(false).describe("Confirm deletion without prompting."), {
		short: "-y",
	}),
});

const deleteResultSchema = z.object({
	namespace: z.string(),
	key: z.string(),
	branch: z.string(),
	refName: z.string(),
	deleted: z.boolean(),
	cancelled: z.boolean(),
	commit: z.string().nullable(),
});

type DeleteRequest = z.infer<typeof deleteRequestSchema>;
type DeleteResult = z.infer<typeof deleteResultSchema>;

async function runDelete(ctx: BrmemCliContext, request: DeleteRequest) {
	const resolved = await resolveOperationEntryRequest(ctx, {
		key: request.key,
		...optionalEntries({ namespace: request.namespace, branch: request.branch }),
	});
	if (resolved.type === "failure") return resolved.outcome;
	const { namespace, key, branch } = resolved.value;
	const locator = mustEntryLocator(namespace, key, branch);

	if (!request.yes) {
		const confirmation = await confirmOrUsageError(ctx.interaction, {
			message: `Delete Entry Key ${key} from ${namespaceDisplayLabel(namespace)} on Branch ${branch}?`,
			nonInteractive: {
				message: "Deleting a Branch Memory Entry requires --yes when non-interactive.",
				missingFlag: "--yes",
				howToSupply: "Pass --yes (or -y) to confirm deletion without prompting.",
			},
			onDeclined: () =>
				ok({
					namespace,
					key,
					branch,
					refName: locator,
					deleted: false,
					cancelled: true,
					commit: null,
				} satisfies DeleteResult),
			onAborted: () => failure("aborted", "Aborted!"),
		});
		if (confirmation.status !== "confirmed") return confirmation;
	}

	const result = await ctx.gateway.deleteEntry({ namespace, key, branch });
	if (result.type === "error") {
		if (result.error.code === "key-not-found") {
			const message = `No Entry to delete: Entry Key=${key} Namespace=${namespaceValueLabel(namespace)} Branch=${branch} at ${locator}. Underlying error: ${result.error.message}`;
			return negative(message, {
				data: {
					namespace,
					key,
					branch,
					refName: locator,
					deleted: false,
					cancelled: false,
					commit: null,
				} satisfies DeleteResult,
			});
		}
		return gatewayFailure(result.error);
	}

	return ok({
		namespace,
		key,
		branch,
		refName: locator,
		deleted: true,
		cancelled: false,
		commit: result.value.commitSha,
	});
}

function renderDelete(result: DeleteResult): string {
	if (result.cancelled) {
		return [
			"Cancelled Branch Memory Entry delete.",
			`No Entry was deleted. Target: Entry Key ${result.key} from ${namespaceDisplayLabel(result.namespace)} on Branch ${result.branch}.`,
			`Entry Locator: ${result.refName}`,
		].join("\n");
	}
	return [
		`Deleted Entry Key ${result.key} from ${namespaceDisplayLabel(result.namespace)} on Branch ${result.branch}.`,
		`Entry Locator: ${result.refName}`,
		`Commit: ${result.commit}`,
	].join("\n");
}
export async function command() {
	return defineCommand({
		requiresContext: true,
		schema: deleteRequestSchema,
		resultSchema: deleteResultSchema,
		handler: runDelete,
		renderHuman: renderDelete,
	});
}
