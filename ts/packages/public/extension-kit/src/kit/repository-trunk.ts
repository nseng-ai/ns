import type {
	GitBranchParams,
	GitErrorInfo,
	GitGateway,
	GitNameValidationResult,
	GitRefParams,
	GitRefPresenceResult,
} from "@nseng-ai/foundation/git";
import type { ExplicitUndefined } from "@nseng-ai/foundation/primitives";
import type { Result } from "@nseng-ai/foundation/result";

export {
	createNodeRepositoryTrunkConfigLoader,
	createRepositoryTrunkConfigLoader,
	nodeRepositoryTrunkConfigLoader,
} from "./repository-trunk-config.ts";

export interface RepositoryTrunkConfig {
	readonly remote: string;
	readonly trunk?: string;
}

export type RepositoryTrunkConfigErrorCode = "config-read-failed" | "config-invalid";

export interface RepositoryTrunkConfigError {
	readonly code: RepositoryTrunkConfigErrorCode;
	readonly message: string;
}

export interface RepositoryTrunkConfigLoader {
	load(repoRoot: string): Result<RepositoryTrunkConfig, RepositoryTrunkConfigError>;
}

export type RepositoryTrunkSource = "configured" | "cached-remote-head";

export interface RepositoryTrunk {
	readonly branch: string;
	readonly remote: string;
	readonly localRef: string;
	readonly remoteTrackingRef: string;
	readonly source: RepositoryTrunkSource;
}

export type RepositoryTrunkErrorCode =
	| RepositoryTrunkConfigErrorCode
	| "remote-invalid"
	| "branch-invalid"
	| "cached-remote-head-missing"
	| "cached-remote-head-malformed"
	| "local-branch-missing"
	| "remote-tracking-branch-missing"
	| "git-failed";

export interface RepositoryTrunkError {
	readonly code: RepositoryTrunkErrorCode;
	readonly message: string;
	readonly cause?: GitErrorInfo;
}

export type RepositoryTrunkResult = Result<RepositoryTrunk, RepositoryTrunkError>;

export type RepositoryTrunkGitGateway = Pick<
	GitGateway,
	"validateBranchName" | "validateRefName" | "symbolicRef" | "exactRefPresence"
>;

export interface ResolveRepositoryTrunkOptions {
	readonly repoRoot: string;
	readonly git: RepositoryTrunkGitGateway;
	readonly config: RepositoryTrunkConfigLoader;
	readonly env?: ExplicitUndefined<"env-map", NodeJS.ProcessEnv>;
	readonly signal?: ExplicitUndefined<"abort-signal", AbortSignal>;
}

export async function resolveRepositoryTrunk(
	options: ResolveRepositoryTrunkOptions,
): Promise<RepositoryTrunkResult> {
	const configResult = options.config.load(options.repoRoot);
	if (!configResult.ok) return configResult;

	const { remote, trunk } = configResult.value;
	const remoteProbeRef = `refs/remotes/${remote}/trunk-validation`;
	const remoteValidation = await options.git.validateRefName(refParams(options, remoteProbeRef));
	if (remoteValidation.type !== "valid") {
		return validationFailure(
			remoteValidation,
			"remote-invalid",
			`Configured Git remote ${JSON.stringify(remote)} is invalid. Set [git].remote in ns.toml to a valid Git remote name.`,
		);
	}

	let branch: string;
	let source: RepositoryTrunkSource;
	if (trunk !== undefined) {
		branch = trunk;
		source = "configured";
	} else {
		const remoteHeadRef = `refs/remotes/${remote}/HEAD`;
		const remoteHeadValidation = await options.git.validateRefName(
			refParams(options, remoteHeadRef),
		);
		if (remoteHeadValidation.type !== "valid") {
			return validationFailure(
				remoteHeadValidation,
				"remote-invalid",
				`Configured Git remote ${JSON.stringify(remote)} cannot form a valid cached remote HEAD ref. Set [git].remote in ns.toml to a valid Git remote name.`,
			);
		}
		const remoteHead = await options.git.symbolicRef(refParams(options, remoteHeadRef));
		if (remoteHead.type === "error")
			return gitFailure("read the cached remote HEAD", remoteHead.error);
		if (remoteHead.type === "missing") {
			return {
				ok: false,
				error: {
					code: "cached-remote-head-missing",
					message: `Cached remote HEAD \`${remoteHeadRef}\` is missing. Fetch remote \`${remote}\` or configure [git].trunk in ns.toml. Resolution is offline and does not contact the remote.`,
				},
			};
		}
		const parsedBranch = branchFromRemoteHead(remoteHead.value, remote, remoteHeadRef);
		if (!parsedBranch.ok) return parsedBranch;
		branch = parsedBranch.value;
		source = "cached-remote-head";
	}

	const branchValidation = await options.git.validateBranchName(branchParams(options, branch));
	if (branchValidation.type !== "valid") {
		return validationFailure(
			branchValidation,
			"branch-invalid",
			`Repository trunk branch ${JSON.stringify(branch)} is invalid. ${source === "configured" ? "Set [git].trunk in ns.toml to a valid literal branch name." : `Repair the cached remote HEAD for \`${remote}\` or configure [git].trunk in ns.toml.`}`,
		);
	}

	const localRef = `refs/heads/${branch}`;
	const remoteTrackingRef = `refs/remotes/${remote}/${branch}`;
	for (const ref of [localRef, remoteTrackingRef]) {
		const validation = await options.git.validateRefName(refParams(options, ref));
		if (validation.type !== "valid") {
			return validationFailure(
				validation,
				"branch-invalid",
				`Repository trunk branch ${JSON.stringify(branch)} cannot form the required ref \`${ref}\`. ${source === "configured" ? "Correct [git].trunk in ns.toml." : `Repair the cached remote HEAD for \`${remote}\` or configure [git].trunk in ns.toml.`}`,
			);
		}
	}

	const resolution = { branch, remote, localRef, remoteTrackingRef, source };
	const localPresence = await options.git.exactRefPresence(refParams(options, localRef));
	const localFailure = presenceFailure(localPresence, resolution, "local");
	if (localFailure !== undefined) return localFailure;

	const remotePresence = await options.git.exactRefPresence(refParams(options, remoteTrackingRef));
	const remoteFailure = presenceFailure(remotePresence, resolution, "remote");
	if (remoteFailure !== undefined) return remoteFailure;

	return { ok: true, value: resolution };
}

function branchFromRemoteHead(
	target: string,
	remote: string,
	remoteHeadRef: string,
): Result<string, RepositoryTrunkError> {
	const prefix = `refs/remotes/${remote}/`;
	const branch = target.startsWith(prefix) ? target.slice(prefix.length) : "";
	if (branch !== "" && target !== remoteHeadRef) return { ok: true, value: branch };
	return {
		ok: false,
		error: {
			code: "cached-remote-head-malformed",
			message: `Cached remote HEAD \`${remoteHeadRef}\` has malformed target ${JSON.stringify(target)}. It must point beneath \`${prefix}\` to a branch other than HEAD. Repair the cached symbolic ref or configure [git].trunk in ns.toml; cached remote HEAD data may be stale.`,
		},
	};
}

function validationFailure(
	result: Exclude<GitNameValidationResult, { type: "valid" }>,
	code: "remote-invalid" | "branch-invalid",
	message: string,
): RepositoryTrunkResult {
	return {
		ok: false,
		error: {
			code: result.type === "error" ? "git-failed" : code,
			message:
				result.type === "error"
					? `Git failed while validating repository trunk names. ${result.error.message}`
					: message,
			cause: result.error,
		},
	};
}

function gitFailure(operation: string, cause: GitErrorInfo): RepositoryTrunkResult {
	return {
		ok: false,
		error: {
			code: "git-failed",
			message: `Git failed while attempting to ${operation}. ${cause.message}`,
			cause,
		},
	};
}

function presenceFailure(
	result: GitRefPresenceResult,
	resolution: RepositoryTrunk,
	kind: "local" | "remote",
): RepositoryTrunkResult | undefined {
	if (result.type === "present") return undefined;
	if (result.type === "error") {
		const ref = kind === "local" ? resolution.localRef : resolution.remoteTrackingRef;
		return gitFailure(`check required ref \`${ref}\``, result.error);
	}
	if (kind === "local") {
		return {
			ok: false,
			error: {
				code: "local-branch-missing",
				message: `Repository trunk local ref \`${resolution.localRef}\` is missing. Create a local branch \`${resolution.branch}\` from \`${resolution.remoteTrackingRef}\` after fetching if needed.`,
			},
		};
	}
	return {
		ok: false,
		error: {
			code: "remote-tracking-branch-missing",
			message: `Repository trunk tracking ref \`${resolution.remoteTrackingRef}\` is missing. Fetch remote \`${resolution.remote}\`; cached remote HEAD data may be stale.`,
		},
	};
}

function refParams(options: ResolveRepositoryTrunkOptions, ref: string): GitRefParams {
	return {
		cwd: options.repoRoot,
		ref,
		...(options.env === undefined ? {} : { env: options.env }),
		...(options.signal === undefined ? {} : { signal: options.signal }),
	};
}

function branchParams(options: ResolveRepositoryTrunkOptions, branch: string): GitBranchParams {
	return {
		cwd: options.repoRoot,
		branch,
		...(options.env === undefined ? {} : { env: options.env }),
		...(options.signal === undefined ? {} : { signal: options.signal }),
	};
}
