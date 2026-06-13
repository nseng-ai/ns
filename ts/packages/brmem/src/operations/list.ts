import { failure, ok } from "@asdl/clinkr";
import { z } from "zod";

import type { BrmemCliContext } from "../context.ts";
import { BASE_NAMESPACE, namespaceDisplayLabel, normalizeNamespaceOption, type EntryRef } from "../ref-layout.ts";
import { firstFailure, validateBranchName, validateEntryKey, validateNamespaceName, validationMessage } from "../validation.ts";
import { gatewayFailure, resolveCurrentBranch } from "./shared.ts";

const ALL_NAMESPACES_SCOPE = "all";

export const listRequestSchema = z.object({
	namespace: z.string().optional().describe("Namespace filter. Omit for all Namespaces."),
	key: z.string().optional().describe("Exact Entry Key filter."),
	branch: z.string().optional().describe("Branch. Defaults to current branch."),
	base: z.boolean().default(false).describe("Restrict to Base Namespace."),
	all_branches: z.boolean().default(false).describe("List Entries from all branches."),
});

export const listResultSchema = z.object({
	namespace_scope: z.string(),
	key: z.string().nullable(),
	branch: z.string().nullable(),
	base: z.boolean(),
	all_branches: z.boolean(),
	entries: z.array(
		z.object({
			namespace: z.string(),
			key: z.string(),
			branch: z.string(),
			ref_name: z.string(),
		}),
	),
});

export type ListRequest = z.infer<typeof listRequestSchema>;
export type ListResult = z.infer<typeof listResultSchema>;

export async function runList(ctx: BrmemCliContext, request: ListRequest) {
	if (request.base && request.namespace !== undefined) {
		return failure("base_and_namespace_conflict", "--base and --namespace are mutually exclusive.");
	}
	if (request.branch !== undefined && request.all_branches) {
		return failure("branch_and_all_branches_conflict", "--branch and --all-branches are mutually exclusive.");
	}
	const allNamespaces = !request.base && request.namespace === undefined;
	const scopeNamespace = request.base ? BASE_NAMESPACE : normalizeNamespaceOption(request.namespace);
	const validationFailure = firstFailure(
		["invalid_namespace", allNamespaces ? undefined : validationMessage("namespace", scopeNamespace, validateNamespaceName(scopeNamespace))],
		["invalid_key", request.key === undefined ? undefined : validationMessage("key", request.key, validateEntryKey(request.key))],
		[
			"invalid_branch_name",
			request.branch === undefined ? undefined : validationMessage("branch name", request.branch, validateBranchName(request.branch)),
		],
	);
	if (validationFailure !== undefined) return failure(validationFailure[0], validationFailure[1]);
	let branch: string | undefined;
	if (!request.all_branches) {
		if (request.branch !== undefined) branch = request.branch;
		else {
			const resolvedBranch = await resolveCurrentBranch(ctx);
			if (typeof resolvedBranch !== "string") return resolvedBranch;
			branch = resolvedBranch;
		}
	}
	const entriesResult = allNamespaces
		? await ctx.gateway.listAllEntries({ key: request.key, branch })
		: await ctx.gateway.listEntries({ namespace: scopeNamespace, key: request.key, branch });
	if (entriesResult.type === "error") return gatewayFailure<ListResult>(entriesResult.error);
	return ok({
		namespace_scope: allNamespaces ? ALL_NAMESPACES_SCOPE : scopeNamespace,
		key: request.key ?? null,
		branch: branch ?? null,
		base: request.base,
		all_branches: request.all_branches,
		entries: entriesResult.value.map(entryJson),
	});
}

export function renderList(result: ListResult): string {
	return result.entries
		.map((entry) => `${namespaceDisplayLabel(entry.namespace)} | Entry Key ${entry.key} | Branch ${entry.branch}`)
		.join("\n");
}

function entryJson(entry: EntryRef): { namespace: string; key: string; branch: string; ref_name: string } {
	return { namespace: entry.namespace, key: entry.key, branch: entry.branch, ref_name: entry.entryLocator };
}
