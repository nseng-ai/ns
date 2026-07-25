import {
	RealGraphiteStackGateway,
	type GraphiteStackGateway,
	type GraphiteStackGitGateway,
} from "@nseng-ai/capability-kit/graphite/stack";
import {
	commandFailureReason,
	commandSucceeded,
	execApiToCommandRunner,
	formatCommand,
	type CommandExecApi,
} from "@nseng-ai/foundation/exec";
import { RealGitGateway, type GitGateway } from "@nseng-ai/foundation/git";

import {
	createDispatchSourcePublicationClientFromGateways,
	DISPATCH_SOURCE_PUBLICATION_MAX_DIRTY_PATHS,
	type DispatchSourcePublicationClient,
	type DispatchSourcePublicationError,
	type DispatchSourcePublicationErrorCode,
	type DispatchSourcePublicationGatewayResult,
	type SourcePublicationRepositoryGateway,
	type SourcePublicationRepositoryInspection,
	type SourcePublicationRepositoryObservation,
} from "./source-publication.ts";
import { RealSubmitGateway } from "./submit-gateway.ts";
import type { SubmitTransportGateway } from "./submit-transport.ts";

const READ_TIMEOUT_MS = 30_000;
const OBSERVATION_FORMAT = "%(refname:short)%00%(objectname)%00%(upstream)";

export interface CreateDispatchSourcePublicationClientOptions {
	readonly cwd: string;
	readonly commands: CommandExecApi;
	readonly env?: NodeJS.ProcessEnv;
}

interface CreateDispatchSourcePublicationClientOverrides {
	readonly graphite?: Pick<GraphiteStackGateway, "stackForBranch">;
	readonly submit?: SubmitTransportGateway;
}

/** Bind source-publication Git, Graphite, and GitHub commands to the caller's execution channel. */
export function createDispatchSourcePublicationClient(
	options: CreateDispatchSourcePublicationClientOptions,
): DispatchSourcePublicationClient {
	return createDispatchSourcePublicationClientForRuntime(options);
}

/** Package-private runtime seam used by fake-driven command scenarios. */
export function createDispatchSourcePublicationClientForRuntime(
	options: CreateDispatchSourcePublicationClientOptions,
	overrides: CreateDispatchSourcePublicationClientOverrides = {},
): DispatchSourcePublicationClient {
	const git = new RealGitGateway(options.commands);
	const graphite =
		overrides.graphite ??
		new RealGraphiteStackGateway({
			env: options.env,
			execApi: options.commands,
			git: createDispatchGraphiteStackGitGateway(git),
		});
	return createDispatchSourcePublicationClientFromGateways({
		cwd: options.cwd,
		repository: createSourcePublicationRepositoryGateway(options, git),
		graphite,
		submit: overrides.submit ?? new RealSubmitGateway(execApiToCommandRunner(options.commands)),
	});
}

function createDispatchGraphiteStackGitGateway(
	git: Pick<GitGateway, "currentBranch" | "gitCommonDir">,
): GraphiteStackGitGateway {
	return {
		async getGitCommonDir(cwd: string): Promise<string | null> {
			const result = await git.gitCommonDir({ cwd });
			return result.ok ? result.value : null;
		},
		async getCurrentBranch(cwd: string) {
			const result = await git.currentBranch({ cwd });
			if (result.type === "branch" || result.type === "detached") return result;
			return { type: "failure", failure: { message: result.error.message } };
		},
	};
}

/** Package-private construction seam for fake-driven adapter tests. */
export function createSourcePublicationRepositoryGateway(
	options: CreateDispatchSourcePublicationClientOptions,
	git: Pick<GitGateway, "currentBranch" | "headCommit" | "statusPaths">,
): SourcePublicationRepositoryGateway {
	return new RealSourcePublicationRepositoryGateway(options, git);
}

class RealSourcePublicationRepositoryGateway implements SourcePublicationRepositoryGateway {
	private readonly cwd: string;
	private readonly commands: CommandExecApi;
	private readonly git: Pick<GitGateway, "currentBranch" | "headCommit" | "statusPaths">;

	constructor(
		options: CreateDispatchSourcePublicationClientOptions,
		git: Pick<GitGateway, "currentBranch" | "headCommit" | "statusPaths">,
	) {
		this.cwd = options.cwd;
		this.commands = options.commands;
		this.git = git;
	}

	async inspectCurrent(): Promise<
		DispatchSourcePublicationGatewayResult<SourcePublicationRepositoryInspection>
	> {
		return await inspectRepository(this.git, this.cwd);
	}

	async observeAffectedBranches(
		branches: readonly string[],
	): Promise<DispatchSourcePublicationGatewayResult<SourcePublicationRepositoryObservation>> {
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
				"dispatch-source-publication-observation-failed",
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
					"dispatch-source-publication-remote-observation-failed",
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
			} satisfies SourcePublicationRepositoryObservation,
		};
	}
}

async function inspectRepository(
	git: Pick<GitGateway, "currentBranch" | "headCommit" | "statusPaths">,
	cwd: string,
): Promise<DispatchSourcePublicationGatewayResult<SourcePublicationRepositoryInspection>> {
	const branch = await git.currentBranch({ cwd });
	if (branch.type !== "branch") {
		return failure(
			"dispatch-source-publication-branch-read-failed",
			branch.type === "detached"
				? "Source publication requires a checked-out branch."
				: branch.error.message,
		);
	}
	const head = await git.headCommit({ cwd });
	if (!head.ok) {
		return failure("dispatch-source-publication-head-read-failed", head.error.message);
	}
	const status = await git.statusPaths({ cwd });
	if (!status.ok) {
		return failure("dispatch-source-publication-status-read-failed", status.error.message);
	}
	return {
		ok: true as const,
		value: {
			source: { branch: branch.branch, headSha: head.value },
			dirtyPaths: status.value.changedPaths.slice(0, DISPATCH_SOURCE_PUBLICATION_MAX_DIRTY_PATHS),
			isDirtyPathsTruncated:
				status.value.changedPaths.length > DISPATCH_SOURCE_PUBLICATION_MAX_DIRTY_PATHS,
		} satisfies SourcePublicationRepositoryInspection,
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
	| { readonly ok: false; readonly error: DispatchSourcePublicationError } {
	const expected = new Set(expectedBranches);
	const localTips: Record<string, string> = {};
	const upstreamRefs: Record<string, string> = {};
	for (const line of stdout.split(/\r?\n/u)) {
		if (line === "") continue;
		const fields = line.split("\0");
		if (fields.length !== 3) {
			return failure(
				"dispatch-source-publication-observation-parse-failed",
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
				"dispatch-source-publication-observation-parse-failed",
				"Git branch observation output did not match the affected branch set.",
			);
		}
		if (localTips[branch] !== undefined) {
			return failure(
				"dispatch-source-publication-observation-parse-failed",
				"Git branch observation output contained a duplicate affected branch.",
			);
		}
		localTips[branch] = localTip;
		upstreamRefs[branch] = upstream;
	}
	if (Object.keys(localTips).length !== expected.size) {
		return failure(
			"dispatch-source-publication-observation-incomplete",
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
	| { readonly ok: false; readonly error: DispatchSourcePublicationError } {
	const expected = new Set(expectedRefs);
	const tipsByRef: Record<string, string> = {};
	for (const line of stdout.split(/\r?\n/u)) {
		if (line === "") continue;
		const fields = line.split(" ");
		if (fields.length !== 2) {
			return failure(
				"dispatch-source-publication-remote-observation-parse-failed",
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
				"dispatch-source-publication-remote-observation-parse-failed",
				"Git upstream observation output did not match the affected upstream ref set.",
			);
		}
		tipsByRef[ref] = tip;
	}
	if (Object.keys(tipsByRef).length !== expected.size) {
		return failure(
			"dispatch-source-publication-remote-observation-incomplete",
			"One or more affected upstream refs could not be observed.",
		);
	}
	const remoteTips: Record<string, string> = {};
	for (const ref of expectedRefs) {
		const branches = upstreamBranches[ref];
		const tip = tipsByRef[ref];
		if (branches === undefined || tip === undefined) {
			return failure(
				"dispatch-source-publication-remote-observation-incomplete",
				"One or more affected upstream refs could not be observed.",
			);
		}
		for (const branch of branches) remoteTips[branch] = tip;
	}
	return { ok: true, value: remoteTips };
}

function failure(
	code: DispatchSourcePublicationErrorCode,
	message: string,
	displayCommand?: string,
): { readonly ok: false; readonly error: DispatchSourcePublicationError } {
	return {
		ok: false as const,
		error: {
			code,
			message,
			...(displayCommand === undefined ? {} : { displayCommand }),
		},
	};
}
