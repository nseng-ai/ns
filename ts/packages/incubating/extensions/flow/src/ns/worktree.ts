import {
	loadPendingWorktreeSnapshot,
	type PendingWorktreeError,
	type PendingWorktreeSnapshot,
	type WorktreeCommandResult,
} from "@nseng-ai/extension-kit/pending-worktree";
import { createNsGitGateway } from "@nseng-ai/extension-kit";
import {
	nodeRepositoryTrunkConfigLoader,
	resolveRepositoryTrunk,
} from "@nseng-ai/extension-kit/repository-trunk";
import { createNsCliExecAdapter, execNsCommand, execNsGit } from "./exec.ts";
import {
	commandSucceeded,
	formatCommandDetails,
	type ExecResult,
} from "@nseng-ai/foundation/command";
import { withTemporaryFile } from "@nseng-ai/extension-kit/temp-files";
import type { NsExtensionApi } from "@nseng-ai/sdk";
import {
	createAutobranchGitGateway,
	type AutobranchGitGateway,
} from "../autobranch/git-gateway.ts";
import type { AutobranchExec } from "../autobranch/shared.ts";
import type {
	AutobranchDispatchEnv,
	AutobranchFlowContext,
} from "../autobranch/checkpoint-flow.ts";
import type { ParsedAutobranchArgs } from "../autobranch/dirty-worktree.ts";
import type { ModelSelection } from "@nseng-ai/foundation/model-slug";
import type { GitGateway } from "@nseng-ai/foundation/git";
import type { RepositoryTrunkResult } from "@nseng-ai/extension-kit/repository-trunk";
import { optionalEntry } from "@nseng-ai/foundation/primitives";

export type { PendingWorktreeError, PendingWorktreeSnapshot, WorktreeCommandResult };

function formatCommandError(summary: string, result: ExecResult): string {
	return `${summary}\n${formatCommandDetails(result)}`;
}

export async function loadFlowPendingWorktreeSnapshot(
	ctx: NsExtensionApi,
): Promise<
	{ ok: true; snapshot: PendingWorktreeSnapshot } | { ok: false; error: PendingWorktreeError }
> {
	return await loadPendingWorktreeSnapshot({
		cwd: ctx.cwd,
		git: createNsGitGateway(ctx),
		execGit: (args, timeout) => execGit(ctx, args, timeout),
	});
}

export function execGit(
	ctx: NsExtensionApi,
	args: readonly string[],
	timeoutMs: number,
): Promise<ExecResult> {
	return execNsGit(ctx, args, timeoutMs);
}

export const createCliExecAdapter = createNsCliExecAdapter;
export const execExtensionCommand = execNsCommand;

interface CreateAutobranchExecContextOptions {
	ctx: NsExtensionApi;
	cwd: string;
	providerGit?: Pick<
		GitGateway,
		| "optionalRepoRoot"
		| "currentBranch"
		| "headCommit"
		| "validateBranchRef"
		| "localBranchPresence"
	>;
	repositoryTrunk: RepositoryTrunkResult;
}

export function createAutobranchExecContext(options: CreateAutobranchExecContextOptions): {
	exec: AutobranchExec;
	git: AutobranchGitGateway;
} {
	const { ctx, cwd, providerGit, repositoryTrunk } = options;
	const exec: AutobranchExec = (command, commandArgs, timeout) =>
		execExtensionCommand({ ctx, command, args: commandArgs, cwd, timeoutMs: timeout });
	return {
		exec,
		git: createAutobranchGitGateway({
			cwd,
			exec,
			repositoryTrunk,
			...optionalEntry("providerGit", providerGit),
		}),
	};
}

export async function createAutobranchDispatchEnv(
	ctx: NsExtensionApi,
	args: ParsedAutobranchArgs,
	modelSelection: ModelSelection,
): Promise<Pick<AutobranchDispatchEnv, "loadSnapshot" | "createFlowContext">> {
	const git = createNsGitGateway(ctx);
	const repoRoot = await git.repoRoot({ cwd: ctx.cwd, env: ctx.env });
	if (!repoRoot.ok) throw new Error(repoRoot.error.message);
	const repositoryTrunk = await resolveRepositoryTrunk({
		repoRoot: repoRoot.value,
		git,
		config: nodeRepositoryTrunkConfigLoader,
		env: ctx.env,
	});
	return {
		loadSnapshot: () => loadFlowPendingWorktreeSnapshot(ctx),
		createFlowContext: (snapshot): AutobranchFlowContext => {
			const { exec, git: autobranchGit } = createAutobranchExecContext({
				ctx,
				cwd: snapshot.root,
				providerGit: git,
				repositoryTrunk,
			});
			return {
				cwd: snapshot.root,
				args,
				modelSelection,
				exec,
				git: autobranchGit,
			};
		},
	};
}

export async function createCommitWithPreparedMessage(
	ctx: NsExtensionApi,
	message: string,
): Promise<{ summary: string } | { error: string }> {
	return await withTemporaryFile(
		{ prefix: "ns-extension-cp-commit-", filename: "message.txt", contents: `${message}\n` },
		async (messagePath) => {
			const add = await execNsGit(ctx, ["add", "-A"], 30_000);
			if (!commandSucceeded(add)) {
				return { error: formatCommandError("Failed to stage checkpoint changes.", add) };
			}

			const commit = await execNsGit(ctx, ["commit", "-F", messagePath], 120_000);
			if (!commandSucceeded(commit)) {
				return { error: formatCommandError("Checkpoint commit failed.", commit) };
			}

			const log = await execNsGit(ctx, ["log", "-1", "--oneline"], 5_000);
			if (!commandSucceeded(log)) {
				return {
					error: formatCommandError("Created checkpoint commit, but failed to read it back.", log),
				};
			}

			return { summary: log.stdout.trim() };
		},
	);
}
