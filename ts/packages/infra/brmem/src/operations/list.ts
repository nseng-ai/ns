import { failure, ok, type RenderCapabilities } from "@sdl/clinkr";
import { optionalEntries } from "@sdl/core/primitives";
import { renderTextTable } from "@sdl/core/text-table";
import { z } from "zod";

import type { BrmemCliContext } from "../context.ts";
import {
	namespaceDisplayLabel,
	namespaceScopeLabel,
	resolveOptionalNamespaceScope,
	type EntryRef,
} from "../ref-layout.ts";
import {
	firstFailure,
	validateBranchName,
	validateEntryKey,
	validateNamespaceName,
	validationMessage,
} from "../validation.ts";
import { gatewayFailure, resolveCurrentBranch } from "./shared.ts";

export const listRequestSchema = z.object({
	namespace: z.string().optional().describe("Namespace filter. Omit for all Namespaces."),
	key: z.string().optional().describe("Exact Entry Key filter."),
	branch: z.string().optional().describe("Branch. Defaults to current branch."),
	base: z.boolean().default(false).describe("Restrict to Base Namespace."),
	allBranches: z.boolean().default(false).describe("List Entries from all branches."),
});

export const listResultSchema = z.object({
	namespaceScope: z.string(),
	key: z.string().nullable(),
	branch: z.string().nullable(),
	base: z.boolean(),
	allBranches: z.boolean(),
	entries: z.array(
		z.object({
			namespace: z.string(),
			key: z.string(),
			branch: z.string(),
			refName: z.string(),
		}),
	),
});

export type ListRequest = z.infer<typeof listRequestSchema>;
export type ListResult = z.infer<typeof listResultSchema>;

export async function runList(ctx: BrmemCliContext, request: ListRequest) {
	const namespaceScope = resolveOptionalNamespaceScope(request);
	if (namespaceScope.type === "conflict")
		return failure(namespaceScope.code, namespaceScope.message);
	if (request.branch !== undefined && request.allBranches) {
		return failure(
			"branch-and-all-branches-conflict",
			"--branch and --all-branches are mutually exclusive.",
		);
	}
	const scope = namespaceScope.scope;
	const validationFailure = firstFailure(
		[
			"invalid-namespace",
			scope.allNamespaces
				? undefined
				: validationMessage("namespace", scope.namespace, validateNamespaceName(scope.namespace)),
		],
		[
			"invalid-key",
			request.key === undefined
				? undefined
				: validationMessage("key", request.key, validateEntryKey(request.key)),
		],
		[
			"invalid-branch-name",
			request.branch === undefined
				? undefined
				: validationMessage("branch name", request.branch, validateBranchName(request.branch)),
		],
	);
	if (validationFailure !== undefined) return failure(validationFailure[0], validationFailure[1]);
	let branch: string | undefined;
	if (!request.allBranches) {
		if (request.branch !== undefined) branch = request.branch;
		else {
			const resolvedBranch = await resolveCurrentBranch(ctx);
			if (typeof resolvedBranch !== "string") return resolvedBranch;
			branch = resolvedBranch;
		}
	}
	const entryFilters = {
		...optionalEntries({ key: request.key, branch }),
	};
	const entriesResult = scope.allNamespaces
		? await ctx.gateway.listAllEntries(entryFilters)
		: await ctx.gateway.listEntries({ namespace: scope.namespace, ...entryFilters });
	if (entriesResult.type === "error") return gatewayFailure<ListResult>(entriesResult.error);
	return ok({
		namespaceScope: namespaceScopeLabel(scope),
		key: request.key ?? null,
		branch: branch ?? null,
		base: request.base,
		allBranches: request.allBranches,
		entries: entriesResult.value.map(entryJson),
	});
}

export function renderList(
	result: ListResult,
	caps: RenderCapabilities = { canEmitAnsi: false },
): string {
	if (result.entries.length === 0) return "";
	return renderTextTable({
		columns: [
			{ header: "NAMESPACE", style: "bold-cyan" },
			{ header: "ENTRY KEY" },
			{ header: "BRANCH" },
		],
		rows: result.entries.map((entry) => [
			namespaceDisplayLabel(entry.namespace),
			entry.key,
			entry.branch,
		]),
		canEmitAnsi: caps.canEmitAnsi,
		shouldDrawRule: true,
		headerStyle: "bold-cyan",
	});
}

function entryJson(entry: EntryRef): {
	namespace: string;
	key: string;
	branch: string;
	refName: string;
} {
	return {
		namespace: entry.namespace,
		key: entry.key,
		branch: entry.branch,
		refName: entry.entryLocator,
	};
}
