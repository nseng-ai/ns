import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { commandFailureReason, formatCommand, type CommandExecApi } from "@asdl/core/exec";
import { formatErrorMessage } from "@asdl/core/primitives";
import { type GitGateway, RealGitGateway } from "@asdl/core/git";

import { parseUnifiedDiff } from "../diff-parsing.ts";
import type { LocalDiffFailure, RoasterResult } from "../failures.ts";
import { createLocalDiff, type LocalDiff } from "../models.ts";
import { buildGitDiffArgs, parseRoasterProjectConfigToml } from "../project-config.ts";
import { isMissingFileError } from "./filesystem-errors.ts";

const GIT_TIMEOUT_MS = 10_000;

export interface LoadDiffOptions {
	readonly cwd: string;
	readonly env?: NodeJS.ProcessEnv | undefined;
	readonly baseRef?: string | null | undefined;
	readonly signal?: AbortSignal | undefined;
}

export interface LocalDiffGateway {
	loadDiff(options: LoadDiffOptions): Promise<RoasterResult<LocalDiff>>;
}

export interface RealLocalDiffGatewayOptions {
	readonly execApi: CommandExecApi;
	readonly gitGateway?: GitGateway | undefined;
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
				type: "repo_root_unavailable",
				message: repoRoot.error.message,
			});
		}

		const baseRef = await this.resolveBaseRef(options, repoRoot.value);
		if (baseRef.type === "error") return baseRef;

		const config = await this.loadProjectConfig(repoRoot.value);
		if (config.type === "error") return config;

		const args = [...buildGitDiffArgs({ baseRef: baseRef.value, excludeGlobs: config.value })];
		const displayCommand = formatGitDiffDisplayCommand({
			baseRef: baseRef.value,
			excludeGlobs: config.value,
		});
		let result;
		try {
			result = await this.execApi.exec("git", args, execOptions(repoRoot.value, options));
		} catch (caught) {
			return error({
				type: "git_invocation_failed",
				message: `${displayCommand} failed to start in ${repoRoot.value}: ${formatErrorMessage(caught)}`,
			});
		}

		if (result.code !== 0 || result.killed) {
			return error({
				type: "git_diff_failed",
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
			return error({ type: "base_ref_unavailable", message: trunk.error.message });
		return error({
			type: "base_ref_unavailable",
			message: "Unable to resolve a base branch. Pass --base-ref explicitly.",
		});
	}

	private async loadProjectConfig(repoRoot: string): Promise<RoasterResult<readonly string[]>> {
		const path = join(repoRoot, "asdl.toml");
		let source: string;
		try {
			source = await readFile(path, "utf8");
		} catch (caught) {
			if (isMissingFileError(caught)) return { type: "ok", value: [] };
			return error({
				type: "project_config_invalid",
				message: `Failed to read asdl.toml: ${formatErrorMessage(caught)}`,
			});
		}

		const config = parseRoasterProjectConfigToml(source, path);
		if (config.type === "error")
			return error({ type: "project_config_invalid", message: config.error.message });
		return { type: "ok", value: config.config.diff.exclude };
	}
}

export interface FakeLocalDiffGatewayOptions {
	readonly diffsByBaseRef?:
		| ReadonlyMap<string | null | undefined, RoasterResult<LocalDiff>>
		| Readonly<Record<string, RoasterResult<LocalDiff>>>
		| undefined;
	readonly defaultDiff?: RoasterResult<LocalDiff> | undefined;
}

export class FakeLocalDiffGateway implements LocalDiffGateway {
	private readonly diffsByBaseRef = new Map<string | null | undefined, RoasterResult<LocalDiff>>();
	private readonly defaultDiff: RoasterResult<LocalDiff>;
	private readonly requestedBaseRefsInternal: Array<string | null | undefined> = [];

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
		return copyResult(this.diffsByBaseRef.get(options.baseRef) ?? this.defaultDiff);
	}

	requestedBaseRefs(): readonly (string | null | undefined)[] {
		return [...this.requestedBaseRefsInternal];
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
	readonly excludeGlobs?: readonly string[] | undefined;
}): string {
	return formatCommand("git", buildGitDiffArgs(options));
}
