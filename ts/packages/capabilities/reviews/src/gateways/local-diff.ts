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
import type { GitGateway } from "@nseng-ai/foundation/git";
import { RealGitGateway } from "@nseng-ai/foundation/git";

import { parseUnifiedDiff } from "../core/diff-parsing.ts";
import type { LocalDiffFailure, ReviewResult } from "../core/failures.ts";
import {
	createLocalDiff,
	createRevisionRangeLocalDiff,
	revisionRangeSchema,
	type LocalDiff,
} from "../core/models.ts";
import { buildGitDiffArgs, parseReviewsProjectConfigToml } from "../core/project-config.ts";
import { isMissingFileError } from "./filesystem-errors.ts";

const GIT_TIMEOUT_MS = 10_000;

export type DiffSelection = {
	readonly type: "revision-range";
	readonly revisionRange: string;
};

interface LoadDiffCommonOptions {
	readonly cwd: string;
	readonly env?: ExplicitUndefined<"env-map", NodeJS.ProcessEnv>;
	readonly signal?: ExplicitUndefined<"abort-signal", AbortSignal>;
	readonly excludeGlobs?: readonly string[];
}

export type LoadDiffOptions = LoadDiffCommonOptions &
	(
		| {
				/** Compatibility selection for incumbent single-review callers. */
				readonly baseRef?: string | null;
				readonly selection?: never;
		  }
		| {
				readonly baseRef?: never;
				readonly selection: DiffSelection;
		  }
	);

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

		const selection = await this.resolveSelection(options, repoRoot.value);
		if (!selection.ok) return selection;

		const excludeGlobsResult = await this.resolveExcludeGlobs(options, repoRoot.value);
		if (!excludeGlobsResult.ok) return excludeGlobsResult;
		const excludeGlobs = excludeGlobsResult.value;

		const diffArgs =
			selection.value.type === "base-ref"
				? { type: "base-ref" as const, baseRef: selection.value.baseRef, excludeGlobs }
				: {
						type: "revision-range" as const,
						revisionRange: selection.value.revisionRange,
						excludeGlobs,
					};
		const args = [...buildGitDiffArgs(diffArgs)];
		const displayCommand = formatGitDiffDisplayCommand(diffArgs);
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

		const files = parseUnifiedDiff(result.stdout);
		return {
			ok: true,
			value:
				selection.value.type === "base-ref"
					? createLocalDiff({ baseRef: selection.value.baseRef, diffText: result.stdout, files })
					: createRevisionRangeLocalDiff({
							revisionRange: selection.value.revisionRange,
							diffText: result.stdout,
							files,
						}),
		};
	}

	private async resolveSelection(
		options: LoadDiffOptions,
		repoRoot: string,
	): Promise<
		ReviewResult<
			{ type: "base-ref"; baseRef: string } | { type: "revision-range"; revisionRange: string }
		>
	> {
		if (options.selection !== undefined) {
			const revisionRange = revisionRangeSchema.safeParse(options.selection.revisionRange);
			if (!revisionRange.success)
				return error({
					code: "git-diff-failed",
					message: revisionRange.error.issues[0]?.message ?? "Invalid revision range.",
				});
			return { ok: true, value: { type: "revision-range", revisionRange: revisionRange.data } };
		}
		const resolved = await this.resolveBaseRef(options, repoRoot);
		return resolved.ok
			? { ok: true, value: { type: "base-ref", baseRef: resolved.value } }
			: resolved;
	}

	private async resolveBaseRef(
		options: LoadDiffOptions,
		repoRoot: string,
	): Promise<ReviewResult<string>> {
		const explicitBaseRef = options.baseRef?.trim() ?? "";
		if (explicitBaseRef !== "") return { ok: true, value: explicitBaseRef };

		const trunk = await this.gitGateway.trunkBranch({ cwd: repoRoot, signal: options.signal });
		if (trunk.type === "found" && trunk.value.trim() !== "")
			return { ok: true, value: trunk.value.trim() };
		if (trunk.type === "error")
			return error({ code: "base-ref-unavailable", message: trunk.error.message });
		return error({
			code: "base-ref-unavailable",
			message: "Unable to resolve a base branch. Pass --base-ref explicitly.",
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

export interface FakeLocalDiffGatewayOptions {
	readonly diffsByBaseRef?:
		| ReadonlyMap<string | null | undefined, ReviewResult<LocalDiff>>
		| Readonly<Record<string, ReviewResult<LocalDiff>>>;
	readonly diffsByRevisionRange?:
		| ReadonlyMap<string, ReviewResult<LocalDiff>>
		| Readonly<Record<string, ReviewResult<LocalDiff>>>;
	readonly defaultDiff?: ReviewResult<LocalDiff>;
}

export class FakeLocalDiffGateway implements LocalDiffGateway {
	private readonly diffsByBaseRef = new Map<string | null | undefined, ReviewResult<LocalDiff>>();
	private readonly diffsByRevisionRange = new Map<string, ReviewResult<LocalDiff>>();
	private readonly defaultDiff: ReviewResult<LocalDiff>;
	private readonly requestedBaseRefsInternal: Array<string | null | undefined> = [];
	private readonly requestedSelectionsInternal: DiffSelection[] = [];
	private readonly requestedExcludeGlobsInternal: Array<readonly string[] | undefined> = [];

	constructor(options: FakeLocalDiffGatewayOptions = {}) {
		if (options.diffsByBaseRef instanceof Map) {
			for (const [key, value] of options.diffsByBaseRef.entries())
				this.diffsByBaseRef.set(key, copyResult(value));
		} else if (options.diffsByBaseRef !== undefined) {
			for (const [key, value] of Object.entries(options.diffsByBaseRef))
				this.diffsByBaseRef.set(key, copyResult(value));
		}
		if (options.diffsByRevisionRange instanceof Map) {
			for (const [key, value] of options.diffsByRevisionRange.entries())
				this.diffsByRevisionRange.set(key, copyResult(value));
		} else if (options.diffsByRevisionRange !== undefined) {
			for (const [key, value] of Object.entries(options.diffsByRevisionRange))
				this.diffsByRevisionRange.set(key, copyResult(value));
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
		if (options.selection !== undefined)
			this.requestedSelectionsInternal.push(structuredClone(options.selection));
		this.requestedExcludeGlobsInternal.push(options.excludeGlobs);
		const configured =
			options.selection !== undefined
				? this.diffsByRevisionRange.get(options.selection.revisionRange)
				: this.diffsByBaseRef.get(options.baseRef);
		return copyResult(configured ?? this.defaultDiff);
	}

	requestedBaseRefs(): readonly (string | null | undefined)[] {
		return [...this.requestedBaseRefsInternal];
	}

	requestedSelections(): readonly DiffSelection[] {
		return structuredClone(this.requestedSelectionsInternal);
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
	return value.sourceType === "base-ref"
		? createLocalDiff({ baseRef: value.baseRef, diffText: value.diffText, files: value.files })
		: createRevisionRangeLocalDiff({
				revisionRange: value.revisionRange,
				diffText: value.diffText,
				files: value.files,
			});
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

export function formatGitDiffDisplayCommand(
	options:
		| {
				readonly type?: "base-ref";
				readonly baseRef: string;
				readonly excludeGlobs?: readonly string[];
		  }
		| {
				readonly type: "revision-range";
				readonly revisionRange: string;
				readonly excludeGlobs?: readonly string[];
		  },
): string {
	return formatCommand("git", buildGitDiffArgs(options));
}
