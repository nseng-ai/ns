import { runCommand } from "@nseng-ai/foundation/exec";
import {
	type CommandRunner,
	outputListenerToExecCallbacks,
	type ExecResult,
} from "@nseng-ai/foundation/command";
import { optionalEntry } from "@nseng-ai/foundation/primitives";
import { stripTerminalEscapes } from "@nseng-ai/foundation/terminal-escapes";
import { firstNonEmptyLine } from "@nseng-ai/foundation/text-normalization";
import { runGraphiteCommand } from "@nseng-ai/extension-kit/graphite/branch";
import { runGitHubCliAsExecResult } from "@nseng-ai/extension-kit/github/cli";
import { z } from "zod";

import {
	isGitConflictWithConflictedFilesProse,
	isNoCurrentGithubPrProse,
	isRestackNeededProse,
} from "./cli-prose-heuristics.ts";
import { buildStackUpdateArgs, buildSubmitArgs } from "./submit-command-spec.ts";
import {
	detectKnownPreflightFailureCause,
	detectSubmitSemanticFailureCause,
	isUsableOutput,
	joinOutput,
	parseAheadBehindCounts,
	parseConflictedFiles,
	parsePorcelainConflictedFiles,
	uniqueNonEmpty,
} from "./submit-detect.ts";
import { extractPrLinks } from "./gt-output.ts";
import type {
	RemoteSyncDiagnostics,
	SubmitPreflightFailureCause,
} from "./submit-failure-catalog.ts";
import type {
	CurrentPrVerificationResult,
	SubmitCommandOutput,
	SubmitCommandParams,
	SubmitGateway,
	SubmitOutputListener,
	SubmitPreflightResult,
	SubmitRestackResult,
	SubmitRunResult,
} from "./submit-contracts.ts";

const RESTACK_ARGS = ["restack", "--downstack", "--no-interactive"] as const;
const CURRENT_PR_ARGS = ["pr", "view", "--json", "number,url"] as const;
const GIT_UNMERGED_ARGS = ["diff", "--name-only", "--diff-filter=U"] as const;
const GIT_STATUS_PORCELAIN_ARGS = ["status", "--porcelain"] as const;
const GIT_UPSTREAM_ARGS = [
	"rev-parse",
	"--abbrev-ref",
	"--symbolic-full-name",
	"@{upstream}",
] as const;
const SUBMIT_TIMEOUT_MS = 600_000;
const RESTACK_TIMEOUT_MS = 600_000;
const CURRENT_PR_TIMEOUT_MS = 60_000;
const GIT_CHECK_TIMEOUT_MS = 30_000;

const currentGithubPrSchema = z.object({
	number: z.number().int().positive(),
	url: z.url(),
});

interface RunGtOptions {
	args: readonly string[];
	cwd: string;
	timeoutMs: number;
	onOutput?: SubmitOutputListener;
}

export class RealSubmitGateway implements SubmitGateway {
	private readonly runner: CommandRunner;

	constructor(runner: CommandRunner = runCommand) {
		this.runner = runner;
	}

	async checkSubmitReadiness(params: SubmitCommandParams): Promise<SubmitPreflightResult> {
		const output = await this.runGt({
			args: buildSubmitArgs({ isDryRun: true, shouldForce: params.force === true }),
			cwd: params.cwd,
			timeoutMs: CURRENT_PR_TIMEOUT_MS,
			...optionalOutputListenerParam(params.onOutput),
		});
		const joinedOutput = joinOutput(output);
		const knownFailureCause = await this.resolveKnownPreflightFailureCause(
			params.cwd,
			output,
			joinedOutput,
		);
		if (knownFailureCause !== undefined) {
			return { kind: "failed", output, cause: knownFailureCause };
		}
		if (isSuccessfulOutput(output)) {
			return { kind: "ready", output };
		}
		if (isUsableOutput(output) && isRestackNeededProse(joinedOutput)) {
			return { kind: "restack_required", output };
		}
		return { kind: "failed", output };
	}

	async restackCurrentStack(params: SubmitCommandParams): Promise<SubmitRestackResult> {
		const output = await this.runGt({
			args: RESTACK_ARGS,
			cwd: params.cwd,
			timeoutMs: RESTACK_TIMEOUT_MS,
			...optionalOutputListenerParam(params.onOutput),
		});
		if (isSuccessfulOutput(output)) {
			return { kind: "success", output };
		}

		const conflictedFiles = await this.getConflictedFiles(params.cwd);
		if (isGitConflictWithConflictedFilesProse(joinOutput(output), conflictedFiles)) {
			return { kind: "conflict", output, conflictedFiles };
		}

		return { kind: "failed", output };
	}

	async submitCurrentStack(params: SubmitCommandParams): Promise<SubmitRunResult> {
		return await this.runSubmitLikeCommand(
			buildSubmitArgs({ isDryRun: false, shouldForce: params.force === true }),
			params,
		);
	}

	async updateStackPrs(params: SubmitCommandParams): Promise<SubmitRunResult> {
		return await this.runSubmitLikeCommand(
			buildStackUpdateArgs({ shouldForce: params.force === true }),
			params,
		);
	}

	async verifyCurrentPr(params: SubmitCommandParams): Promise<CurrentPrVerificationResult> {
		const output = await this.runGh({
			args: CURRENT_PR_ARGS,
			cwd: params.cwd,
			timeoutMs: CURRENT_PR_TIMEOUT_MS,
			...optionalOutputListenerParam(params.onOutput),
		});
		if (output.type === "spawn-failed") {
			return { kind: "failed", output, cause: "startup_error" };
		}
		if (output.type === "timed-out") {
			return { kind: "failed", output, cause: "timeout" };
		}
		if (output.type !== "exited" || output.signal !== null || output.code !== 0) {
			if (
				output.type === "exited" &&
				output.signal === null &&
				output.code === 1 &&
				isNoCurrentGithubPrProse(joinOutput(output))
			) {
				return { kind: "no_current_pr", output, cause: "no_current_pr" };
			}
			return { kind: "failed", output, cause: "command_failed" };
		}

		const parsed = currentGithubPrSchema.safeParse(parseExternalJson(output.stdout));
		if (!parsed.success) return { kind: "failed", output, cause: "malformed_output" };
		return {
			kind: "present",
			output,
			prLinks: [{ label: `#${parsed.data.number}`, url: parsed.data.url }],
		};
	}

	private async runSubmitLikeCommand(
		args: string[],
		params: SubmitCommandParams,
	): Promise<SubmitRunResult> {
		const output = await this.runGt({
			args,
			cwd: params.cwd,
			timeoutMs: SUBMIT_TIMEOUT_MS,
			...optionalOutputListenerParam(params.onOutput),
		});
		if (!isSuccessfulOutput(output)) {
			const joinedOutput = joinOutput(output);
			const knownFailureCause = await this.resolveKnownPreflightFailureCause(
				params.cwd,
				output,
				joinedOutput,
			);
			if (knownFailureCause !== undefined) {
				return { kind: "failed", output, cause: knownFailureCause };
			}
			return { kind: "failed", output };
		}

		const semanticFailureCause = detectSubmitSemanticFailureCause(joinOutput(output));
		const result: SubmitRunResult = {
			kind: "success",
			output,
			prLinks: extractPrLinks(joinOutput(output)),
		};
		if (semanticFailureCause !== undefined) {
			result.semanticFailureCause = semanticFailureCause;
		}
		return result;
	}

	private async getConflictedFiles(cwd: string): Promise<string[]> {
		const unmerged = await this.runGit([...GIT_UNMERGED_ARGS], cwd, GIT_CHECK_TIMEOUT_MS);
		const status = await this.runGit([...GIT_STATUS_PORCELAIN_ARGS], cwd, GIT_CHECK_TIMEOUT_MS);

		return uniqueNonEmpty([
			...parseConflictedFiles(unmerged.stdout),
			...parsePorcelainConflictedFiles(status.stdout),
		]);
	}

	private async resolveKnownPreflightFailureCause(
		cwd: string,
		output: SubmitCommandOutput,
		joinedOutput: string,
	): Promise<SubmitPreflightFailureCause | undefined> {
		const cause = detectKnownPreflightFailureCause(output, joinedOutput);
		if (cause?.kind !== "remote_updated_outside_graphite") return cause;

		const remoteSync = await this.getRemoteSyncDiagnostics(cwd);
		return {
			...cause,
			...optionalEntry("remoteSync", remoteSync),
		};
	}

	private async getRemoteSyncDiagnostics(cwd: string): Promise<RemoteSyncDiagnostics | undefined> {
		const upstreamOutput = await this.runGit([...GIT_UPSTREAM_ARGS], cwd, GIT_CHECK_TIMEOUT_MS);
		if (!isSuccessfulOutput(upstreamOutput)) return undefined;

		const upstream = firstNonEmptyLine(upstreamOutput.stdout);
		if (upstream === undefined) return undefined;

		const divergence = await this.runGit(
			["rev-list", "--left-right", "--count", `HEAD...${upstream}`],
			cwd,
			GIT_CHECK_TIMEOUT_MS,
		);
		const counts = isSuccessfulOutput(divergence)
			? parseAheadBehindCounts(divergence.stdout)
			: undefined;
		const remoteOnlyCommits =
			counts === undefined || counts.behindCount === 0
				? []
				: await this.getRemoteOnlyCommitSummaries(cwd, upstream);

		return {
			upstream,
			...(counts === undefined
				? {}
				: { aheadCount: counts.aheadCount, behindCount: counts.behindCount }),
			...optionalEntry(
				"remoteOnlyCommits",
				remoteOnlyCommits.length === 0 ? undefined : remoteOnlyCommits,
			),
		};
	}

	private async getRemoteOnlyCommitSummaries(cwd: string, upstream: string): Promise<string[]> {
		const output = await this.runGit(
			["log", "--format=%h %s", "--max-count=3", upstream, "--not", "HEAD"],
			cwd,
			GIT_CHECK_TIMEOUT_MS,
		);
		if (!isSuccessfulOutput(output)) return [];
		return uniqueNonEmpty(stripTerminalEscapes(output.stdout).replace(/\r/g, "\n").split("\n"));
	}

	private async runGt(options: RunGtOptions): Promise<SubmitCommandOutput> {
		const { args, cwd, timeoutMs, onOutput } = options;
		return toSubmitCommandOutput(
			await runGraphiteCommand(this.runner, {
				cwd,
				args,
				timeoutMs,
				...outputListenerToExecCallbacks(onOutput),
			}),
		);
	}

	private async runGh(options: RunGtOptions): Promise<SubmitCommandOutput> {
		const { args, cwd, timeoutMs, onOutput } = options;
		const output = toSubmitCommandOutput(
			await runGitHubCliAsExecResult({ runner: this.runner, args, cwd, timeoutMs }),
		);
		if (onOutput !== undefined) {
			if (output.stdout !== "") onOutput("stdout", output.stdout);
			if (output.stderr !== "") onOutput("stderr", output.stderr);
		}
		return output;
	}

	private async runGit(
		args: string[],
		cwd: string,
		timeoutMs: number,
	): Promise<SubmitCommandOutput> {
		return toSubmitCommandOutput(await this.runner("git", args, { cwd, timeout: timeoutMs }));
	}
}

function optionalOutputListenerParam(
	onOutput: SubmitOutputListener | undefined,
): Pick<SubmitCommandParams, "onOutput"> {
	return onOutput === undefined ? {} : { onOutput };
}

function toSubmitCommandOutput(result: ExecResult): SubmitCommandOutput {
	return result;
}

function isSuccessfulOutput(output: SubmitCommandOutput): boolean {
	return output.type === "exited" && output.signal === null && output.code === 0;
}

function parseExternalJson(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return undefined;
	}
}
