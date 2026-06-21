import {
	BRANCH_CONTEXT_NAMESPACE,
	UNSUPPORTED_ATTACHED_PLAN_KEY,
	buildBranchContextPlanKey,
} from "./constants.ts";
import { normalizeRequestedBranchContextKey } from "./attached-plan.ts";
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
import type { CommandExecApi } from "@sdl/core/exec";
import type { GitGateway } from "@sdl/core/git";
import { listSavedPlans, resolvePlanSourceFile, type PlanStoreOptions } from "@sdl/plans";

export interface BranchContextPrimitiveOptions {
	cwd: string;
	context: BranchContextContext;
	signal?: AbortSignal | undefined;
	planStoreRoot?: string | undefined;
}

export interface AttachBranchContextParams {
	key?: string | undefined;
	filePath?: string | undefined;
	planSlug?: string | undefined;
	branch?: string | undefined;
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
	await assertBrmemEntryAbsent(context.brmem, context.branch, source.key);
	const data = await attachBranchContext({
		brmem: context.brmem,
		cwd: options.cwd,
		branch: context.branch,
		key: source.key,
		sourceFile: source.sourceFile,
	});
	return attachEvidence(data, source.planSlug);
}

export async function listBranchContextEntries(
	params: { branch?: string | undefined },
	options: BranchContextPrimitiveOptions,
): Promise<BranchContextListEvidence> {
	const context = await resolveBranchContextPrimitiveResolution(options, params.branch);
	const list = await listBranchContextPlans(context.brmem, { branch: context.branch });
	if (!list.ok) throw new Error(list.error.message);
	return { branch: context.branch, entries: list.value };
}

export async function checkBranchContextEntry(
	params: { key: string; branch?: string | undefined },
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
	params: { key: string; branch?: string | undefined },
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
): Promise<void> {
	const check = await checkBranchContextEntryPresence(brmem, { branch: targetBranch, key });
	if (check.type === "absent") {
		return;
	}
	if (check.type === "present") {
		throw new Error(
			[
				"Attached plan already exists on target branch; refusing to overwrite.",
				`Namespace: ${BRANCH_CONTEXT_NAMESPACE}`,
				`Branch: ${targetBranch}`,
				`Key: ${key}`,
			].join("\n"),
		);
	}
	throw new Error(check.error.message);
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
				: entry.key.endsWith(".md")
					? " (plan)"
					: "";
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
			throw new Error("Pass either --plan <slug> or <key> --file <path>, not both.");
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
		throw new Error("Attach requires either --plan <slug> or <key> --file <path>.");
	}
	const key = normalizeRequestedBranchContextKey(params.key);
	if (key === UNSUPPORTED_ATTACHED_PLAN_KEY) {
		throw new Error(
			"Legacy branch-context key plan.md is no longer supported; attach the plan under a named Markdown key such as <slug>.md.",
		);
	}
	return {
		key,
		sourceFile: await resolvePlanSourceFile(pi, {
			cwd: options.cwd,
			rawFilePath: params.filePath,
			signal: options.signal,
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

function planStoreOptions(options: BranchContextPrimitiveOptions): PlanStoreOptions {
	return {
		cwd: options.cwd,
		git: options.context.git,
		...(options.planStoreRoot === undefined ? {} : { planStoreRoot: options.planStoreRoot }),
		...(options.signal === undefined ? {} : { signal: options.signal }),
	};
}

function attachEvidence(
	data: BranchContextAttachData,
	planSlug: string | undefined,
): BranchContextAttachEvidence {
	return {
		...data,
		...(planSlug === undefined ? {} : { planSlug }),
	};
}
