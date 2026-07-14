import { commandSucceeded, type CommandExecApi } from "@nseng-ai/foundation/exec";
import {
	detectGitOperationInProgressAt,
	resolveWorktreeGitDirs,
	type GitGateway,
	type GitWorktreeStateFs,
} from "@nseng-ai/foundation/git";
import { formatErrorMessage } from "@nseng-ai/foundation/primitives";
import { formatCommandOutput } from "@nseng-ai/pi/commands/helpers";

const GIT_STATUS_TIMEOUT_MS = 60_000;
const COMMAND_OUTPUT_TAIL_OPTIONS = { maxChars: 4_000, maxLines: 20 } as const;

export type SmartRestackPreflightResult =
	| { type: "ready" }
	| { type: "rebase-in-progress" }
	| { type: "refused"; message: string };

export type RunSmartRestackPreflight = (options: {
	cwd: string;
}) => Promise<SmartRestackPreflightResult>;

export type RestackPreflightGitGateway = Pick<GitGateway, "repoRoot">;

export interface CreateProvisionalRestackPreflightOptions {
	commands: CommandExecApi;
	git: RestackPreflightGitGateway;
	fs?: GitWorktreeStateFs;
}

/**
 * Provisional consumer adapter for the `slot-gt-restack-preflight` Objective.
 * Replace it with `ns slot gt exec restack-preflight --format json` when that command lands.
 */
export function createProvisionalRestackPreflight(
	options: CreateProvisionalRestackPreflightOptions,
): RunSmartRestackPreflight {
	return async ({ cwd }) => {
		const status = await options.commands.exec("git", ["status"], {
			cwd,
			timeout: GIT_STATUS_TIMEOUT_MS,
		});
		if (!commandSucceeded(status)) {
			return {
				type: "refused",
				message: `Cannot inspect repository state with git status; not starting gt restack.\n\n${formatCommandOutput(status, COMMAND_OUTPUT_TAIL_OPTIONS)}`,
			};
		}

		const repoRoot = await options.git.repoRoot({ cwd });
		if (!repoRoot.ok) {
			return {
				type: "refused",
				message: `Cannot resolve the repository root; not starting gt restack.\n\n${repoRoot.error.message}`,
			};
		}

		const worktreeStateOptions = options.fs === undefined ? {} : { fs: options.fs };
		const resolution = resolveWorktreeGitDirs(repoRoot.value, worktreeStateOptions);
		switch (resolution.type) {
			case "no-dot-git":
				return {
					type: "refused",
					message: `Cannot resolve the Git directory at ${repoRoot.value}: .git is missing; not starting gt restack.`,
				};
			case "not-gitdir-file":
				return {
					type: "refused",
					message: `Cannot resolve the Git directory at ${repoRoot.value}: .git is neither a directory nor a valid gitdir file; not starting gt restack.`,
				};
			case "unreadable":
				return {
					type: "refused",
					message: `Cannot read Git directory metadata at ${resolution.path}; not starting gt restack.\n\n${formatErrorMessage(resolution.error)}`,
				};
			case "resolved":
				break;
		}

		// Foundation currently treats some operation-marker stat failures as marker absence.
		// The successful git-status and Git-dir probes bound this provisional adapter's claim.
		const operation = detectGitOperationInProgressAt(repoRoot.value, worktreeStateOptions);
		return operation?.operation === "rebase" ? { type: "rebase-in-progress" } : { type: "ready" };
	};
}
