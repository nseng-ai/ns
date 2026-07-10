import { firstNonEmptyLine } from "@nseng-ai/foundation/text-normalization";
import {
	RealGitGateway,
	type GitGateway,
	type GitOptionalResult,
	type GitResult,
} from "@nseng-ai/capability-kit/git";
import { commandSucceeded, type CommandExecApi } from "@nseng-ai/foundation/command";

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
	optionalRepoRoot(params: { cwd: string }): Promise<GitOptionalResult<string>>;
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

type AutobranchProviderGitGateway = Pick<
	GitGateway,
	"optionalRepoRoot" | "currentBranch" | "headCommit" | "validateBranchRef" | "localBranchPresence"
>;

export interface AutobranchGitGatewayInput {
	cwd: string;
	exec: AutobranchExec;
}

function createAutobranchProviderGitGateway(exec: AutobranchExec): AutobranchProviderGitGateway {
	return new RealGitGateway(createAutobranchCommandExecApi(exec));
}

function createAutobranchCommandExecApi(exec: AutobranchExec): CommandExecApi {
	return {
		async exec(command, args, options) {
			return await exec(command, args, options?.timeout ?? GIT_FACT_TIMEOUT_MS);
		},
	};
}

export function createAutobranchGitGateway(input: AutobranchGitGatewayInput): AutobranchGitGateway {
	const providerGit = createAutobranchProviderGitGateway(input.exec);
	const raw = (args: string[], timeout: number) => runGit(input.exec, args, timeout);
	return {
		async optionalRepoRoot(params) {
			return providerGit.optionalRepoRoot(params);
		},
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
			if (!result.ok) return result;
			const [headSha, ...parentShas] = result.value.stdout.trim().split(/\s+/).filter(Boolean);
			if (!headSha) return { ok: false, details: "git rev-list returned no HEAD commit." };
			return { ok: true, value: { headSha, parentShas } };
		},
		async headCommitMessage() {
			const result = await raw(["log", "-1", "--format=%B"], GIT_FACT_TIMEOUT_MS);
			return mapGitCommand(result, (value) => value.stdout);
		},
		async headCommitDiff() {
			const result = await raw(["diff", "HEAD^", "HEAD", "--no-ext-diff"], GIT_FACT_TIMEOUT_MS);
			return mapGitCommand(result, (value) => value.stdout);
		},
		async upstreamOf(branch) {
			const result = await raw(
				["for-each-ref", "--format=%(upstream:short)", `refs/heads/${branch}`],
				GIT_FACT_TIMEOUT_MS,
			);
			return mapGitCommand(result, (value) => firstNonEmptyLine(value.stdout));
		},
		async isAncestor(ancestor, descendant) {
			const result = await input.exec(
				"git",
				["merge-base", "--is-ancestor", ancestor, descendant],
				GIT_FACT_TIMEOUT_MS,
			);
			if (result.type === "exited" && result.signal === null && result.code === 0) {
				return { ok: true, value: true };
			}
			if (result.type === "exited" && result.signal === null && result.code === 1) {
				return { ok: true, value: false };
			}
			return commandFailure(result);
		},
		async listStashes() {
			const result = await raw(["stash", "list", "--format=%gd%x00%s"], GIT_FACT_TIMEOUT_MS);
			return mapGitCommand(result, (value) => parseStashEntries(value.stdout));
		},
		async createBranchAt(branch, sha) {
			return mapGitCommand(
				await raw(["branch", branch, sha], GIT_MUTATION_TIMEOUT_MS),
				() => undefined,
			);
		},
		async resetHardTo(ref) {
			return mapGitCommand(
				await raw(["reset", "--hard", ref], GIT_MUTATION_TIMEOUT_MS),
				() => undefined,
			);
		},
		async deleteBranch(branch) {
			return mapGitCommand(
				await raw(["branch", "-D", branch], GIT_MUTATION_TIMEOUT_MS),
				() => undefined,
			);
		},
		async checkout(branch) {
			return mapGitCommand(
				await raw(["checkout", branch], GIT_MUTATION_TIMEOUT_MS),
				() => undefined,
			);
		},
		async stashPush(message) {
			return mapGitCommand(
				await raw(["stash", "push", "--include-untracked", "-m", message], STASH_PUSH_TIMEOUT_MS),
				() => undefined,
			);
		},
		async stashPop(ref) {
			return mapGitCommand(await raw(["stash", "pop", ref], STASH_POP_TIMEOUT_MS), () => undefined);
		},
		async isBranchNameAvailable(branchName) {
			const valid = await providerGit.validateBranchRef({ cwd: input.cwd, branch: branchName });
			if (!valid.ok) return false;

			for (const branch of [branchName, ...branchParentNames(branchName)]) {
				const exists = await providerGit.localBranchPresence({ cwd: input.cwd, branch });
				if (exists.type !== "absent") return false;
			}

			// capability-kit does not yet expose a child-ref enumeration verb, so keep this
			// autobranch-only guard raw while sharing the ref validation and exact-presence probes.
			const childRefs = await raw(
				["for-each-ref", "--format=%(refname)", `${branchHeadRef(branchName)}/`],
				BRANCH_NAME_TIMEOUT_MS,
			);
			return childRefs.ok && childRefs.value.stdout.trim().length === 0;
		},
	};
}

async function runGit(
	exec: AutobranchExec,
	args: string[],
	timeout: number,
): Promise<AutobranchGitResult<CommandResult>> {
	const result = await exec("git", args, timeout);
	if (!commandSucceeded(result)) return commandFailure(result);
	return { ok: true, value: result };
}

function mapGitCommand<T>(
	result: AutobranchGitResult<CommandResult>,
	mapValue: (value: CommandResult) => T,
): AutobranchGitResult<T> {
	return result.ok ? { ok: true, value: mapValue(result.value) } : result;
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

function branchParentNames(branchName: string): string[] {
	const segments = branchName.split("/");
	const names: string[] = [];
	for (let index = 1; index < segments.length; index += 1) {
		names.push(segments.slice(0, index).join("/"));
	}
	return names;
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
