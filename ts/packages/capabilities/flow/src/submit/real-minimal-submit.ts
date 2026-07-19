import {
	RealGraphiteStackGateway,
	type GraphiteStackGateway,
} from "@nseng-ai/capability-kit/graphite/stack";
import {
	commandFailureReason,
	commandSucceeded,
	execApiToCommandRunner,
	formatCommand,
	type CommandExecApi,
} from "@nseng-ai/foundation/exec";
import { RealGitGateway, type GitGateway } from "@nseng-ai/foundation/git";

import { createFlowGraphiteStackGitGateway } from "../stack-squash/graphite-stack-gateway.ts";
import {
	createFlowMinimalSubmitClientFromGateways,
	FLOW_MINIMAL_SUBMIT_MAX_DIRTY_PATHS,
	type FlowMinimalSubmitClient,
	type FlowMinimalSubmitError,
	type FlowMinimalSubmitErrorCode,
	type FlowMinimalSubmitGatewayResult,
	type MinimalSubmitRepositoryGateway,
	type MinimalSubmitRepositoryInspection,
	type MinimalSubmitRepositoryObservation,
} from "./minimal-submit.ts";
import { RealSubmitGateway } from "./submit-gateway.ts";
import type { SubmitTransportGateway } from "./submit-transport.ts";

const READ_TIMEOUT_MS = 30_000;
const OBSERVATION_FORMAT = "%(refname:short)%00%(objectname)%00%(upstream)";

export interface CreateFlowMinimalSubmitClientOptions {
	readonly cwd: string;
	readonly commands: CommandExecApi;
	readonly env?: NodeJS.ProcessEnv;
}

interface CreateFlowMinimalSubmitClientOverrides {
	readonly graphite?: Pick<GraphiteStackGateway, "stackForBranch">;
	readonly submit?: SubmitTransportGateway;
}

/** Bind minimal-submit Git, Graphite, and GitHub commands to the caller's execution channel. */
export function createFlowMinimalSubmitClient(
	options: CreateFlowMinimalSubmitClientOptions,
): FlowMinimalSubmitClient {
	return createFlowMinimalSubmitClientForRuntime(options);
}

/** Package-private runtime seam used by fake-driven command scenarios. */
export function createFlowMinimalSubmitClientForRuntime(
	options: CreateFlowMinimalSubmitClientOptions,
	overrides: CreateFlowMinimalSubmitClientOverrides = {},
): FlowMinimalSubmitClient {
	const git = new RealGitGateway(options.commands);
	const graphite =
		overrides.graphite ??
		new RealGraphiteStackGateway({
			env: options.env,
			execApi: options.commands,
			git: createFlowGraphiteStackGitGateway(git),
		});
	return createFlowMinimalSubmitClientFromGateways({
		cwd: options.cwd,
		repository: createMinimalSubmitRepositoryGateway(options, git),
		graphite,
		submit: overrides.submit ?? new RealSubmitGateway(execApiToCommandRunner(options.commands)),
	});
}

/** Package-private construction seam for fake-driven adapter tests. */
export function createMinimalSubmitRepositoryGateway(
	options: CreateFlowMinimalSubmitClientOptions,
	git: Pick<GitGateway, "currentBranch" | "headCommit" | "statusPaths">,
): MinimalSubmitRepositoryGateway {
	return new RealMinimalSubmitRepositoryGateway(options, git);
}

class RealMinimalSubmitRepositoryGateway implements MinimalSubmitRepositoryGateway {
	private readonly cwd: string;
	private readonly commands: CommandExecApi;
	private readonly git: Pick<GitGateway, "currentBranch" | "headCommit" | "statusPaths">;

	constructor(
		options: CreateFlowMinimalSubmitClientOptions,
		git: Pick<GitGateway, "currentBranch" | "headCommit" | "statusPaths">,
	) {
		this.cwd = options.cwd;
		this.commands = options.commands;
		this.git = git;
	}

	async inspectCurrent(): Promise<
		FlowMinimalSubmitGatewayResult<MinimalSubmitRepositoryInspection>
	> {
		return await inspectRepository(this.git, this.cwd);
	}

	async observeAffectedBranches(
		branches: readonly string[],
	): Promise<FlowMinimalSubmitGatewayResult<MinimalSubmitRepositoryObservation>> {
		const inspected = await this.inspectCurrent();
		if (!inspected.ok) return inspected;
		const args = [
			"for-each-ref",
			`--format=${OBSERVATION_FORMAT}`,
			...branches.map((branch) => `refs/heads/${branch}`),
		];
		const result = await this.commands.exec("git", args, {
			cwd: this.cwd,
			timeout: READ_TIMEOUT_MS,
		});
		if (!commandSucceeded(result)) {
			return failure(
				"flow-minimal-submit-observation-failed",
				`Could not observe affected branch refs. ${commandFailureReason(result)}`,
				formatCommand("git", args),
			);
		}
		const parsed = parseLocalBranchObservations(result.stdout, branches);
		if (!parsed.ok) return parsed;
		const remoteTips: Record<string, string | null> = {};
		const upstreamBranches: Record<string, string[]> = {};
		for (const branch of branches) {
			const upstream = parsed.value.upstreamRefs[branch];
			if (upstream === undefined || upstream === "") {
				remoteTips[branch] = null;
				continue;
			}
			(upstreamBranches[upstream] ??= []).push(branch);
		}
		const upstreamRefs = Object.keys(upstreamBranches).sort();
		if (upstreamRefs.length > 0) {
			const upstreamArgs = ["show-ref", "--verify", ...upstreamRefs];
			const upstreamResult = await this.commands.exec("git", upstreamArgs, {
				cwd: this.cwd,
				timeout: READ_TIMEOUT_MS,
			});
			if (!commandSucceeded(upstreamResult)) {
				return failure(
					"flow-minimal-submit-remote-observation-failed",
					`Could not observe affected upstream tips. ${commandFailureReason(upstreamResult)}`,
					formatCommand("git", upstreamArgs),
				);
			}
			const remoteResult = parseRemoteBranchObservations(
				upstreamResult.stdout,
				upstreamRefs,
				upstreamBranches,
			);
			if (!remoteResult.ok) return remoteResult;
			Object.assign(remoteTips, remoteResult.value);
		}
		return {
			ok: true as const,
			value: {
				...inspected.value,
				localTips: parsed.value.localTips,
				remoteTips,
			} satisfies MinimalSubmitRepositoryObservation,
		};
	}
}

async function inspectRepository(
	git: Pick<GitGateway, "currentBranch" | "headCommit" | "statusPaths">,
	cwd: string,
): Promise<FlowMinimalSubmitGatewayResult<MinimalSubmitRepositoryInspection>> {
	const branch = await git.currentBranch({ cwd });
	if (branch.type !== "branch") {
		return failure(
			"flow-minimal-submit-branch-read-failed",
			branch.type === "detached"
				? "Minimal submit requires a checked-out branch."
				: branch.error.message,
		);
	}
	const head = await git.headCommit({ cwd });
	if (!head.ok) {
		return failure("flow-minimal-submit-head-read-failed", head.error.message);
	}
	const status = await git.statusPaths({ cwd });
	if (!status.ok) {
		return failure("flow-minimal-submit-status-read-failed", status.error.message);
	}
	return {
		ok: true as const,
		value: {
			source: { branch: branch.branch, headSha: head.value },
			dirtyPaths: status.value.changedPaths.slice(0, FLOW_MINIMAL_SUBMIT_MAX_DIRTY_PATHS),
			isDirtyPathsTruncated: status.value.changedPaths.length > FLOW_MINIMAL_SUBMIT_MAX_DIRTY_PATHS,
		} satisfies MinimalSubmitRepositoryInspection,
	};
}

function parseLocalBranchObservations(
	stdout: string,
	expectedBranches: readonly string[],
):
	| {
			readonly ok: true;
			readonly value: {
				readonly localTips: Readonly<Record<string, string>>;
				readonly upstreamRefs: Readonly<Record<string, string>>;
			};
	  }
	| { readonly ok: false; readonly error: FlowMinimalSubmitError } {
	const expected = new Set(expectedBranches);
	const localTips: Record<string, string> = {};
	const upstreamRefs: Record<string, string> = {};
	for (const line of stdout.split(/\r?\n/u)) {
		if (line === "") continue;
		const fields = line.split("\0");
		if (fields.length !== 3) {
			return failure(
				"flow-minimal-submit-observation-parse-failed",
				"Git branch observation output was malformed.",
			);
		}
		const [branch, localTip, upstream] = fields;
		if (
			branch === undefined ||
			localTip === undefined ||
			upstream === undefined ||
			!expected.has(branch) ||
			branch === "" ||
			localTip === ""
		) {
			return failure(
				"flow-minimal-submit-observation-parse-failed",
				"Git branch observation output did not match the affected branch set.",
			);
		}
		if (localTips[branch] !== undefined) {
			return failure(
				"flow-minimal-submit-observation-parse-failed",
				"Git branch observation output contained a duplicate affected branch.",
			);
		}
		localTips[branch] = localTip;
		upstreamRefs[branch] = upstream;
	}
	if (Object.keys(localTips).length !== expected.size) {
		return failure(
			"flow-minimal-submit-observation-incomplete",
			"One or more affected local branch refs could not be observed.",
		);
	}
	return { ok: true, value: { localTips, upstreamRefs } };
}

function parseRemoteBranchObservations(
	stdout: string,
	expectedRefs: readonly string[],
	upstreamBranches: Readonly<Record<string, readonly string[]>>,
):
	| { readonly ok: true; readonly value: Readonly<Record<string, string>> }
	| { readonly ok: false; readonly error: FlowMinimalSubmitError } {
	const expected = new Set(expectedRefs);
	const tipsByRef: Record<string, string> = {};
	for (const line of stdout.split(/\r?\n/u)) {
		if (line === "") continue;
		const fields = line.split(" ");
		if (fields.length !== 2) {
			return failure(
				"flow-minimal-submit-remote-observation-parse-failed",
				"Git upstream observation output was malformed.",
			);
		}
		const [tip, ref] = fields;
		if (
			tip === undefined ||
			ref === undefined ||
			tip === "" ||
			ref === "" ||
			!expected.has(ref) ||
			tipsByRef[ref] !== undefined
		) {
			return failure(
				"flow-minimal-submit-remote-observation-parse-failed",
				"Git upstream observation output did not match the affected upstream ref set.",
			);
		}
		tipsByRef[ref] = tip;
	}
	if (Object.keys(tipsByRef).length !== expected.size) {
		return failure(
			"flow-minimal-submit-remote-observation-incomplete",
			"One or more affected upstream refs could not be observed.",
		);
	}
	const remoteTips: Record<string, string> = {};
	for (const ref of expectedRefs) {
		const branches = upstreamBranches[ref];
		const tip = tipsByRef[ref];
		if (branches === undefined || tip === undefined) {
			return failure(
				"flow-minimal-submit-remote-observation-incomplete",
				"One or more affected upstream refs could not be observed.",
			);
		}
		for (const branch of branches) remoteTips[branch] = tip;
	}
	return { ok: true, value: remoteTips };
}

function failure(
	code: FlowMinimalSubmitErrorCode,
	message: string,
	displayCommand?: string,
): { readonly ok: false; readonly error: FlowMinimalSubmitError } {
	return {
		ok: false as const,
		error: {
			code,
			message,
			...(displayCommand === undefined ? {} : { displayCommand }),
		},
	};
}
