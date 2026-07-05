import { failure, negative, ok, type ClinkrFailureExit } from "@nseng-ai/clinkr";
import { optionalEntry } from "@nseng-ai/foundation/primitives";
import { z } from "zod";

import type { BrmemCliContext } from "../context.ts";
import { keyGlobMatches } from "../key-glob.ts";
import {
	compareEntries,
	mustEntryLocator,
	namespaceDisplayLabel,
	resolveRequiredNamespaceScope,
	type EntryRef,
} from "../ref-layout.ts";
import {
	firstFailure,
	validateBranchName,
	validateKeyGlob,
	validateNamespaceName,
	validationMessage,
} from "../validation.ts";
import { gatewayFailure } from "./shared.ts";

const copyPlanItemSchema = z.object({
	key: z.string(),
	sourceRef: z.string(),
	destinationRef: z.string(),
	sourceSha: z.string(),
});

export const copyRequestSchema = z.object({
	namespace: z.string().optional().describe("Namespace to copy."),
	base: z.boolean().default(false).describe("Copy Base Namespace."),
	fromBranch: z.string().describe("Source branch."),
	toBranch: z.string().describe("Destination branch."),
	overwrite: z.boolean().default(false).describe("Overwrite destination Entries."),
	dryRun: z
		.boolean()
		.default(false)
		.describe("Plan the Namespace Copy without mutating destination refs."),
	keyGlob: z.string().optional().describe("Entry Key glob filter."),
});

export const copyResultSchema = z.object({
	namespace: z.string(),
	fromBranch: z.string(),
	toBranch: z.string(),
	overwrite: z.boolean(),
	dryRun: z.boolean(),
	copied: z.array(copyPlanItemSchema),
	keyGlob: z.string().nullable(),
});

export type CopyRequest = z.infer<typeof copyRequestSchema>;
export type CopyPlanItem = z.infer<typeof copyPlanItemSchema>;
export type CopyResult = z.infer<typeof copyResultSchema>;

export async function runCopy(ctx: BrmemCliContext, request: CopyRequest) {
	const namespaceScope = resolveRequiredNamespaceScope(request);
	if (namespaceScope.type === "conflict")
		return failure(namespaceScope.code, namespaceScope.message);
	if (namespaceScope.type === "missing") {
		return failure(
			"copy-scope-missing",
			"Pass --base or --namespace <name> to choose the Namespace to copy.",
		);
	}

	const namespace = namespaceScope.scope.namespace;
	const validationFailure = firstFailure(
		[
			"invalid-namespace",
			validationMessage("namespace", namespace, validateNamespaceName(namespace)),
		],
		[
			"invalid-from-branch",
			validationMessage("branch name", request.fromBranch, validateBranchName(request.fromBranch)),
		],
		[
			"invalid-to-branch",
			validationMessage("branch name", request.toBranch, validateBranchName(request.toBranch)),
		],
		[
			"invalid-key-glob",
			request.keyGlob === undefined
				? undefined
				: validationMessage("Entry Key glob", request.keyGlob, validateKeyGlob(request.keyGlob)),
		],
	);
	if (validationFailure !== undefined) return failure(validationFailure[0], validationFailure[1]);

	const sourceEntriesResult = await ctx.gateway.listEntries({
		namespace,
		branch: request.fromBranch,
	});
	if (sourceEntriesResult.type === "error")
		return gatewayFailure<CopyResult>(sourceEntriesResult.error);
	const selectedSourceEntries = sourceEntriesResult.value
		.filter((entry) => request.keyGlob === undefined || keyGlobMatches(entry.key, request.keyGlob))
		.sort(compareEntries);
	if (selectedSourceEntries.length === 0) {
		return negative(noMatchingEntriesMessage(namespace, request), {
			data: emptyCopyResult(namespace, request),
		});
	}

	const destinationEntriesResult = await ctx.gateway.listEntries({
		namespace,
		branch: request.toBranch,
	});
	if (destinationEntriesResult.type === "error")
		return gatewayFailure<CopyResult>(destinationEntriesResult.error);
	const conflicts = destinationEntriesResult.value
		.filter((entry) => request.keyGlob === undefined || keyGlobMatches(entry.key, request.keyGlob))
		.map((entry) => entry.key)
		.sort();
	if (conflicts.length > 0 && !request.overwrite) {
		return negative(
			`Destination has conflicting Entries: ${conflicts.join(", ")}. Pass --overwrite to replace them.`,
			{
				data: emptyCopyResult(namespace, request),
			},
		);
	}

	const plan = await buildCopyPlan(ctx, namespace, request, selectedSourceEntries);
	if (plan.type === "failure") return plan.failure;
	const result: CopyResult = {
		namespace,
		fromBranch: request.fromBranch,
		toBranch: request.toBranch,
		overwrite: request.overwrite,
		dryRun: request.dryRun,
		copied: plan.items,
		keyGlob: request.keyGlob ?? null,
	};

	if (request.dryRun) return ok(result);

	const copied = await ctx.gateway.copyEntries({
		namespace,
		fromBranch: request.fromBranch,
		toBranch: request.toBranch,
		shouldOverwrite: request.overwrite,
		...optionalEntry("keyGlob", request.keyGlob),
	});
	if (copied.type === "error") {
		if (copied.error.code === "copy-conflict") {
			return negative(copied.error.message, {
				data: result,
			});
		}
		return gatewayFailure<CopyResult>(copied.error);
	}
	return ok(result);
}

export function renderCopy(result: CopyResult): string {
	const verb = result.dryRun ? "Would copy" : "Copied";
	const countLabel = result.copied.length === 1 ? "Entry" : "Entries";
	const lines = [
		`${verb} ${result.copied.length} ${countLabel} in ${namespaceDisplayLabel(result.namespace)} from Branch ${result.fromBranch} to Branch ${result.toBranch}.`,
	];
	if (result.keyGlob !== null) lines.push(`Entry Key glob: ${result.keyGlob}`);
	for (const item of result.copied) {
		lines.push(
			`Entry Key: ${item.key}`,
			`  Source SHA: ${item.sourceSha}`,
			`  Source Entry Locator: ${item.sourceRef}`,
			`  Destination Entry Locator: ${item.destinationRef}`,
		);
	}
	return lines.join("\n");
}

type CopyPlanResult =
	| { type: "ok"; items: CopyPlanItem[] }
	| { type: "failure"; failure: ClinkrFailureExit };

async function buildCopyPlan(
	ctx: BrmemCliContext,
	namespace: string,
	request: CopyRequest,
	selectedSourceEntries: readonly EntryRef[],
): Promise<CopyPlanResult> {
	const missingShaKeys: string[] = [];
	const items: CopyPlanItem[] = [];
	for (const entry of selectedSourceEntries) {
		const checked = await ctx.gateway.checkEntry({
			namespace,
			key: entry.key,
			branch: request.fromBranch,
		});
		if (checked.type === "error")
			return { type: "failure", failure: failure(checked.error.code, checked.error.message) };
		if (checked.type === "missing") {
			missingShaKeys.push(entry.key);
			continue;
		}
		items.push({
			key: entry.key,
			sourceRef: entry.entryLocator,
			destinationRef: mustEntryLocator(namespace, entry.key, request.toBranch),
			sourceSha: checked.value.headSha,
		});
	}
	if (missingShaKeys.length > 0) {
		return {
			type: "failure",
			failure: failure(
				"source-sha-unavailable",
				`Could not resolve source commit for Entry Keys: ${missingShaKeys.sort().join(", ")}`,
			),
		};
	}
	return { type: "ok", items: items.sort((left, right) => left.key.localeCompare(right.key)) };
}

function noMatchingEntriesMessage(namespace: string, request: CopyRequest): string {
	const scope = namespaceDisplayLabel(namespace);
	if (request.keyGlob === undefined)
		return `No Entries found on Branch ${request.fromBranch} in ${scope}.`;
	return `No Entries on Branch ${request.fromBranch} in ${scope} match --key-glob ${JSON.stringify(request.keyGlob)}.`;
}

function emptyCopyResult(namespace: string, request: CopyRequest): CopyResult {
	return {
		namespace,
		fromBranch: request.fromBranch,
		toBranch: request.toBranch,
		overwrite: request.overwrite,
		dryRun: request.dryRun,
		copied: [],
		keyGlob: request.keyGlob ?? null,
	};
}
