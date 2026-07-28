import { readFile } from "node:fs/promises";
import { join } from "node:path";

import {
	type CommandExecApi,
	commandFailureReason,
	commandSucceeded,
	formatCommand,
} from "@nseng-ai/foundation/command";
import { formatErrorMessage, type ExplicitUndefined } from "@nseng-ai/foundation/primitives";
import { resultErr } from "@nseng-ai/foundation/result";
import type { GitGateway, GitTrunkBranchResult } from "@nseng-ai/foundation/git";
import { RealGitGateway } from "@nseng-ai/foundation/git";

import { parseUnifiedDiff } from "../core/diff-parsing.ts";
import type { LocalDiffFailure, ReviewResult } from "../core/failures.ts";
import { createLocalDiff, type LocalDiff } from "../core/models.ts";
import { buildGitDiffArgs, parseReviewsProjectConfigToml } from "../core/project-config.ts";
import { isMissingFileError } from "./filesystem-errors.ts";

const GIT_TIMEOUT_MS = 10_000;

export interface LoadDiffOptions {
	readonly cwd: string;
	readonly env?: ExplicitUndefined<"env-map", NodeJS.ProcessEnv>;
	readonly baseRef?: string | null;
	readonly signal?: ExplicitUndefined<"abort-signal", AbortSignal>;
	readonly excludeGlobs?: readonly string[];
}

export interface LocalDiffGateway {
	loadDiff(options: LoadDiffOptions): Promise<ReviewResult<LocalDiff>>;
}

export interface RealLocalDiffGatewayOptions {
	readonly execApi: CommandExecApi;
	readonly gitGateway?: GitGateway;
}

export class RealLocalDiffGateway implements LocalDiffGateway {
	private readonly execApi: CommandExecApi;
	private readonly gitGateway: GitGateway;

	constructor(options: RealLocalDiffGatewayOptions) {
		this.execApi = options.execApi;
		this.gitGateway = options.gitGateway ?? new RealGitGateway(options.execApi);
	}

	async loadDiff(options: LoadDiffOptions): Promise<ReviewResult<LocalDiff>> {
		const repoRoot = await this.gitGateway.repoRoot({ cwd: options.cwd, signal: options.signal });
		if (!repoRoot.ok) {
			return error({
				code: "repo-root-unavailable",
				message: repoRoot.error.message,
			});
		}

		const baseRef = await this.resolveBaseRef(options, repoRoot.value);
		if (!baseRef.ok) return baseRef;

		const excludeGlobsResult = await this.resolveExcludeGlobs(options, repoRoot.value);
		if (!excludeGlobsResult.ok) return excludeGlobsResult;
		const excludeGlobs = excludeGlobsResult.value;

		const args = [...buildGitDiffArgs({ baseRef: baseRef.value, excludeGlobs })];
		const displayCommand = formatGitDiffDisplayCommand({
			baseRef: baseRef.value,
			excludeGlobs,
		});
		let result;
		try {
			result = await this.execApi.exec("git", args, execOptions(repoRoot.value, options));
		} catch (caught) {
			return error({
				code: "git-invocation-failed",
				message: `${displayCommand} failed to start in ${repoRoot.value}: ${formatErrorMessage(caught)}`,
			});
		}

		if (!commandSucceeded(result)) {
			return error({
				code: "git-diff-failed",
				message: `${displayCommand} failed in ${repoRoot.value}: ${commandFailureReason(result)}`,
			});
		}

		return {
			ok: true,
			value: createLocalDiff({
				baseRef: baseRef.value,
				diffText: result.stdout,
				files: parseUnifiedDiff(result.stdout),
			}),
		};
	}

	private async resolveBaseRef(
		options: LoadDiffOptions,
		repoRoot: string,
	): Promise<ReviewResult<string>> {
		const explicitBaseRef = options.baseRef?.trim() ?? "";
		if (explicitBaseRef !== "") return { ok: true, value: explicitBaseRef };

		const trunk = await this.gitGateway.trunkBranch({ cwd: repoRoot, signal: options.signal });
		if (trunk.type === "resolved") return { ok: true, value: trunk.resolution.remoteTrackingRef };
		return error({
			code: "base-ref-unavailable",
			message: formatTrunkBaseRefFailure(trunk),
		});
	}

	private async resolveExcludeGlobs(
		options: LoadDiffOptions,
		repoRoot: string,
	): Promise<ReviewResult<readonly string[]>> {
		if (options.excludeGlobs !== undefined) return { ok: true, value: options.excludeGlobs };

		const path = join(repoRoot, "ns.toml");
		let source: string;
		try {
			source = await readFile(path, "utf8");
		} catch (caught) {
			if (isMissingFileError(caught)) return { ok: true, value: [] };
			return error({
				code: "project-config-invalid",
				message: `Failed to read ns.toml: ${formatErrorMessage(caught)}`,
			});
		}

		const config = parseReviewsProjectConfigToml(source, path);
		if (!config.ok) return error({ code: "project-config-invalid", message: config.error.message });
		return { ok: true, value: config.value.diff.exclude };
	}
}

function formatTrunkBaseRefFailure(
	result: Exclude<GitTrunkBranchResult, { type: "resolved" }>,
): string {
	switch (result.type) {
		case "selected-remote-invalid":
		case "configured-branch-invalid":
			return `${result.error.message} Pass --base-ref explicitly.`;
		case "cached-remote-head-missing":
			return `Unable to resolve a base ref because ${result.remoteHeadRef} is missing. Fetch ${result.remote}, configure [git].trunk, or pass --base-ref explicitly.`;
		case "cached-remote-head-malformed":
			return `Unable to resolve a base ref because ${result.remoteHeadRef} has malformed target ${JSON.stringify(result.target)}. Repair it, configure [git].trunk, or pass --base-ref explicitly.`;
		case "local-branch-missing":
			return `Unable to resolve a base ref because ${result.resolution.localRef} is missing. Create or fetch ${result.resolution.branch}, or pass --base-ref explicitly.`;
		case "remote-tracking-branch-missing":
			return `Unable to resolve a base ref because ${result.resolution.remoteTrackingRef} is missing. Fetch ${result.resolution.remote}, or pass --base-ref explicitly.`;
		case "command-failure":
			return `Unable to resolve a base ref while attempting to ${result.operation.replaceAll("-", " ")} (${result.reason}): ${result.error.message} Pass --base-ref explicitly.`;
	}
}

export interface FakeLocalDiffGatewayOptions {
	readonly diffsByBaseRef?:
		| ReadonlyMap<string | null | undefined, ReviewResult<LocalDiff>>
		| Readonly<Record<string, ReviewResult<LocalDiff>>>;
	readonly defaultDiff?: ReviewResult<LocalDiff>;
}

export class FakeLocalDiffGateway implements LocalDiffGateway {
	private readonly diffsByBaseRef = new Map<string | null | undefined, ReviewResult<LocalDiff>>();
	private readonly defaultDiff: ReviewResult<LocalDiff>;
	private readonly requestedBaseRefsInternal: Array<string | null | undefined> = [];
	private readonly requestedExcludeGlobsInternal: Array<readonly string[] | undefined> = [];

	constructor(options: FakeLocalDiffGatewayOptions = {}) {
		if (options.diffsByBaseRef instanceof Map) {
			for (const [key, value] of options.diffsByBaseRef.entries())
				this.diffsByBaseRef.set(key, copyResult(value));
		} else if (options.diffsByBaseRef !== undefined) {
			for (const [key, value] of Object.entries(options.diffsByBaseRef))
				this.diffsByBaseRef.set(key, copyResult(value));
		}
		this.defaultDiff = copyResult(
			options.defaultDiff ?? {
				ok: true,
				value: createLocalDiff({ baseRef: "main", diffText: "", files: [] }),
			},
		);
	}

	async loadDiff(options: LoadDiffOptions): Promise<ReviewResult<LocalDiff>> {
		this.requestedBaseRefsInternal.push(options.baseRef);
		this.requestedExcludeGlobsInternal.push(options.excludeGlobs);
		return copyResult(this.diffsByBaseRef.get(options.baseRef) ?? this.defaultDiff);
	}

	requestedBaseRefs(): readonly (string | null | undefined)[] {
		return [...this.requestedBaseRefsInternal];
	}

	requestedExcludeGlobs(): readonly (readonly string[] | undefined)[] {
		return this.requestedExcludeGlobsInternal.map((value) =>
			value === undefined ? undefined : [...value],
		);
	}
}

function copyResult(result: ReviewResult<LocalDiff>): ReviewResult<LocalDiff> {
	if (!result.ok) return { ok: false, error: { ...result.error } };
	return { ok: true, value: localDiffCopy(result.value) };
}

function localDiffCopy(value: LocalDiff): LocalDiff {
	return createLocalDiff({ baseRef: value.baseRef, diffText: value.diffText, files: value.files });
}

function error(errorValue: LocalDiffFailure): ReviewResult<never> {
	return resultErr(errorValue);
}

function execOptions(
	cwd: string,
	options: LoadDiffOptions,
): { cwd: string; env?: NodeJS.ProcessEnv; signal?: AbortSignal; timeout: number } {
	return {
		cwd,
		timeout: GIT_TIMEOUT_MS,
		...(options.env === undefined ? {} : { env: options.env }),
		...(options.signal === undefined ? {} : { signal: options.signal }),
	};
}

export function formatGitDiffDisplayCommand(options: {
	readonly baseRef: string;
	readonly excludeGlobs?: readonly string[];
}): string {
	return formatCommand("git", buildGitDiffArgs(options));
}
