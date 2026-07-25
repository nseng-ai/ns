import { firstNonEmptyLine } from "@nseng-ai/foundation/text-normalization";
import {
	RealGitGateway,
	type GitGateway,
	type GitOptionalResult,
	type GitResult,
} from "@nseng-ai/foundation/git";
import { commandSucceeded, type CommandExecApi } from "@nseng-ai/foundation/command";

import type { AutobranchExec, CommandResult } from "./shared.ts";
import { formatAutobranchCommandDetails } from "./shared.ts";

const GIT_FACT_TIMEOUT_MS = 30_000;
const GIT_MUTATION_TIMEOUT_MS = 30_000;
const STASH_PUSH_TIMEOUT_MS = 120_000;
const STASH_POP_TIMEOUT_MS = 120_000;
const BRANCH_NAME_TIMEOUT_MS = 30_000;
const NON_NEGATIVE_INTEGER_PATTERN = new RegExp("^\\d+$", "u");

export type AutobranchGitResult<T> = { ok: true; value: T } | { ok: false; details: string };

export type HeadUpstreamRelationship = "synchronized" | "local_ahead" | "remote_ahead" | "diverged";

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
	headUpstreamRelationship(
		upstream: string,
	): Promise<AutobranchGitResult<HeadUpstreamRelationship>>;
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
		// Keep raw commands in this cwd-bound section until a second consumer appears or extension-kit
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
		async headUpstreamRelationship(upstream) {
			const args = ["rev-list", "--left-right", "--count", `HEAD...${upstream}`];
			const displayCommand = `git ${args.join(" ")}`;
			const result = await raw(args, GIT_FACT_TIMEOUT_MS);
			if (!result.ok) {
				return { ok: false, details: `${displayCommand} failed.\n${result.details}` };
			}

			const relationship = parseHeadUpstreamRelationship(result.value.stdout);
			if (relationship === undefined) {
				return {
					ok: false,
					details: `${displayCommand} returned malformed output; expected exactly two non-negative safe-integer counts.`,
				};
			}
			return { ok: true, value: relationship };
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

			// extension-kit does not yet expose a child-ref enumeration verb, so keep this
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

function parseHeadUpstreamRelationship(stdout: string): HeadUpstreamRelationship | undefined {
	const nonEmptyLines = stdout.split(/\r?\n/u).filter((line) => line.trim().length > 0);
	if (nonEmptyLines.length !== 1) return undefined;

	const [headOnlyText, upstreamOnlyText, extraColumn] =
		nonEmptyLines[0]?.trim().split(/\s+/u) ?? [];
	if (headOnlyText === undefined || upstreamOnlyText === undefined || extraColumn !== undefined) {
		return undefined;
	}

	const headOnlyCount = parseNonNegativeSafeInteger(headOnlyText);
	const upstreamOnlyCount = parseNonNegativeSafeInteger(upstreamOnlyText);
	if (headOnlyCount === undefined || upstreamOnlyCount === undefined) return undefined;

	if (headOnlyCount === 0 && upstreamOnlyCount === 0) return "synchronized";
	if (upstreamOnlyCount === 0) return "local_ahead";
	if (headOnlyCount === 0) return "remote_ahead";
	return "diverged";
}

function parseNonNegativeSafeInteger(value: string): number | undefined {
	if (!NON_NEGATIVE_INTEGER_PATTERN.test(value)) return undefined;
	const parsed = Number.parseInt(value, 10);
	return Number.isSafeInteger(parsed) ? parsed : undefined;
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
