import { runCommand } from "@ns/core/exec";
import {
	type CommandRunner,
	outputListenerToExecCallbacks,
	type ExecResult,
} from "@ns/core/command";
import { optionalEntry } from "@ns/core/primitives";
import { stripTerminalEscapes } from "@ns/core/terminal-escapes";
import { firstNonEmptyLine } from "@ns/core/text-normalization";
import { runGraphiteCommand } from "@ns/capability-kit/graphite/branch";

import { detectGitConflictOutput } from "./git-operation-output.ts";
import { buildSubmitArgs } from "./submit-command-spec.ts";
import {
	detectKnownPreflightFailureCause,
	detectRestackNeeded,
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
} from "./submit.ts";

const RESTACK_ARGS = ["restack", "--downstack", "--no-interactive"] as const;
const CURRENT_PR_ARGS = ["branch", "info", "--no-interactive"] as const;
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
		if (isUsableOutput(output) && detectRestackNeeded(joinedOutput)) {
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
		if (detectGitConflictOutput(joinOutput(output), conflictedFiles)) {
			return { kind: "conflict", output, conflictedFiles };
		}

		return { kind: "failed", output };
	}

	async submitCurrentStack(params: SubmitCommandParams): Promise<SubmitRunResult> {
		const output = await this.runGt({
			args: buildSubmitArgs({ isDryRun: false, shouldForce: params.force === true }),
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

	async verifyCurrentPr(params: SubmitCommandParams): Promise<CurrentPrVerificationResult> {
		const output = await this.runGt({
			args: CURRENT_PR_ARGS,
			cwd: params.cwd,
			timeoutMs: CURRENT_PR_TIMEOUT_MS,
			...optionalOutputListenerParam(params.onOutput),
		});
		if (output.startupError !== undefined) {
			return { kind: "failed", output, cause: "startup_error" };
		}
		if (output.killed === true) {
			return { kind: "failed", output, cause: "timeout" };
		}
		if (output.exitCode !== 0) {
			if (/No PR found/i.test(stripTerminalEscapes(joinOutput(output)))) {
				return { kind: "no_current_pr", output, cause: "no_current_pr" };
			}
			return { kind: "failed", output, cause: "command_failed" };
		}

		const prLinks = extractPrLinks(joinOutput(output));
		if (prLinks.length === 0) {
			return { kind: "no_current_pr", output, cause: "no_current_pr" };
		}

		return { kind: "present", output, prLinks };
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
	return {
		stdout: result.stdout,
		stderr: result.stderr,
		exitCode: result.code,
		...(result.startupError === undefined ? {} : { startupError: result.startupError }),
		...(result.killed ? { killed: true } : {}),
	};
}

function isSuccessfulOutput(output: SubmitCommandOutput): boolean {
	return output.exitCode === 0 && !output.killed && output.startupError === undefined;
}
