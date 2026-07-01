import { optionalEntries, optionalEntry } from "@sdl/core/primitives";

import {
	BRANCH_CONTEXT_NAMESPACE,
	UNSUPPORTED_ATTACHED_PLAN_KEY,
	buildBranchContextPlanKey,
	isSupportedBranchContextPlanKey,
} from "./constants.ts";
import { formatAvailableKeys, normalizeRequestedBranchContextKey } from "./attached-plan.ts";
import {
	attachBranchContextPlan,
	checkBranchContextEntryPresence,
	deleteBranchContextPlan,
	listBranchContextPlans,
	type AttachedPlanEntry,
	type BranchContextAttachData,
} from "./branch-memory.ts";
import type { BranchContextContext } from "./context.ts";
import type { BrmemGateway } from "@sdl/brmem";
import type { CommandExecApi } from "@sdl/exec";
import type { GitGateway } from "@sdl/git";
import { listSavedPlans, resolvePlanSourceFile, type PlanStoreOptions } from "@sdl/plans";

export interface BranchContextPrimitiveOptions {
	cwd: string;
	context: BranchContextContext;
	signal?: AbortSignal;
	planStoreRoot?: string;
}

export interface AttachBranchContextParams {
	key?: string;
	filePath?: string;
	planSlug?: string;
	branch?: string;
}

export type BranchContextAttachEvidence = BranchContextAttachData & { planSlug?: string };

export interface BranchContextListEvidence {
	branch: string;
	entries: AttachedPlanEntry[];
}

export interface BranchContextCheckEvidence {
	branch: string;
	namespace: string;
	key: string;
	present: boolean;
}

export interface BranchContextDeleteEvidence {
	branch: string;
	namespace: string;
	key: string;
	deleted: boolean;
}

export interface AttachBranchContextOptions {
	brmem: BrmemGateway;
	cwd: string;
	branch: string;
	key: string;
	sourceFile: string;
}

interface BrmemEntryAbsentOptions {
	formatPresentMessage?: (context: { targetBranch: string; key: string }) => string;
}

interface BranchContextPrimitiveResolution {
	git: GitGateway;
	brmem: BrmemGateway;
	branch: string;
}

export async function attachBranchContextEntry(
	pi: CommandExecApi,
	params: AttachBranchContextParams,
	options: BranchContextPrimitiveOptions,
): Promise<BranchContextAttachEvidence> {
	const context = await resolveBranchContextPrimitiveResolution(options, params.branch);
	const source = await resolveAttachSource(pi, params, options);
	const before = await listBranchContextNamespace(context.brmem, context.branch);
	assertBranchContextNamespaceSupported(context.branch, before);
	await assertBrmemEntryAbsent(context.brmem, context.branch, source.key);
	const data = await attachBranchContext({
		brmem: context.brmem,
		cwd: options.cwd,
		branch: context.branch,
		key: source.key,
		sourceFile: source.sourceFile,
	});
	const after = await listBranchContextNamespace(context.brmem, context.branch);
	assertAttachChangedNamespaceByOneKey({
		branch: context.branch,
		before,
		after,
		attachedKey: source.key,
	});
	return attachEvidence(data, source.planSlug);
}

export async function listBranchContextEntries(
	params: { branch?: string },
	options: BranchContextPrimitiveOptions,
): Promise<BranchContextListEvidence> {
	const context = await resolveBranchContextPrimitiveResolution(options, params.branch);
	const list = await listBranchContextPlans(context.brmem, { branch: context.branch });
	if (!list.ok) throw new Error(list.error.message);
	return { branch: context.branch, entries: list.value };
}

export async function checkBranchContextEntry(
	params: { key: string; branch?: string },
	options: BranchContextPrimitiveOptions,
): Promise<BranchContextCheckEvidence> {
	const context = await resolveBranchContextPrimitiveResolution(options, params.branch);
	const key = normalizeRequestedBranchContextKey(params.key);
	const presence = await checkBranchContextEntryPresence(context.brmem, {
		branch: context.branch,
		key,
	});
	if (presence.type === "error") throw new Error(presence.error.message);
	return {
		branch: context.branch,
		namespace: BRANCH_CONTEXT_NAMESPACE,
		key,
		present: presence.type === "present",
	};
}

export async function deleteBranchContextEntry(
	params: { key: string; branch?: string },
	options: BranchContextPrimitiveOptions,
): Promise<BranchContextDeleteEvidence> {
	const context = await resolveBranchContextPrimitiveResolution(options, params.branch);
	const key = normalizeRequestedBranchContextKey(params.key);
	const deleted = await deleteBranchContextPlan(context.brmem, {
		branch: context.branch,
		key,
	});
	if (!deleted.ok) throw new Error(deleted.error.message);
	return { branch: context.branch, namespace: BRANCH_CONTEXT_NAMESPACE, key, deleted: true };
}

export async function assertBrmemEntryAbsent(
	brmem: BrmemGateway,
	targetBranch: string,
	key: string,
	options: BrmemEntryAbsentOptions = {},
): Promise<void> {
	const check = await checkBranchContextEntryPresence(brmem, { branch: targetBranch, key });
	if (check.type === "absent") {
		return;
	}
	if (check.type === "present") {
		throw new Error(
			options.formatPresentMessage?.({ targetBranch, key }) ??
				formatDefaultBrmemEntryPresentMessage(targetBranch, key),
		);
	}
	throw new Error(check.error.message);
}

function formatDefaultBrmemEntryPresentMessage(targetBranch: string, key: string): string {
	return [
		"Attached plan already exists on target branch; refusing to overwrite.",
		`Namespace: ${BRANCH_CONTEXT_NAMESPACE}`,
		`Branch: ${targetBranch}`,
		`Key: ${key}`,
	].join("\n");
}

export async function attachBranchContext(
	options: AttachBranchContextOptions,
): Promise<BranchContextAttachData> {
	const attach = await attachBranchContextPlan(options.brmem, {
		cwd: options.cwd,
		branch: options.branch,
		key: options.key,
		sourceFile: options.sourceFile,
	});
	if (attach.ok) {
		return attach.value;
	}
	throw new AttachBranchContextError(attach.error.code, attach.error.message);
}

export class AttachBranchContextError extends Error {
	readonly code: string;

	constructor(code: string, message: string) {
		super(message);
		this.name = "AttachBranchContextError";
		this.code = code;
	}
}

export class AttachBranchContextUsageError extends Error {
	readonly code: string;

	constructor(code: string, message: string) {
		super(message);
		this.name = "AttachBranchContextUsageError";
		this.code = code;
	}
}

export class BranchContextNamespaceInvalidError extends Error {
	readonly code = "branch-context-namespace-invalid";
	readonly branch: string;
	readonly unsupportedKeys: readonly string[];

	constructor(branch: string, unsupportedKeys: readonly string[]) {
		super(
			[
				`Branch-context namespace on branch ${JSON.stringify(branch)} contains unsupported Entries; refusing to attach into an invalid namespace.`,
				"",
				"Unsupported keys:",
				formatAvailableKeys(unsupportedKeys),
			].join("\n"),
		);
		this.name = "BranchContextNamespaceInvalidError";
		this.branch = branch;
		this.unsupportedKeys = [...unsupportedKeys];
	}
}

export function formatAttachEvidence(evidence: BranchContextAttachEvidence): string {
	return [
		"Attached branch-context entry.",
		`Branch: ${evidence.branch}`,
		`Namespace: ${evidence.namespace}`,
		`Key: ${evidence.key}`,
		`Ref: ${evidence.refName}`,
		`Commit: ${evidence.commit}`,
		`Source file: ${evidence.sourceFile}`,
		...(evidence.planSlug === undefined ? [] : [`Plan slug: ${evidence.planSlug}`]),
	].join("\n");
}

export function formatListEvidence(branch: string, entries: readonly AttachedPlanEntry[]): string {
	const lines = [`Branch context entries on ${branch}:`];
	if (entries.length === 0) {
		lines.push("(none)");
		return lines.join("\n");
	}
	for (const entry of entries) {
		const label =
			entry.key === UNSUPPORTED_ATTACHED_PLAN_KEY
				? " (unsupported legacy plan key)"
				: isSupportedBranchContextPlanKey(entry.key)
					? " (plan)"
					: " (unsupported)";
		lines.push(`- ${entry.key}${label}`);
	}
	return lines.join("\n");
}

export function formatCheckEvidence(evidence: BranchContextCheckEvidence): string {
	return [
		`Branch: ${evidence.branch}`,
		`Namespace: ${evidence.namespace}`,
		`Key: ${evidence.key}`,
		`Present: ${evidence.present}`,
	].join("\n");
}

export function formatDeleteEvidence(evidence: BranchContextDeleteEvidence): string {
	return [
		`Deleted branch-context entry.`,
		`Branch: ${evidence.branch}`,
		`Namespace: ${evidence.namespace}`,
		`Key: ${evidence.key}`,
	].join("\n");
}

async function resolveAttachSource(
	pi: CommandExecApi,
	params: AttachBranchContextParams,
	options: BranchContextPrimitiveOptions,
): Promise<{ key: string; sourceFile: string; planSlug?: string }> {
	if (params.planSlug !== undefined) {
		if (params.key !== undefined || params.filePath !== undefined) {
			throw new AttachBranchContextUsageError(
				"invalid-attach-source",
				"Pass either --plan <slug> or <key> --file <path>, not both.",
			);
		}
		const available = await listSavedPlans(pi, planStoreOptions(options));
		const matches = available.filter((plan) => plan.slug === params.planSlug);
		if (matches.length === 0) {
			throw new Error(
				[
					`No saved plan found for slug \`${params.planSlug}\`.`,
					"",
					"Available slugs:",
					...available.map((plan) => `- ${plan.slug}`),
				].join("\n"),
			);
		}
		if (matches.length > 1) {
			throw new Error(
				[
					`Multiple saved plans found for slug \`${params.planSlug}\`; choose a file explicitly.`,
					"",
					...matches.map((plan) => `- ${plan.branchKey}: ${plan.filePath}`),
				].join("\n"),
			);
		}
		const match = matches[0]!;
		return {
			key: buildBranchContextPlanKey(match.slug),
			sourceFile: match.filePath,
			planSlug: match.slug,
		};
	}
	if (params.key === undefined || params.filePath === undefined) {
		throw new AttachBranchContextUsageError(
			"missing-attach-source",
			"Attach requires either --plan <slug> or <key> --file <path>.",
		);
	}
	const key = normalizeRequestedBranchContextKey(params.key);
	if (key === UNSUPPORTED_ATTACHED_PLAN_KEY) {
		throw new AttachBranchContextUsageError(
			"unsupported-attach-key",
			"Legacy branch-context key plan.md is no longer supported; attach the plan under a named Markdown key such as <slug>.md.",
		);
	}
	if (!isSupportedBranchContextPlanKey(key)) {
		throw new AttachBranchContextUsageError(
			"unsupported-attach-key",
			"Branch-context attach keys must be named Markdown plan keys derived from a valid plan slug, such as <slug>.md.",
		);
	}
	return {
		key,
		sourceFile: await resolvePlanSourceFile(pi, {
			cwd: options.cwd,
			rawFilePath: params.filePath,
			...optionalEntry("signal", options.signal),
			git: options.context.git,
		}),
	};
}

async function resolveBranchContextPrimitiveResolution(
	options: BranchContextPrimitiveOptions,
	requestedBranch: string | undefined,
): Promise<BranchContextPrimitiveResolution> {
	const branch = await resolveAttachBranch(options.context.git, options, requestedBranch);
	return { git: options.context.git, brmem: options.context.brmem, branch };
}

async function resolveAttachBranch(
	git: GitGateway,
	options: BranchContextPrimitiveOptions,
	requestedBranch: string | undefined,
): Promise<string> {
	const branch = requestedBranch?.trim();
	if (branch !== undefined && branch.length > 0) return branch;
	const current = await git.currentBranch({ cwd: options.cwd, signal: options.signal });
	if (current.type === "branch") return current.branch;
	if (current.type === "detached") {
		throw new Error(
			"Cannot default branch-context operation from detached HEAD. Pass --branch explicitly.",
		);
	}
	throw new Error(
		[
			"Cannot default branch-context operation because the current branch could not be resolved. Pass --branch explicitly.",
			"",
			current.error.message,
		].join("\n"),
	);
}

async function listBranchContextNamespace(
	brmem: BrmemGateway,
	branch: string,
): Promise<AttachedPlanEntry[]> {
	const list = await listBranchContextPlans(brmem, { branch });
	if (!list.ok) throw new Error(list.error.message);
	return list.value;
}

function assertBranchContextNamespaceSupported(
	branch: string,
	entries: readonly AttachedPlanEntry[],
): void {
	const unsupportedKeys = entries
		.map((entry) => entry.key)
		.filter((key) => !isSupportedBranchContextPlanKey(key))
		.sort();
	if (unsupportedKeys.length === 0) return;
	throw new BranchContextNamespaceInvalidError(branch, unsupportedKeys);
}

interface AssertAttachChangedNamespaceByOneKeyOptions {
	branch: string;
	before: readonly AttachedPlanEntry[];
	after: readonly AttachedPlanEntry[];
	attachedKey: string;
}

function assertAttachChangedNamespaceByOneKey(
	options: AssertAttachChangedNamespaceByOneKeyOptions,
): void {
	assertBranchContextNamespaceSupported(options.branch, options.after);
	const expectedKeys = new Set(options.before.map((entry) => entry.key));
	expectedKeys.add(options.attachedKey);
	const actualKeys = new Set(options.after.map((entry) => entry.key));
	if (
		expectedKeys.size === actualKeys.size &&
		[...expectedKeys].every((key) => actualKeys.has(key))
	) {
		return;
	}
	throw new AttachBranchContextError(
		"branch-context-namespace-invalid",
		[
			`Branch-context attach did not change namespace by exactly the intended key on branch ${JSON.stringify(options.branch)}.`,
			`Expected keys: ${formatAvailableKeys([...expectedKeys].sort())}`,
			`Actual keys: ${formatAvailableKeys([...actualKeys].sort())}`,
		].join("\n"),
	);
}

function planStoreOptions(options: BranchContextPrimitiveOptions): PlanStoreOptions {
	return {
		cwd: options.cwd,
		git: options.context.git,
		...optionalEntries({ planStoreRoot: options.planStoreRoot, signal: options.signal }),
	};
}

function attachEvidence(
	data: BranchContextAttachData,
	planSlug: string | undefined,
): BranchContextAttachEvidence {
	return {
		...data,
		...optionalEntry("planSlug", planSlug),
	};
}
