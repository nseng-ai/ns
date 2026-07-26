import { failure, negative, ok, requireInteractiveOrUsageError } from "@nseng-ai/clinkr";
import { z } from "zod";

import type { BrmemCliContext } from "../context.ts";
import { mustEntryLocator, namespaceDisplayLabel, namespaceValueLabel } from "../ref-layout.ts";
import { gatewayFailure, resolveOperationEntryRequest } from "./shared.ts";

export const deleteRequestSchema = z.object({
	key: z.string().describe("Entry Key."),
	namespace: z.string().optional().describe("Namespace. Omit for ad-hoc base Entries."),
	branch: z.string().optional().describe("Branch. Defaults to current branch."),
	yes: z.boolean().default(false).describe("Confirm deletion without prompting."),
});

export const deleteResultSchema = z.object({
	namespace: z.string(),
	key: z.string(),
	branch: z.string(),
	refName: z.string(),
	deleted: z.boolean(),
	cancelled: z.boolean(),
	commit: z.string().nullable(),
});

export type DeleteRequest = z.infer<typeof deleteRequestSchema>;
export type DeleteResult = z.infer<typeof deleteResultSchema>;

export async function runDelete(ctx: BrmemCliContext, request: DeleteRequest) {
	const resolved = await resolveOperationEntryRequest(ctx, request);
	if (resolved.type !== "resolved") return resolved;
	const { namespace, key, branch } = resolved.value;
	const locator = mustEntryLocator(namespace, key, branch);

	if (!request.yes) {
		const gate = requireInteractiveOrUsageError(ctx.interaction, {
			message: "Deleting a Branch Memory Entry requires --yes when non-interactive.",
			missingFlag: "--yes",
			howToSupply: "Pass --yes (or -y) to confirm deletion without prompting.",
		});
		if (gate) return gate;
		const confirmed = await ctx.interaction.confirm({
			message: `Delete Entry Key ${key} from ${namespaceDisplayLabel(namespace)} on Branch ${branch}?`,
			defaultAnswer: "no",
		});
		if (confirmed.type === "declined") {
			return ok({
				namespace,
				key,
				branch,
				refName: locator,
				deleted: false,
				cancelled: true,
				commit: null,
			} satisfies DeleteResult);
		}
		if (confirmed.type === "aborted") return failure("aborted", "Aborted!");
	}

	const result = await ctx.gateway.deleteEntry({ namespace, key, branch });
	if (result.type === "error") {
		if (result.error.code === "key-not-found") {
			const message = `No Entry to delete: Entry Key=${key} Namespace=${namespaceValueLabel(namespace)} Branch=${branch} at ${locator}. Underlying error: ${result.error.message}`;
			return negative(message, {
				namespace,
				key,
				branch,
				refName: locator,
				deleted: false,
				cancelled: false,
				commit: null,
				message,
			});
		}
		return gatewayFailure<DeleteResult>(result.error);
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

export function renderDelete(result: DeleteResult & { message?: string }): string {
	if (result.message !== undefined) return result.message;
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
