import { firstNonEmptyLine } from "@nseng-ai/foundation/text-normalization";

import type { AutobranchExec } from "./shared.ts";
import { formatAutobranchCommandDetails } from "./shared.ts";

const GIT_FACT_TIMEOUT_MS = 30_000;
const GIT_MUTATION_TIMEOUT_MS = 30_000;
const STASH_PUSH_TIMEOUT_MS = 120_000;
const STASH_POP_TIMEOUT_MS = 120_000;

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
}

export function createAutobranchGitGateway(exec: AutobranchExec): AutobranchGitGateway {
	return {
		async currentBranch() {
			const result = await exec("git", ["branch", "--show-current"], GIT_FACT_TIMEOUT_MS);
			if (result.code !== 0) return { ok: false, details: formatAutobranchCommandDetails(result) };
			return { ok: true, value: result.stdout.trim() };
		},
		async headSha() {
			const result = await exec("git", ["rev-parse", "HEAD"], GIT_FACT_TIMEOUT_MS);
			if (result.code !== 0) return { ok: false, details: formatAutobranchCommandDetails(result) };
			return { ok: true, value: result.stdout.trim() };
		},
		async headParents() {
			const result = await exec(
				"git",
				["rev-list", "--parents", "-n", "1", "HEAD"],
				GIT_FACT_TIMEOUT_MS,
			);
			if (result.code !== 0) return { ok: false, details: formatAutobranchCommandDetails(result) };
			const [headSha, ...parentShas] = result.stdout.trim().split(/\s+/).filter(Boolean);
			if (!headSha) return { ok: false, details: "git rev-list returned no HEAD commit." };
			return { ok: true, value: { headSha, parentShas } };
		},
		async headCommitMessage() {
			const result = await exec("git", ["log", "-1", "--format=%B"], GIT_FACT_TIMEOUT_MS);
			if (result.code !== 0) return { ok: false, details: formatAutobranchCommandDetails(result) };
			return { ok: true, value: result.stdout };
		},
		async headCommitDiff() {
			const result = await exec(
				"git",
				["diff", "HEAD^", "HEAD", "--no-ext-diff"],
				GIT_FACT_TIMEOUT_MS,
			);
			if (result.code !== 0) return { ok: false, details: formatAutobranchCommandDetails(result) };
			return { ok: true, value: result.stdout };
		},
		async upstreamOf(branch) {
			const result = await exec(
				"git",
				["for-each-ref", "--format=%(upstream:short)", `refs/heads/${branch}`],
				GIT_FACT_TIMEOUT_MS,
			);
			if (result.code !== 0) return { ok: false, details: formatAutobranchCommandDetails(result) };
			return { ok: true, value: firstNonEmptyLine(result.stdout) };
		},
		async isAncestor(ancestor, descendant) {
			const result = await exec(
				"git",
				["merge-base", "--is-ancestor", ancestor, descendant],
				GIT_FACT_TIMEOUT_MS,
			);
			if (result.code === 0) return { ok: true, value: true };
			if (result.code === 1) return { ok: true, value: false };
			return { ok: false, details: formatAutobranchCommandDetails(result) };
		},
		async listStashes() {
			const result = await exec(
				"git",
				["stash", "list", "--format=%gd%x00%s"],
				GIT_FACT_TIMEOUT_MS,
			);
			if (result.code !== 0) return { ok: false, details: formatAutobranchCommandDetails(result) };
			return { ok: true, value: parseStashEntries(result.stdout) };
		},
		async createBranchAt(branch, sha) {
			const result = await exec("git", ["branch", branch, sha], GIT_MUTATION_TIMEOUT_MS);
			if (result.code !== 0) return { ok: false, details: formatAutobranchCommandDetails(result) };
			return { ok: true, value: undefined };
		},
		async resetHardTo(ref) {
			const result = await exec("git", ["reset", "--hard", ref], GIT_MUTATION_TIMEOUT_MS);
			if (result.code !== 0) return { ok: false, details: formatAutobranchCommandDetails(result) };
			return { ok: true, value: undefined };
		},
		async deleteBranch(branch) {
			const result = await exec("git", ["branch", "-D", branch], GIT_MUTATION_TIMEOUT_MS);
			if (result.code !== 0) return { ok: false, details: formatAutobranchCommandDetails(result) };
			return { ok: true, value: undefined };
		},
		async checkout(branch) {
			const result = await exec("git", ["checkout", branch], GIT_MUTATION_TIMEOUT_MS);
			if (result.code !== 0) return { ok: false, details: formatAutobranchCommandDetails(result) };
			return { ok: true, value: undefined };
		},
		async stashPush(message) {
			const result = await exec(
				"git",
				["stash", "push", "--include-untracked", "-m", message],
				STASH_PUSH_TIMEOUT_MS,
			);
			if (result.code !== 0) return { ok: false, details: formatAutobranchCommandDetails(result) };
			return { ok: true, value: undefined };
		},
		async stashPop(ref) {
			const result = await exec("git", ["stash", "pop", ref], STASH_POP_TIMEOUT_MS);
			if (result.code !== 0) return { ok: false, details: formatAutobranchCommandDetails(result) };
			return { ok: true, value: undefined };
		},
	};
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
