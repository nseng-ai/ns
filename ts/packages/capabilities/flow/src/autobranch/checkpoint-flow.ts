import { optionalEntry } from "@nseng-ai/foundation/primitives";

import {
	runDirtyAutobranchFlow,
	type AutobranchFlowInput,
	type FileStat,
	type ParsedAutobranchArgs,
} from "./dirty-worktree.ts";
import type { AutobranchFlowResult } from "./flow-result.ts";
import { createAutobranchGitGateway, type AutobranchGitGateway } from "./git-gateway.ts";
import { createLatestCommitAutobranchFlow } from "./latest-commit.ts";
import type { CommandResult } from "@nseng-ai/capability-kit/checkpoint-flow";
import {
	loadPendingWorktreeSnapshot,
	type PendingWorktreeError,
	type PendingWorktreeSnapshot,
} from "@nseng-ai/capability-kit/pending-worktree";

import { formatPendingWorktreeError } from "./pending-worktree-format.ts";

export type FlowAutobranchRequest = ParsedAutobranchArgs;
export type FlowAutobranchCheckpointResult = AutobranchFlowResult;
export type FlowAutobranchFileStat = FileStat;

export interface FlowAutobranchCheckpointInput {
	cwd: string;
	args: FlowAutobranchRequest;
	exec: (command: string, args: string[], timeout: number) => Promise<CommandResult>;
	prepareCheckpointMessage: (
		snapshot: Pick<PendingWorktreeSnapshot, "status" | "diff">,
	) => Promise<{ ok: true; message: string } | { ok: false; error: string }>;
	commitPreparedCheckpointMessage: (
		message: string,
	) => Promise<{ summary: string } | { error: string }>;
	onPhase?: (message: string) => void;
	readFile?: (path: string) => Promise<Uint8Array | string>;
	stat?: (path: string) => Promise<FlowAutobranchFileStat>;
	now?: () => number;
}

export type AutobranchDirtyDependencies = Pick<
	AutobranchFlowInput,
	"prepareCheckpointMessage" | "commitPreparedCheckpointMessage" | "readFile" | "stat"
>;

export type AutobranchDispatchMode =
	| { mode: "any-state"; dirty: AutobranchDirtyDependencies }
	| { mode: "require-dirty"; dirty: AutobranchDirtyDependencies }
	| { mode: "require-clean" };

export interface AutobranchFlowContext {
	cwd: string;
	args: ParsedAutobranchArgs;
	exec: AutobranchFlowInput["exec"];
	git: AutobranchGitGateway;
}

export interface AutobranchDispatchEnv {
	loadSnapshot: () => Promise<
		{ ok: true; snapshot: PendingWorktreeSnapshot } | { ok: false; error: PendingWorktreeError }
	>;
	createFlowContext: (snapshot: PendingWorktreeSnapshot) => AutobranchFlowContext;
	onPhase?: (message: string) => void;
	now?: () => number;
}

export type AutobranchDispatchOutcome =
	| { outcome: "pending-worktree"; error: PendingWorktreeError }
	| { outcome: "refused-clean"; snapshot: PendingWorktreeSnapshot }
	| { outcome: "refused-dirty"; snapshot: PendingWorktreeSnapshot }
	| {
			outcome: "flow";
			snapshot: PendingWorktreeSnapshot;
			flow: AutobranchFlowResult;
	  };

export async function dispatchAutobranchCheckpoint(
	mode: AutobranchDispatchMode,
	env: AutobranchDispatchEnv,
): Promise<AutobranchDispatchOutcome> {
	env.onPhase?.("Inspecting worktree…");
	const loaded = await env.loadSnapshot();
	if (!loaded.ok) {
		return { outcome: "pending-worktree", error: loaded.error };
	}

	const snapshot = loaded.snapshot;
	if (mode.mode === "require-dirty" && snapshot.clean) {
		return { outcome: "refused-clean", snapshot };
	}
	if (mode.mode === "require-clean" && !snapshot.clean) {
		return { outcome: "refused-dirty", snapshot };
	}

	const context = env.createFlowContext(snapshot);
	if (snapshot.clean) {
		const flow = await createLatestCommitAutobranchFlow({
			...context,
			snapshot,
			...optionalEntry("onPhase", env.onPhase),
			...optionalEntry("now", env.now),
		});
		return { outcome: "flow", snapshot, flow };
	}

	if (mode.mode === "require-clean") {
		return unexpectedAutobranchDispatchOutcome({ outcome: "refused-dirty", snapshot });
	}
	const flow = await runDirtyAutobranchFlow({
		...context,
		snapshot,
		...mode.dirty,
		...optionalEntry("onPhase", env.onPhase),
		...optionalEntry("now", env.now),
	});
	return { outcome: "flow", snapshot, flow };
}

export async function createFlowAutobranchCheckpointFlow(
	input: FlowAutobranchCheckpointInput,
): Promise<FlowAutobranchCheckpointResult> {
	const git = createAutobranchGitGateway({ cwd: input.cwd, exec: input.exec });
	const result = await dispatchAutobranchCheckpoint(
		{
			mode: "any-state",
			dirty: {
				prepareCheckpointMessage: input.prepareCheckpointMessage,
				commitPreparedCheckpointMessage: input.commitPreparedCheckpointMessage,
				...optionalEntry("readFile", input.readFile),
				...optionalEntry("stat", input.stat),
			},
		},
		{
			loadSnapshot: () =>
				loadPendingWorktreeSnapshot({
					cwd: input.cwd,
					git,
					execGit: (args, timeout) => input.exec("git", args, timeout),
				}),
			createFlowContext: () => ({
				cwd: input.cwd,
				args: input.args,
				exec: input.exec,
				git,
			}),
			...optionalEntry("onPhase", input.onPhase),
			...optionalEntry("now", input.now),
		},
	);

	switch (result.outcome) {
		case "pending-worktree":
			return {
				ok: false,
				outcome: "failure",
				error: formatPendingWorktreeError(result.error),
			};
		case "flow":
			return result.flow;
		case "refused-clean":
		case "refused-dirty":
			return unexpectedAutobranchDispatchOutcome(result);
	}
}

export function unexpectedAutobranchDispatchOutcome(value: AutobranchDispatchOutcome): never {
	throw new Error(`Unexpected autobranch dispatch outcome: ${JSON.stringify(value)}`);
}
