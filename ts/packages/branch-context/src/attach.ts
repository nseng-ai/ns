import { BRANCH_CONTEXT_NAMESPACE, BRANCH_CONTEXT_PLAN_KEY } from "./constants.ts";
import { normalizeRequestedBranchContextKey } from "./attached-plan.ts";
import { attachBranchContext, type BranchContextEvidence } from "./branch-context-creation.ts";
import { RealBranchContextBrmemGateway, type AttachedPlanEntry, type BranchContextBrmemGateway, type BrmemPutData } from "./brmem-gateway.ts";
import type { CommandExecApi } from "@asdl/core/exec";
import { RealGitGateway, type GitGateway } from "@asdl/core/git";
import { listSavedPlans, resolvePlanSourceFile } from "@asdl/plans";

export interface BranchContextPrimitiveOptions {
	cwd: string;
	signal?: AbortSignal | undefined;
	git?: GitGateway | undefined;
	brmem?: BranchContextBrmemGateway | undefined;
	planStoreRoot?: string | undefined;
}

export interface AttachBranchContextParams {
	key?: string | undefined;
	filePath?: string | undefined;
	planSlug?: string | undefined;
	branch?: string | undefined;
}

export interface BranchContextAttachEvidence {
	branch: string;
	namespace: string;
	key: string;
	refName: string;
	commit: string;
	sourceFile: string;
	planSlug?: string;
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

export async function attachBranchContextEntry(
	pi: CommandExecApi,
	params: AttachBranchContextParams,
	options: BranchContextPrimitiveOptions,
): Promise<BranchContextAttachEvidence> {
	const git = options.git ?? new RealGitGateway(pi);
	const brmem = options.brmem ?? new RealBranchContextBrmemGateway(pi);
	const branch = await resolveAttachBranch(git, options, params.branch);
	const source = await resolveAttachSource(pi, params, options);
	const data = await attachBranchContext({
		brmem,
		cwd: options.cwd,
		branch,
		key: source.key,
		sourceFile: source.sourceFile,
		signal: options.signal,
	});
	return attachEvidence(data, source.planSlug);
}

export async function listBranchContextEntries(
	pi: CommandExecApi,
	params: { branch?: string | undefined },
	options: BranchContextPrimitiveOptions,
): Promise<AttachedPlanEntry[]> {
	const git = options.git ?? new RealGitGateway(pi);
	const brmem = options.brmem ?? new RealBranchContextBrmemGateway(pi);
	const branch = await resolveAttachBranch(git, options, params.branch);
	const list = await brmem.listAttachedPlans({ cwd: options.cwd, branch, signal: options.signal });
	if (!list.ok) throw new Error(list.error.message);
	return list.value;
}

export async function checkBranchContextEntry(
	pi: CommandExecApi,
	params: { key: string; branch?: string | undefined },
	options: BranchContextPrimitiveOptions,
): Promise<BranchContextCheckEvidence> {
	const git = options.git ?? new RealGitGateway(pi);
	const brmem = options.brmem ?? new RealBranchContextBrmemGateway(pi);
	const branch = await resolveAttachBranch(git, options, params.branch);
	const key = normalizeRequestedBranchContextKey(params.key);
	const presence = await brmem.attachmentPresence({ cwd: options.cwd, branch, key, signal: options.signal });
	if (presence.type === "error") throw new Error(presence.error.message);
	return { branch, namespace: BRANCH_CONTEXT_NAMESPACE, key, present: presence.type === "present" };
}

export async function deleteBranchContextEntry(
	pi: CommandExecApi,
	params: { key: string; branch?: string | undefined },
	options: BranchContextPrimitiveOptions,
): Promise<BranchContextDeleteEvidence> {
	const git = options.git ?? new RealGitGateway(pi);
	const brmem = options.brmem ?? new RealBranchContextBrmemGateway(pi);
	const branch = await resolveAttachBranch(git, options, params.branch);
	const key = normalizeRequestedBranchContextKey(params.key);
	const deleted = await brmem.deleteEntry({ cwd: options.cwd, branch, key, signal: options.signal });
	if (!deleted.ok) throw new Error(deleted.error.message);
	return { branch, namespace: BRANCH_CONTEXT_NAMESPACE, key, deleted: true };
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
		const label = entry.key === BRANCH_CONTEXT_PLAN_KEY ? " (plan)" : "";
		lines.push(`- ${entry.key}${label}`);
	}
	return lines.join("\n");
}

export function formatCheckEvidence(evidence: BranchContextCheckEvidence): string {
	return [`Branch: ${evidence.branch}`, `Namespace: ${evidence.namespace}`, `Key: ${evidence.key}`, `Present: ${evidence.present}`].join("\n");
}

export function formatDeleteEvidence(evidence: BranchContextDeleteEvidence): string {
	return [`Deleted branch-context entry.`, `Branch: ${evidence.branch}`, `Namespace: ${evidence.namespace}`, `Key: ${evidence.key}`].join("\n");
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
		const matches = (await listSavedPlans(pi, { cwd: options.cwd, git: options.git, planStoreRoot: options.planStoreRoot, signal: options.signal })).filter(
			(plan) => plan.slug === params.planSlug,
		);
		if (matches.length === 0) {
			const available = await listSavedPlans(pi, { cwd: options.cwd, git: options.git, planStoreRoot: options.planStoreRoot, signal: options.signal });
			throw new Error([`No saved plan found for slug \`${params.planSlug}\`.`, "", "Available slugs:", ...available.map((plan) => `- ${plan.slug}`)].join("\n"));
		}
		if (matches.length > 1) {
			throw new Error([`Multiple saved plans found for slug \`${params.planSlug}\`; choose a file explicitly.`, "", ...matches.map((plan) => `- ${plan.branchKey}: ${plan.filePath}`)].join("\n"));
		}
		const [match] = matches;
		if (match === undefined) throw new Error(`No saved plan found for slug \`${params.planSlug}\`.`);
		return { key: BRANCH_CONTEXT_PLAN_KEY, sourceFile: match.filePath, planSlug: match.slug };
	}
	if (params.key === undefined || params.filePath === undefined) {
		throw new Error("Attach requires either --plan <slug> or <key> --file <path>.");
	}
	return {
		key: normalizeRequestedBranchContextKey(params.key),
		sourceFile: await resolvePlanSourceFile(pi, { cwd: options.cwd, rawFilePath: params.filePath, signal: options.signal, git: options.git }),
	};
}

async function resolveAttachBranch(git: GitGateway, options: BranchContextPrimitiveOptions, requestedBranch: string | undefined): Promise<string> {
	const branch = requestedBranch?.trim();
	if (branch !== undefined && branch.length > 0) return branch;
	const current = await git.currentBranch({ cwd: options.cwd, signal: options.signal });
	if (!current.ok) {
		throw new Error(["Cannot default branch-context operation from detached HEAD. Pass --branch explicitly.", "", current.error.message].join("\n"));
	}
	return current.value;
}

function attachEvidence(data: BrmemPutData, planSlug: string | undefined): BranchContextAttachEvidence {
	return {
		branch: data.branch,
	namespace: data.namespace,
		key: data.key,
		refName: data.refName,
		commit: data.commit,
		sourceFile: data.sourceFile,
		...(planSlug === undefined ? {} : { planSlug }),
	};
}
