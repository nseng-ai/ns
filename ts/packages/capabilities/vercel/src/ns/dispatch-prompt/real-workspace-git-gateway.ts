import { commandSucceeded, type CommandRunner } from "@nseng-ai/foundation/command";

import type { DispatchWorkspaceGitGateway } from "./contracts.ts";
import { dispatchCommandError, firstErrorLine } from "./dispatch-command-error.ts";

const GIT_READ_TIMEOUT_MS = 30_000;
const GIT_PUSH_TIMEOUT_MS = 120_000;
const DISPATCH_REMOTE_NAME = "origin";

export function createRealDispatchWorkspaceGitGateway(
	runner: CommandRunner,
): DispatchWorkspaceGitGateway {
	async function git(args: readonly string[], cwd: string, timeoutMs: number) {
		return await runner("git", args, { cwd, timeout: timeoutMs });
	}
	return {
		async resolveSourceRef({ cwd }) {
			const repoRoot = await git(["rev-parse", "--show-toplevel"], cwd, GIT_READ_TIMEOUT_MS);
			if (!commandSucceeded(repoRoot)) {
				return {
					ok: false,
					error: {
						code: "not-a-repository",
						message: `Not inside a git repository: ${firstErrorLine(repoRoot)}`,
					},
				};
			}
			const branch = await git(["rev-parse", "--abbrev-ref", "HEAD"], cwd, GIT_READ_TIMEOUT_MS);
			if (!commandSucceeded(branch)) {
				return {
					ok: false,
					error: {
						code: "git-read-failed",
						message: `Could not resolve the current branch: ${firstErrorLine(branch)}`,
					},
				};
			}
			const branchName = branch.stdout.trim();
			if (branchName === "HEAD") {
				return {
					ok: false,
					error: {
						code: "detached-head",
						message:
							"HEAD is detached; dispatch sends your current branch's head, so check out a branch first.",
					},
				};
			}
			const head = await git(["rev-parse", "HEAD"], cwd, GIT_READ_TIMEOUT_MS);
			if (!commandSucceeded(head)) {
				return {
					ok: false,
					error: {
						code: "git-read-failed",
						message: `Could not resolve HEAD: ${firstErrorLine(head)}`,
					},
				};
			}
			return {
				ok: true,
				value: {
					repoRoot: repoRoot.stdout.trim(),
					branch: branchName,
					headSha: head.stdout.trim().toLowerCase(),
				},
			};
		},
		async listDirtyPaths({ cwd }) {
			const status = await git(["status", "--porcelain"], cwd, GIT_READ_TIMEOUT_MS);
			if (!commandSucceeded(status)) {
				return {
					ok: false,
					error: dispatchCommandError(
						"git-status-failed",
						"Could not inspect the worktree status",
						status,
					),
				};
			}
			return { ok: true, value: parseGitPorcelainStatusPaths(status.stdout) };
		},
		async readRemoteBranchTip({ cwd, branch }) {
			const result = await git(
				["ls-remote", DISPATCH_REMOTE_NAME, `refs/heads/${branch}`],
				cwd,
				GIT_READ_TIMEOUT_MS,
			);
			if (!commandSucceeded(result)) {
				return {
					type: "error",
					error: dispatchCommandError(
						"git-ls-remote-failed",
						"Could not read the remote branch tip",
						result,
					),
				};
			}
			const sha = parseGitLsRemoteSha(result.stdout);
			if (sha === null) return { type: "missing" };
			return { type: "found", sha };
		},
		async pushSourceBranch({ cwd, branch }) {
			const result = await git(
				["push", DISPATCH_REMOTE_NAME, `${branch}:refs/heads/${branch}`],
				cwd,
				GIT_PUSH_TIMEOUT_MS,
			);
			if (!commandSucceeded(result)) {
				return {
					ok: false,
					error: dispatchCommandError("git-push-failed", `Pushing branch ${branch} failed`, result),
				};
			}
			return { ok: true };
		},
		async pushAnchorBranch({ cwd, revision, anchorBranch }) {
			const result = await git(
				["push", DISPATCH_REMOTE_NAME, `${revision}:refs/heads/${anchorBranch}`],
				cwd,
				GIT_PUSH_TIMEOUT_MS,
			);
			if (!commandSucceeded(result)) {
				return {
					ok: false,
					error: dispatchCommandError(
						"git-push-failed",
						`Pushing anchor branch ${anchorBranch} failed`,
						result,
					),
				};
			}
			return { ok: true };
		},
	};
}

/**
 * Parse `git status --porcelain` output into the dirty path list. Rename
 * lines keep their `old -> new` rendering so the refusal names both
 * sides.
 */
export function parseGitPorcelainStatusPaths(stdout: string): readonly string[] {
	return stdout
		.split("\n")
		.filter((line) => line.length > 3)
		.map((line) => line.slice(3));
}

/** Parse the SHA out of `git ls-remote` output; `null` when absent. */
export function parseGitLsRemoteSha(stdout: string): string | null {
	const match = /^([0-9a-fA-F]{40})\t/.exec(stdout.trim());
	if (match === null || match[1] === undefined) return null;
	return match[1].toLowerCase();
}
