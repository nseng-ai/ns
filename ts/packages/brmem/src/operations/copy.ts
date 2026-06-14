import { failure, ok, type ClinkrFailureExit } from "@asdl/clinkr";
import { z } from "zod";

import type { BrmemCliContext } from "../context.ts";
import { keyGlobMatches } from "../key-glob.ts";
import { BASE_NAMESPACE, compareEntries, mustEntryLocator, namespaceDisplayLabel, normalizeNamespaceOption, type EntryRef } from "../ref-layout.ts";
import { firstFailure, validateBranchName, validateKeyGlob, validateNamespaceName, validationMessage } from "../validation.ts";
import { gatewayFailure } from "./shared.ts";

const copyPlanItemSchema = z.object({
	key: z.string(),
	source_ref: z.string(),
	destination_ref: z.string(),
	source_sha: z.string(),
});

export const copyRequestSchema = z.object({
	namespace: z.string().optional().describe("Namespace to copy."),
	base: z.boolean().default(false).describe("Copy Base Namespace."),
	from_branch: z.string().describe("Source branch."),
	to_branch: z.string().describe("Destination branch."),
	overwrite: z.boolean().default(false).describe("Overwrite destination Entries."),
	dry_run: z.boolean().default(false).describe("Plan the Namespace Copy without mutating destination refs."),
	key_glob: z.string().optional().describe("Entry Key glob filter."),
});

export const copyResultSchema = z.object({
	namespace: z.string(),
	from_branch: z.string(),
	to_branch: z.string(),
	overwrite: z.boolean(),
	dry_run: z.boolean(),
	copied: z.array(copyPlanItemSchema),
	key_glob: z.string().nullable(),
});

export type CopyRequest = z.infer<typeof copyRequestSchema>;
export type CopyPlanItem = z.infer<typeof copyPlanItemSchema>;
export type CopyResult = z.infer<typeof copyResultSchema>;

export async function runCopy(ctx: BrmemCliContext, request: CopyRequest) {
	if (request.base && request.namespace !== undefined) {
		return failure("base_and_namespace_conflict", "--base and --namespace are mutually exclusive.");
	}
	if (!request.base && request.namespace === undefined) {
		return failure("copy_scope_missing", "Pass --base or --namespace <name> to choose the Namespace to copy.");
	}

	const namespace = request.base ? BASE_NAMESPACE : normalizeNamespaceOption(request.namespace);
	const validationFailure = firstFailure(
		["invalid_namespace", validationMessage("namespace", namespace, validateNamespaceName(namespace))],
		["invalid_from_branch", validationMessage("branch name", request.from_branch, validateBranchName(request.from_branch))],
		["invalid_to_branch", validationMessage("branch name", request.to_branch, validateBranchName(request.to_branch))],
		[
			"invalid_key_glob",
			request.key_glob === undefined ? undefined : validationMessage("Entry Key glob", request.key_glob, validateKeyGlob(request.key_glob)),
		],
	);
	if (validationFailure !== undefined) return failure(validationFailure[0], validationFailure[1]);

	const sourceEntriesResult = await ctx.gateway.listEntries({ namespace, branch: request.from_branch });
	if (sourceEntriesResult.type === "error") return gatewayFailure<CopyResult>(sourceEntriesResult.error);
	const selectedSourceEntries = sourceEntriesResult.value
		.filter((entry) => request.key_glob === undefined || keyGlobMatches(entry.key, request.key_glob))
		.sort(compareEntries);
	if (selectedSourceEntries.length === 0) {
		return failure("no_matching_entries", noMatchingEntriesMessage(namespace, request));
	}

	const destinationEntriesResult = await ctx.gateway.listEntries({ namespace, branch: request.to_branch });
	if (destinationEntriesResult.type === "error") return gatewayFailure<CopyResult>(destinationEntriesResult.error);
	const conflicts = destinationEntriesResult.value
		.filter((entry) => request.key_glob === undefined || keyGlobMatches(entry.key, request.key_glob))
		.map((entry) => entry.key)
		.sort();
	if (conflicts.length > 0 && !request.overwrite) {
		return failure("destination_conflict", `Destination has conflicting Entries: ${conflicts.join(", ")}. Pass --overwrite to replace them.`);
	}

	const plan = await buildCopyPlan(ctx, namespace, request, selectedSourceEntries);
	if (plan.type === "failure") return plan.failure;
	const result: CopyResult = {
		namespace,
		from_branch: request.from_branch,
		to_branch: request.to_branch,
		overwrite: request.overwrite,
		dry_run: request.dry_run,
		copied: plan.items,
		key_glob: request.key_glob ?? null,
	};

	if (request.dry_run) return ok(result);

	const copied = await ctx.gateway.copyEntries({
		namespace,
		fromBranch: request.from_branch,
		toBranch: request.to_branch,
		shouldOverwrite: request.overwrite,
		keyGlob: request.key_glob,
	});
	if (copied.type === "error") {
		if (copied.error.code === "copy_conflict") return failure("destination_conflict", copied.error.message);
		return gatewayFailure<CopyResult>(copied.error);
	}
	return ok(result);
}

export function renderCopy(result: CopyResult): string {
	const verb = result.dry_run ? "Would copy" : "Copied";
	const countLabel = result.copied.length === 1 ? "Entry" : "Entries";
	const lines = [
		`${verb} ${result.copied.length} ${countLabel} in ${namespaceDisplayLabel(result.namespace)} from Branch ${result.from_branch} to Branch ${result.to_branch}.`,
	];
	if (result.key_glob !== null) lines.push(`Entry Key glob: ${result.key_glob}`);
	for (const item of result.copied) {
		lines.push(
			`Entry Key: ${item.key}`,
			`  Source SHA: ${item.source_sha}`,
			`  Source Entry Locator: ${item.source_ref}`,
			`  Destination Entry Locator: ${item.destination_ref}`,
		);
	}
	return lines.join("\n");
}

type CopyPlanResult = { type: "ok"; items: CopyPlanItem[] } | { type: "failure"; failure: ClinkrFailureExit };

async function buildCopyPlan(
	ctx: BrmemCliContext,
	namespace: string,
	request: CopyRequest,
	selectedSourceEntries: readonly EntryRef[],
): Promise<CopyPlanResult> {
	const missingShaKeys: string[] = [];
	const items: CopyPlanItem[] = [];
	for (const entry of selectedSourceEntries) {
		const checked = await ctx.gateway.checkEntry({ namespace, key: entry.key, branch: request.from_branch });
		if (checked.type === "error") return { type: "failure", failure: failure(checked.error.code, checked.error.message) };
		if (checked.type === "missing") {
			missingShaKeys.push(entry.key);
			continue;
		}
		items.push({
			key: entry.key,
			source_ref: entry.entryLocator,
			destination_ref: mustEntryLocator(namespace, entry.key, request.to_branch),
			source_sha: checked.value.headSha,
		});
	}
	if (missingShaKeys.length > 0) {
		return {
			type: "failure",
			failure: failure("source_sha_unavailable", `Could not resolve source commit for Entry Keys: ${missingShaKeys.sort().join(", ")}`),
		};
	}
	return { type: "ok", items: items.sort((left, right) => left.key.localeCompare(right.key)) };
}

function noMatchingEntriesMessage(namespace: string, request: CopyRequest): string {
	const scope = namespaceDisplayLabel(namespace);
	if (request.key_glob === undefined) return `No Entries found on Branch ${request.from_branch} in ${scope}.`;
	return `No Entries on Branch ${request.from_branch} in ${scope} match --key-glob ${JSON.stringify(request.key_glob)}.`;
}
