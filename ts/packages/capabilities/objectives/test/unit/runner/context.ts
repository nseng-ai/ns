import type {
	GitCurrentBranchResult,
	GitCwdParams,
	GitResult,
	GitStatusPathFacts,
} from "@nseng-ai/capability-kit/git";
import {
	InMemoryGitGateway,
	type InMemoryGitGatewayState,
} from "@nseng-ai/capability-kit/git/testing";
import {
	InMemoryGraphiteBranchGateway,
	type InMemoryGraphiteGatewayState,
} from "@nseng-ai/capability-kit/graphite/testing";
import type { ExecResult } from "@nseng-ai/foundation/exec";

import { nextFromSequence } from "../../support/sequence.ts";
import {
	FakeObjectiveStorageGateway,
	type FakeObjectiveStorageGatewayOptions,
} from "../../../src/core/fake-storage.ts";
import { ObjectiveStorage } from "../../../src/core/storage.ts";
import type {
	ObjectiveRunnerCoreContext,
	RunnerFilePresenceResult,
	RunnerTextFileReadResult,
} from "../../../src/runner/context.ts";

interface FailureState {
	type: "failure";
	error?: { code: string; message: string };
}
type ValueState<T> = T | FailureState;

export interface SequencedGitGatewayState extends InMemoryGitGatewayState {
	/** Per-call current-branch values; the last value repeats once exhausted. */
	currentBranchSequence?: readonly string[];
	/** Per-call HEAD values; the last value repeats once exhausted. */
	headCommitSequence?: readonly string[];
	/** Per-call status-path values; the last value repeats once exhausted. */
	statusPathsSequence?: readonly ValueState<GitStatusPathFacts>[];
}

/**
 * InMemoryGitGateway plus call-by-call sequences for runner facts observed
 * multiple times during a step: current branch, HEAD commit, and status paths.
 */
export class SequencedGitGateway extends InMemoryGitGateway {
	private readonly currentBranchSequence: readonly string[];
	private currentBranchIndex = 0;
	private readonly headCommitSequence: readonly string[];
	private headCommitIndex = 0;
	private readonly statusPathsSequence: readonly ValueState<GitStatusPathFacts>[];
	private statusPathsIndex = 0;

	constructor(state: SequencedGitGatewayState = {}) {
		super(state);
		this.currentBranchSequence = [...(state.currentBranchSequence ?? [])];
		this.headCommitSequence = [...(state.headCommitSequence ?? [])];
		this.statusPathsSequence = (state.statusPathsSequence ?? []).map(cloneStatusPathsState);
	}

	override async currentBranch(params: GitCwdParams): Promise<GitCurrentBranchResult> {
		const next = nextFromSequence(this.currentBranchSequence, this.currentBranchIndex);
		this.currentBranchIndex = next.nextIndex;
		if (next.value === undefined) return await super.currentBranch(params);
		return { type: "branch", branch: next.value };
	}

	override async headCommit(params: GitCwdParams): Promise<GitResult<string>> {
		const next = nextFromSequence(this.headCommitSequence, this.headCommitIndex);
		this.headCommitIndex = next.nextIndex;
		if (next.value === undefined) return await super.headCommit(params);
		return { ok: true, value: next.value };
	}

	override async statusPaths(params: GitCwdParams): Promise<GitResult<GitStatusPathFacts>> {
		const next = nextFromSequence(this.statusPathsSequence, this.statusPathsIndex);
		this.statusPathsIndex = next.nextIndex;
		const state = next.value;
		if (state === undefined) return await super.statusPaths(params);
		await super.statusPaths(params);
		if (isFailureState(state)) {
			return {
				ok: false,
				error: state.error ?? {
					code: "git_status_paths_failed",
					message: "Could not read git status paths.",
				},
			};
		}
		return { ok: true, value: { changedPaths: [...state.changedPaths] } };
	}
}

function cloneStatusPathsState(
	state: ValueState<GitStatusPathFacts>,
): ValueState<GitStatusPathFacts> {
	if (isFailureState(state)) {
		return { type: "failure", ...(state.error === undefined ? {} : { error: { ...state.error } }) };
	}
	return { changedPaths: [...state.changedPaths] };
}

function isFailureState(value: unknown): value is FailureState {
	return typeof value === "object" && value !== null && "type" in value && value.type === "failure";
}

export interface RecordedExecCall {
	command: string;
	args: string[];
}

export interface RunnerFakesOptions {
	storage?: FakeObjectiveStorageGatewayOptions;
	git?: SequencedGitGatewayState;
	graphite?: InMemoryGraphiteGatewayState;
	/** Overrides for every `ctx.commands.exec` result (defaults to exit 0). */
	execResult?: Partial<ExecResult>;
	/** Per-call `ctx.commands.exec` overrides; the last value repeats once exhausted. */
	execResults?: readonly Partial<ExecResult>[];
	trunkBranch?: string;
	textFiles?: Readonly<Record<string, string>>;
	filePresence?: (path: string) => Promise<RunnerFilePresenceResult>;
}

export interface RunnerFakesContext extends ObjectiveRunnerCoreContext {
	git: SequencedGitGateway;
	graphite: InMemoryGraphiteBranchGateway;
	stdoutChunks: string[];
	phases: string[];
	execCalls: RecordedExecCall[];
}

export function contextWithRunnerFakes(options: RunnerFakesOptions = {}): RunnerFakesContext {
	const stdoutChunks: string[] = [];
	const phases: string[] = [];
	const execCalls: RecordedExecCall[] = [];
	const gitState = options.git ?? {};
	const execResult = options.execResult ?? {};
	const execResults = [...(options.execResults ?? [])];
	let execResultIndex = 0;
	const textFiles = options.textFiles ?? {};
	return {
		cwd: "/repo",
		env: { PATH: "/fake/bin" },
		repoRoot: "/repo",
		trunkBranch:
			options.trunkBranch ??
			(typeof gitState.trunkBranch === "string" ? gitState.trunkBranch : "main"),
		storage: new ObjectiveStorage(new FakeObjectiveStorageGateway(options.storage ?? {})),
		outputFormat: "human",
		git: new SequencedGitGateway(gitState),
		graphite: new InMemoryGraphiteBranchGateway(options.graphite ?? {}),
		commands: {
			async exec(command, args) {
				execCalls.push({ command, args: [...args] });
				const sequenced = nextFromSequence(execResults, execResultIndex);
				execResultIndex = sequenced.nextIndex;
				return {
					stdout: "",
					stderr: "",
					code: 0,
					killed: false,
					...execResult,
					...sequenced.value,
				};
			},
		},
		writeStdout(text) {
			stdoutChunks.push(text);
		},
		phase(label) {
			phases.push(label);
		},
		async readTextFile(path): Promise<RunnerTextFileReadResult> {
			const content = textFiles[path];
			if (content === undefined) return { type: "error", message: `Unreadable file: ${path}` };
			return { type: "ok", content };
		},
		async filePresence(path): Promise<RunnerFilePresenceResult> {
			if (options.filePresence !== undefined) return await options.filePresence(path);
			return Object.hasOwn(textFiles, path) ? { type: "present" } : { type: "missing" };
		},
		stdoutChunks,
		phases,
		execCalls,
	};
}
