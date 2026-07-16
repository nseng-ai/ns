import { commandSucceeded, type CommandRunner } from "@nseng-ai/foundation/command";

import { isValidDispatchAnchorBranch } from "../../dispatch/dispatch-run.ts";
import type {
	DispatchGatewayError,
	DispatchLocalGitFactsGateway,
	DispatchWorkspaceGitGateway,
} from "../dispatch-client/contracts.ts";
import { dispatchCommandError } from "./dispatch-command-error.ts";

const GIT_READ_TIMEOUT_MS = 30_000;
const GIT_PUSH_TIMEOUT_MS = 120_000;
const DISPATCH_REMOTE_NAME = "origin";
const ANCHOR_COMMIT_MESSAGE = "Initialize cloud dispatch anchor";

export function createRealDispatchWorkspaceGitGateway(
	localGitFacts: DispatchLocalGitFactsGateway,
	runner: CommandRunner,
): DispatchWorkspaceGitGateway {
	async function git(args: readonly string[], cwd: string, timeoutMs: number) {
		return await runner("git", args, { cwd, timeout: timeoutMs });
	}

	async function pushRef(options: {
		readonly cwd: string;
		readonly refspec: string;
		readonly failurePrefix: string;
	}) {
		const result = await git(
			["push", DISPATCH_REMOTE_NAME, options.refspec],
			options.cwd,
			GIT_PUSH_TIMEOUT_MS,
		);
		if (!commandSucceeded(result)) {
			return {
				ok: false,
				error: dispatchCommandError("git-push-failed", options.failurePrefix, result),
			} as const;
		}
		return { ok: true } as const;
	}

	return {
		async resolveSourceRef({ cwd }) {
			const repoRoot = await localGitFacts.repoRoot({ cwd });
			if (!repoRoot.ok) {
				return {
					ok: false,
					error: {
						code: "not-a-repository",
						message: `Not inside a git repository: ${repoRoot.error.message}`,
					},
				};
			}

			const branch = await localGitFacts.currentBranch({ cwd });
			if (branch.type === "detached") {
				return {
					ok: false,
					error: {
						code: "detached-head",
						message:
							"HEAD is detached; dispatch sends your current branch's head, so check out a branch first.",
					},
				};
			}
			if (branch.type === "failure") {
				return {
					ok: false,
					error: sourceGitReadError("Could not resolve the current branch", branch.error),
				};
			}

			const head = await localGitFacts.headCommit({ cwd });
			if (!head.ok) {
				return {
					ok: false,
					error: sourceGitReadError("Could not resolve HEAD", head.error),
				};
			}
			return {
				ok: true,
				value: {
					repoRoot: repoRoot.value,
					branch: branch.branch,
					headSha: head.value.toLowerCase(),
				},
			};
		},
		async listDirtyPaths({ cwd }) {
			const status = await localGitFacts.statusPaths({ cwd });
			if (!status.ok) {
				return {
					ok: false,
					error: gitReadError("Could not inspect the worktree status", status.error),
				};
			}
			return { ok: true, value: status.value.changedPaths };
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
		async isAnchorBranchNameAvailable({ cwd, anchorBranch }) {
			if (!isValidDispatchAnchorBranch(anchorBranch)) {
				return {
					type: "error",
					error: {
						code: "invalid-anchor-branch",
						message: `Cannot inspect invalid dispatch anchor branch ${JSON.stringify(anchorBranch)}.`,
					},
				};
			}
			const result = await git(
				["ls-remote", DISPATCH_REMOTE_NAME, `refs/heads/${anchorBranch}`],
				cwd,
				GIT_READ_TIMEOUT_MS,
			);
			if (!commandSucceeded(result)) {
				return {
					type: "error",
					error: dispatchCommandError(
						"git-ls-remote-failed",
						`Could not inspect availability of anchor branch ${anchorBranch}`,
						result,
					),
				};
			}
			if (result.stdout.trim().length === 0) return { type: "available" };
			if (parseGitLsRemoteSha(result.stdout) !== null) return { type: "occupied" };
			return {
				type: "error",
				error: {
					code: "git-ls-remote-invalid-output",
					message: `Inspecting availability of anchor branch ${anchorBranch} returned an invalid response.`,
				},
			};
		},
		async pushSourceBranch({ cwd, branch }) {
			return await pushRef({
				cwd,
				refspec: `${branch}:refs/heads/${branch}`,
				failurePrefix: `Pushing branch ${branch} failed`,
			});
		},
		async pushAnchorBranch({ cwd, revision, anchorBranch }) {
			const anchorCommit = await git(
				["commit-tree", `${revision}^{tree}`, "-p", revision, "-m", ANCHOR_COMMIT_MESSAGE],
				cwd,
				GIT_READ_TIMEOUT_MS,
			);
			if (!commandSucceeded(anchorCommit)) {
				return {
					ok: false,
					error: dispatchCommandError(
						"git-anchor-initialization-failed",
						`Creating the metadata-only commit for anchor branch ${anchorBranch} failed`,
						anchorCommit,
					),
				};
			}
			const anchorRevision = parseGitObjectSha(anchorCommit.stdout);
			if (anchorRevision === null) {
				return {
					ok: false,
					error: {
						code: "git-anchor-initialization-failed",
						message: `Creating the metadata-only commit for anchor branch ${anchorBranch} returned no commit SHA.`,
					},
				};
			}
			return await pushRef({
				cwd,
				refspec: `${anchorRevision}:refs/heads/${anchorBranch}`,
				failurePrefix: `Pushing anchor branch ${anchorBranch} failed`,
			});
		},
	};
}

function sourceGitReadError(
	title: string,
	error: { readonly message: string },
): { readonly code: "git-read-failed"; readonly message: string } {
	return {
		code: "git-read-failed",
		message: `${title}: ${error.message}`,
	};
}

function gitReadError(
	title: string,
	error: { readonly code: string; readonly message: string },
): DispatchGatewayError {
	return {
		code: error.code,
		message: `${title}: ${error.message}`,
	};
}

/** Parse the SHA out of `git ls-remote` output; `null` when absent. */
export function parseGitLsRemoteSha(stdout: string): string | null {
	const match = /^([0-9a-fA-F]{40})\t/.exec(stdout.trim());
	if (match === null || match[1] === undefined) return null;
	return match[1].toLowerCase();
}

function parseGitObjectSha(stdout: string): string | null {
	const value = stdout.trim();
	return /^[0-9a-fA-F]{40}$/u.test(value) ? value.toLowerCase() : null;
}
