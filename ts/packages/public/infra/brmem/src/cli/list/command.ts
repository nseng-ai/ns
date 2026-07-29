import {
	cliOption,
	defineCommand,
	failure,
	ok,
	type RenderCapabilities,
} from "@nseng-ai/clinkr/app";
import { optionalEntries } from "@nseng-ai/foundation/primitives";
import { renderTextTable } from "@nseng-ai/foundation/text-table";
import { z } from "zod";

import type { BrmemCliContext } from "../../context.ts";
import {
	namespaceDisplayLabel,
	namespaceScopeLabel,
	namespaceScopeRequest,
	resolveOptionalNamespaceScope,
	type EntryRef,
} from "../../ref-layout.ts";
import {
	firstFailure,
	validateBranchName,
	validateEntryKey,
	validateNamespaceName,
	validationMessage,
} from "../../validation.ts";
import { gatewayFailure, resolveCurrentBranch } from "../../entry-request.ts";

const listRequestSchema = z.object({
	namespace: cliOption(
		z.string().optional().describe("Namespace filter. Omit for all Namespaces."),
		{},
	),
	key: cliOption(z.string().optional().describe("Exact Entry Key filter."), {}),
	branch: cliOption(z.string().optional().describe("Branch. Defaults to current branch."), {}),
	base: cliOption(z.boolean().default(false).describe("Restrict to Base Namespace."), {}),
	allBranches: cliOption(
		z.boolean().default(false).describe("List Entries from all branches."),
		{},
	),
});

const listResultSchema = z.object({
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

type ListRequest = z.infer<typeof listRequestSchema>;
type ListResult = z.infer<typeof listResultSchema>;

async function runList(ctx: BrmemCliContext, request: ListRequest) {
	const namespaceScope = resolveOptionalNamespaceScope(namespaceScopeRequest(request));
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
	if (entriesResult.type === "error") return gatewayFailure(entriesResult.error);
	return ok({
		namespaceScope: namespaceScopeLabel(scope),
		key: request.key ?? null,
		branch: branch ?? null,
		base: request.base,
		allBranches: request.allBranches,
		entries: entriesResult.value.map(entryJson),
	});
}

function renderList(result: ListResult, caps: RenderCapabilities = { canEmitAnsi: false }): string {
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
export async function command() {
	return defineCommand({
		requiresContext: true,
		schema: listRequestSchema,
		resultSchema: listResultSchema,
		handler: runList,
		renderHuman: renderList,
	});
}
