import { readFile } from "node:fs/promises";
import { join } from "node:path";

import {
	type CommandExecApi,
	commandFailureReason,
	formatCommand,
} from "@nseng-ai/foundation/command";
import { formatErrorMessage, type ExplicitUndefined } from "@nseng-ai/foundation/primitives";
import type { GitGateway } from "@nseng-ai/capability-kit/git";
import { RealGitGateway } from "@nseng-ai/capability-kit/git";

import { parseUnifiedDiff } from "../core/diff-parsing.ts";
import type { LocalDiffFailure, RoasterResult } from "../core/failures.ts";
import { createLocalDiff, type LocalDiff } from "../core/models.ts";
import { buildGitDiffArgs, parseRoasterProjectConfigToml } from "../core/project-config.ts";
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
	loadDiff(options: LoadDiffOptions): Promise<RoasterResult<LocalDiff>>;
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

	async loadDiff(options: LoadDiffOptions): Promise<RoasterResult<LocalDiff>> {
		const repoRoot = await this.gitGateway.repoRoot({ cwd: options.cwd, signal: options.signal });
		if (!repoRoot.ok) {
			return error({
				type: "repo-root-unavailable",
				message: repoRoot.error.message,
			});
		}

		const baseRef = await this.resolveBaseRef(options, repoRoot.value);
		if (baseRef.type === "error") return baseRef;

		const excludeGlobsResult = await this.resolveExcludeGlobs(options, repoRoot.value);
		if (excludeGlobsResult.type === "error") return excludeGlobsResult;
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
				type: "git-invocation-failed",
				message: `${displayCommand} failed to start in ${repoRoot.value}: ${formatErrorMessage(caught)}`,
			});
		}

		if (result.code !== 0 || result.killed) {
			return error({
				type: "git-diff-failed",
				message: `${displayCommand} failed in ${repoRoot.value}: ${commandFailureReason(result)}`,
			});
		}

		return {
			type: "ok",
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
	): Promise<RoasterResult<string>> {
		const explicitBaseRef = options.baseRef?.trim() ?? "";
		if (explicitBaseRef !== "") return { type: "ok", value: explicitBaseRef };

		const trunk = await this.gitGateway.trunkBranch({ cwd: repoRoot, signal: options.signal });
		if (trunk.type === "found" && trunk.value.trim() !== "")
			return { type: "ok", value: trunk.value.trim() };
		if (trunk.type === "error")
			return error({ type: "base-ref-unavailable", message: trunk.error.message });
		return error({
			type: "base-ref-unavailable",
			message: "Unable to resolve a base branch. Pass --base-ref explicitly.",
		});
	}

	private async resolveExcludeGlobs(
		options: LoadDiffOptions,
		repoRoot: string,
	): Promise<RoasterResult<readonly string[]>> {
		if (options.excludeGlobs !== undefined) return { type: "ok", value: options.excludeGlobs };

		const path = join(repoRoot, "ns.toml");
		let source: string;
		try {
			source = await readFile(path, "utf8");
		} catch (caught) {
			if (isMissingFileError(caught)) return { type: "ok", value: [] };
			return error({
				type: "project-config-invalid",
				message: `Failed to read ns.toml: ${formatErrorMessage(caught)}`,
			});
		}

		const config = parseRoasterProjectConfigToml(source, path);
		if (config.type === "error")
			return error({ type: "project-config-invalid", message: config.error.message });
		return { type: "ok", value: config.config.diff.exclude };
	}
}

export interface FakeLocalDiffGatewayOptions {
	readonly diffsByBaseRef?:
		| ReadonlyMap<string | null | undefined, RoasterResult<LocalDiff>>
		| Readonly<Record<string, RoasterResult<LocalDiff>>>;
	readonly defaultDiff?: RoasterResult<LocalDiff>;
}

export class FakeLocalDiffGateway implements LocalDiffGateway {
	private readonly diffsByBaseRef = new Map<string | null | undefined, RoasterResult<LocalDiff>>();
	private readonly defaultDiff: RoasterResult<LocalDiff>;
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
				type: "ok",
				value: createLocalDiff({ baseRef: "main", diffText: "", files: [] }),
			},
		);
	}

	async loadDiff(options: LoadDiffOptions): Promise<RoasterResult<LocalDiff>> {
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

function copyResult(result: RoasterResult<LocalDiff>): RoasterResult<LocalDiff> {
	if (result.type === "error") return { type: "error", error: { ...result.error } };
	return { type: "ok", value: localDiffCopy(result.value) };
}

function localDiffCopy(value: LocalDiff): LocalDiff {
	return createLocalDiff({ baseRef: value.baseRef, diffText: value.diffText, files: value.files });
}

function error(errorValue: LocalDiffFailure): RoasterResult<never> {
	return { type: "error", error: errorValue };
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
