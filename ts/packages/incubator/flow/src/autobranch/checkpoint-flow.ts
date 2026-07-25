import { optionalEntry } from "@nseng-ai/foundation/primitives";
import type { ModelSelection } from "@nseng-ai/foundation/model-slug";

import {
	runDirtyAutobranchFlow,
	type AutobranchFlowInput,
	type FileStat,
	type ParsedAutobranchArgs,
} from "./dirty-worktree.ts";
import type { AutobranchFlowResult } from "./flow-result.ts";
import { createAutobranchGitGateway, type AutobranchGitGateway } from "./git-gateway.ts";
import { createLatestCommitAutobranchFlow } from "./latest-commit.ts";
import type { CommandResult } from "@nseng-ai/extension-kit/checkpoint-flow";
import {
	loadPendingWorktreeSnapshot,
	type PendingWorktreeError,
	type PendingWorktreeSnapshot,
} from "@nseng-ai/extension-kit/pending-worktree";

import { formatPendingWorktreeError } from "./pending-worktree-format.ts";

export type FlowAutobranchRequest = ParsedAutobranchArgs;
export type FlowAutobranchCheckpointResult = AutobranchFlowResult;
export type FlowAutobranchFileStat = FileStat;

export interface FlowAutobranchCheckpointInput {
	cwd: string;
	modelSelection: ModelSelection;
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

export interface AnyStateAutobranchDispatchMode {
	mode: "any-state";
	dirty: AutobranchDirtyDependencies;
}

export interface RequireDirtyAutobranchDispatchMode {
	mode: "require-dirty";
	dirty: AutobranchDirtyDependencies;
}

export interface RequireCleanAutobranchDispatchMode {
	mode: "require-clean";
}

export type AutobranchDispatchMode =
	| AnyStateAutobranchDispatchMode
	| RequireDirtyAutobranchDispatchMode
	| RequireCleanAutobranchDispatchMode;

export interface AutobranchFlowContext {
	cwd: string;
	modelSelection: ModelSelection;
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

type AutobranchDispatchCommonOutcome =
	| { outcome: "pending-worktree"; error: PendingWorktreeError }
	| {
			outcome: "flow";
			snapshot: PendingWorktreeSnapshot;
			flow: AutobranchFlowResult;
	  };

export type AnyStateAutobranchDispatchOutcome = AutobranchDispatchCommonOutcome;
export type RequireDirtyAutobranchDispatchOutcome =
	| AutobranchDispatchCommonOutcome
	| { outcome: "refused-clean"; snapshot: PendingWorktreeSnapshot };
export type RequireCleanAutobranchDispatchOutcome =
	| AutobranchDispatchCommonOutcome
	| { outcome: "refused-dirty"; snapshot: PendingWorktreeSnapshot };
export type AutobranchDispatchOutcome =
	| AnyStateAutobranchDispatchOutcome
	| RequireDirtyAutobranchDispatchOutcome
	| RequireCleanAutobranchDispatchOutcome;

export function dispatchAutobranchCheckpoint(
	mode: AnyStateAutobranchDispatchMode,
	env: AutobranchDispatchEnv,
): Promise<AnyStateAutobranchDispatchOutcome>;
export function dispatchAutobranchCheckpoint(
	mode: RequireDirtyAutobranchDispatchMode,
	env: AutobranchDispatchEnv,
): Promise<RequireDirtyAutobranchDispatchOutcome>;
export function dispatchAutobranchCheckpoint(
	mode: RequireCleanAutobranchDispatchMode,
	env: AutobranchDispatchEnv,
): Promise<RequireCleanAutobranchDispatchOutcome>;
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
	if (snapshot.clean) {
		if (mode.mode === "require-dirty") return { outcome: "refused-clean", snapshot };
		const context = env.createFlowContext(snapshot);
		const flow = await createLatestCommitAutobranchFlow({
			...context,
			snapshot,
			...optionalEntry("onPhase", env.onPhase),
			...optionalEntry("now", env.now),
		});
		return { outcome: "flow", snapshot, flow };
	}

	if (mode.mode === "require-clean") return { outcome: "refused-dirty", snapshot };
	const context = env.createFlowContext(snapshot);
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
				modelSelection: input.modelSelection,
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
	}
}
