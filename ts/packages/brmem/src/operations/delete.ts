import { failure, ok } from "@asdl/clinkr";
import { z } from "zod";

import type { BrmemCliContext } from "../context.ts";
import { mustEntryLocator, namespaceDisplayLabel, namespaceValueLabel } from "../ref-layout.ts";
import { gatewayFailure, resolveEntryRequest } from "./shared.ts";

export const deleteRequestSchema = z.object({
	key: z.string().describe("Entry Key."),
	namespace: z.string().optional().describe("Namespace. Omit for ad-hoc base Entries."),
	branch: z.string().optional().describe("Branch. Defaults to current branch."),
});

export const deleteResultSchema = z.object({
	namespace: z.string(),
	key: z.string(),
	branch: z.string(),
	ref_name: z.string(),
	commit: z.string(),
});

export type DeleteRequest = z.infer<typeof deleteRequestSchema>;
export type DeleteResult = z.infer<typeof deleteResultSchema>;

export async function runDelete(ctx: BrmemCliContext, request: DeleteRequest) {
	const resolved = await resolveEntryRequest(ctx, request);
	if (resolved.type !== "resolved") return resolved;
	const { namespace, key, branch } = resolved.value;
	const locator = mustEntryLocator(namespace, key, branch);

	const result = await ctx.gateway.deleteEntry({ namespace, key, branch });
	if (result.type === "error") {
		if (result.error.code === "key_not_found") {
			return failure(
				"key_not_found",
				`No Entry to delete: Entry Key=${key} Namespace=${namespaceValueLabel(namespace)} Branch=${branch} at ${locator}. Underlying error: ${result.error.message}`,
			);
		}
		return gatewayFailure<DeleteResult>(result.error);
	}

	return ok({
		namespace,
		key,
		branch,
		ref_name: locator,
		commit: result.value.commitSha,
	});
}

export function renderDelete(result: DeleteResult): string {
	return [
		`Deleted Entry Key ${result.key} from ${namespaceDisplayLabel(result.namespace)} on Branch ${result.branch}.`,
		`Entry Locator: ${result.ref_name}`,
		`Commit: ${result.commit}`,
	].join("\n");
}
