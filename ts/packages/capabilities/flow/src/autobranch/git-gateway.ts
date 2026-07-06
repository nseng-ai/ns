import { firstNonEmptyLine } from "@nseng-ai/foundation/text-normalization";
import { RealGitGateway, type GitGateway, type GitResult } from "@nseng-ai/capability-kit/git";
import type { CommandExecApi, ExecResult } from "@nseng-ai/foundation/exec";

import type { AutobranchExec, CommandResult } from "./shared.ts";
import { formatAutobranchCommandDetails } from "./shared.ts";

const GIT_FACT_TIMEOUT_MS = 30_000;
const GIT_MUTATION_TIMEOUT_MS = 30_000;
const STASH_PUSH_TIMEOUT_MS = 120_000;
const STASH_POP_TIMEOUT_MS = 120_000;
const BRANCH_NAME_TIMEOUT_MS = 30_000;

export type AutobranchGitResult<T> = { ok: true; value: T } | { ok: false; details: string };

export interface HeadParents {
	headSha: string;
	parentShas: string[];
}

export interface StashEntry {
	ref: string;
	subject: string;
}

export interface AutobranchGitGateway {
	currentBranch(): Promise<AutobranchGitResult<string>>;
	headSha(): Promise<AutobranchGitResult<string>>;
	headParents(): Promise<AutobranchGitResult<HeadParents>>;
	headCommitMessage(): Promise<AutobranchGitResult<string>>;
	headCommitDiff(): Promise<AutobranchGitResult<string>>;
	upstreamOf(branch: string): Promise<AutobranchGitResult<string | undefined>>;
	isAncestor(ancestor: string, descendant: string): Promise<AutobranchGitResult<boolean>>;
	listStashes(): Promise<AutobranchGitResult<StashEntry[]>>;
	createBranchAt(branch: string, sha: string): Promise<AutobranchGitResult<void>>;
	resetHardTo(ref: string): Promise<AutobranchGitResult<void>>;
	deleteBranch(branch: string): Promise<AutobranchGitResult<void>>;
	checkout(branch: string): Promise<AutobranchGitResult<void>>;
	stashPush(message: string): Promise<AutobranchGitResult<void>>;
	stashPop(ref: string): Promise<AutobranchGitResult<void>>;
	isBranchNameAvailable(branchName: string): Promise<boolean>;
}

export interface AutobranchGitGatewayInput {
	cwd: string;
	exec: AutobranchExec;
	git?: Pick<GitGateway, "currentBranch" | "headCommit">;
}

export function createAutobranchGitGateway(input: AutobranchGitGatewayInput): AutobranchGitGateway {
	const providerGit = input.git ?? new RealGitGateway(createCwdBoundExecApi(input));
	const raw = (args: string[], timeout: number) => input.exec("git", args, timeout);
	return {
		async currentBranch() {
			const branch = await providerGit.currentBranch({ cwd: input.cwd });
			if (branch.type === "branch") return { ok: true, value: branch.branch };
			if (branch.type === "detached") return { ok: true, value: "" };
			return { ok: false, details: branch.error.message };
		},
		async headSha() {
			return adaptGitResult(await providerGit.headCommit({ cwd: input.cwd }));
		},

		// Raw autobranch-only git helpers. These commands preserve the pre-existing autobranch
		// command argv and concise failure text while the shared kit gateway grows reusable methods.
		// Keep raw commands in this cwd-bound section until a second consumer appears or capability-kit
		// exposes a semantically equivalent method whose errors translate without changing autobranch output.
		async headParents() {
			const result = await raw(["rev-list", "--parents", "-n", "1", "HEAD"], GIT_FACT_TIMEOUT_MS);
			if (result.code !== 0) return commandFailure(result);
			const [headSha, ...parentShas] = result.stdout.trim().split(/\s+/).filter(Boolean);
			if (!headSha) return { ok: false, details: "git rev-list returned no HEAD commit." };
			return { ok: true, value: { headSha, parentShas } };
		},
		async headCommitMessage() {
			const result = await raw(["log", "-1", "--format=%B"], GIT_FACT_TIMEOUT_MS);
			if (result.code !== 0) return commandFailure(result);
			return { ok: true, value: result.stdout };
		},
		async headCommitDiff() {
			const result = await raw(["diff", "HEAD^", "HEAD", "--no-ext-diff"], GIT_FACT_TIMEOUT_MS);
			if (result.code !== 0) return commandFailure(result);
			return { ok: true, value: result.stdout };
		},
		async upstreamOf(branch) {
			const result = await raw(
				["for-each-ref", "--format=%(upstream:short)", `refs/heads/${branch}`],
				GIT_FACT_TIMEOUT_MS,
			);
			if (result.code !== 0) return commandFailure(result);
			return { ok: true, value: firstNonEmptyLine(result.stdout) };
		},
		async isAncestor(ancestor, descendant) {
			const result = await raw(
				["merge-base", "--is-ancestor", ancestor, descendant],
				GIT_FACT_TIMEOUT_MS,
			);
			if (result.code === 0) return { ok: true, value: true };
			if (result.code === 1) return { ok: true, value: false };
			return commandFailure(result);
		},
		async listStashes() {
			const result = await raw(["stash", "list", "--format=%gd%x00%s"], GIT_FACT_TIMEOUT_MS);
			if (result.code !== 0) return commandFailure(result);
			return { ok: true, value: parseStashEntries(result.stdout) };
		},
		async createBranchAt(branch, sha) {
			const result = await raw(["branch", branch, sha], GIT_MUTATION_TIMEOUT_MS);
			if (result.code !== 0) return commandFailure(result);
			return { ok: true, value: undefined };
		},
		async resetHardTo(ref) {
			const result = await raw(["reset", "--hard", ref], GIT_MUTATION_TIMEOUT_MS);
			if (result.code !== 0) return commandFailure(result);
			return { ok: true, value: undefined };
		},
		async deleteBranch(branch) {
			const result = await raw(["branch", "-D", branch], GIT_MUTATION_TIMEOUT_MS);
			if (result.code !== 0) return commandFailure(result);
			return { ok: true, value: undefined };
		},
		async checkout(branch) {
			const result = await raw(["checkout", branch], GIT_MUTATION_TIMEOUT_MS);
			if (result.code !== 0) return commandFailure(result);
			return { ok: true, value: undefined };
		},
		async stashPush(message) {
			const result = await raw(
				["stash", "push", "--include-untracked", "-m", message],
				STASH_PUSH_TIMEOUT_MS,
			);
			if (result.code !== 0) return commandFailure(result);
			return { ok: true, value: undefined };
		},
		async stashPop(ref) {
			const result = await raw(["stash", "pop", ref], STASH_POP_TIMEOUT_MS);
			if (result.code !== 0) return commandFailure(result);
			return { ok: true, value: undefined };
		},
		async isBranchNameAvailable(branchName) {
			const valid = await raw(["check-ref-format", "--branch", branchName], BRANCH_NAME_TIMEOUT_MS);
			if (valid.code !== 0) return false;

			const refsToCheck = [branchHeadRef(branchName), ...branchParentHeadRefs(branchName)];
			for (const ref of refsToCheck) {
				const exists = await raw(["show-ref", "--verify", "--quiet", ref], BRANCH_NAME_TIMEOUT_MS);
				if (exists.code !== 1) return false;
			}

			const childRefs = await raw(
				["for-each-ref", "--format=%(refname)", `${branchHeadRef(branchName)}/`],
				BRANCH_NAME_TIMEOUT_MS,
			);
			return childRefs.code === 0 && childRefs.stdout.trim().length === 0;
		},
	};
}

function createCwdBoundExecApi(input: AutobranchGitGatewayInput): CommandExecApi {
	return {
		async exec(command, args, options) {
			if (options?.cwd !== undefined && options.cwd !== input.cwd) {
				return {
					code: 2,
					stdout: "",
					stderr: `autobranch git execution is scoped to ${input.cwd}; refusing command cwd ${options.cwd}.`,
					killed: false,
				};
			}
			return toExecResult(await input.exec(command, args, options?.timeout ?? GIT_FACT_TIMEOUT_MS));
		},
	};
}

function toExecResult(result: CommandResult): ExecResult {
	return { ...result, killed: result.killed ?? false };
}

function adaptGitResult<T>(result: GitResult<T>): AutobranchGitResult<T> {
	return result.ok ? result : { ok: false, details: result.error.message };
}

function commandFailure<T>(result: CommandResult): AutobranchGitResult<T> {
	return { ok: false, details: formatAutobranchCommandDetails(result) };
}

function branchHeadRef(branchName: string): string {
	return `refs/heads/${branchName}`;
}

function branchParentHeadRefs(branchName: string): string[] {
	const segments = branchName.split("/");
	const refs: string[] = [];
	for (let index = 1; index < segments.length; index += 1) {
		refs.push(branchHeadRef(segments.slice(0, index).join("/")));
	}
	return refs;
}

function parseStashEntries(stdout: string): StashEntry[] {
	const entries: StashEntry[] = [];
	for (const line of stdout.split("\n")) {
		const [ref, subject] = line.split("\0");
		if (ref && subject !== undefined) {
			entries.push({ ref, subject });
		}
	}
	return entries;
}
