import { z } from "zod";

import { formatCommandFailure, runRealCommand, type CommandRunner } from "./command-runner.ts";
import type { ExplicitUndefined } from "@sdl/core/primitives";

const COMMAND_TIMEOUT_MS = 10_000;
const DEFAULT_RESTORE_SHELL = "/bin/zsh";

export const SDLCC_CMUX_REPORT_KIND = "sdlcc-branch";
export const SDLCC_CMUX_REPORT_SOURCE = "sdlcc";

export const sdlccCmuxReportResultSchema = z.strictObject({
	branch: z.string(),
	worktreePath: z.string(),
	workspaceId: z.string(),
	surfaceId: z.string(),
	kind: z.literal(SDLCC_CMUX_REPORT_KIND),
	source: z.literal(SDLCC_CMUX_REPORT_SOURCE),
	shell: z.string(),
});

export const sdlccCmuxReportFailureDataSchema = z.strictObject({
	code: z.string(),
	commandFailure: z
		.strictObject({
			command: z.string(),
			args: z.array(z.string()),
			exitCode: z.number().int(),
			stdout: z.string(),
			stderr: z.string(),
		})
		.nullable(),
});

export interface CmuxReportEnvironment {
	readonly PWD?: ExplicitUndefined<"env-map", string>;
	readonly SHELL?: ExplicitUndefined<"env-map", string>;
	readonly CMUX_WORKSPACE_ID?: ExplicitUndefined<"env-map", string>;
	readonly CMUX_SURFACE_ID?: ExplicitUndefined<"env-map", string>;
}

export interface SdlccCmuxReportMetadata {
	readonly branch: string;
	readonly worktreePath: string;
	readonly workspaceId: string;
	readonly surfaceId: string;
	readonly shell: string;
}

export type SdlccCmuxReportFailureCode =
	| "cmux-resume-set-failed"
	| "detached-head"
	| "empty-worktree-root"
	| "git-branch-failed"
	| "missing-surface-id"
	| "missing-workspace-id"
	| "not-git-worktree";

export interface SdlccCmuxReportCommandFailure {
	readonly command: string;
	readonly args: readonly string[];
	readonly exitCode: number;
	readonly stdout: string;
	readonly stderr: string;
}

export interface SdlccCmuxReportFailureData {
	readonly code: SdlccCmuxReportFailureCode;
	readonly commandFailure: SdlccCmuxReportCommandFailure | null;
}

export type SdlccCmuxReportResult =
	| { readonly type: "reported"; readonly metadata: SdlccCmuxReportMetadata }
	| {
			readonly type: "failed";
			readonly code: SdlccCmuxReportFailureCode;
			readonly message: string;
			readonly commandFailure?: SdlccCmuxReportCommandFailure;
	  };

export interface RunSdlccCmuxReportOptions {
	readonly cwd?: string;
	readonly env?: ExplicitUndefined<"env-map", CmuxReportEnvironment>;
	readonly runCommand?: CommandRunner;
}

export async function runSdlccCmuxReport(
	options: RunSdlccCmuxReportOptions = {},
): Promise<SdlccCmuxReportResult> {
	const cwd = options.cwd ?? process.cwd();
	const env = options.env ?? process.env;
	const runCommand = options.runCommand ?? runRealCommand;

	const workspaceId = nonEmptyString(env.CMUX_WORKSPACE_ID);
	if (workspaceId === undefined)
		return {
			type: "failed",
			code: "missing-workspace-id",
			message: "sdlcc cmux report must run inside a cmux surface; CMUX_WORKSPACE_ID is not set.",
		};
	const surfaceId = nonEmptyString(env.CMUX_SURFACE_ID);
	if (surfaceId === undefined)
		return {
			type: "failed",
			code: "missing-surface-id",
			message: "sdlcc cmux report must run inside a cmux surface; CMUX_SURFACE_ID is not set.",
		};

	const worktreeArgs = ["rev-parse", "--show-toplevel"];
	const worktreeResult = await runCommand("git", worktreeArgs, {
		cwd,
		timeout: COMMAND_TIMEOUT_MS,
	});
	if (worktreeResult.code !== 0) {
		return {
			type: "failed",
			code: "not-git-worktree",
			message: `sdlcc cmux report must run inside a git worktree: ${formatCommandFailure("git rev-parse --show-toplevel", worktreeResult, { verb: "exited" })}`,
			commandFailure: commandFailure("git", worktreeArgs, worktreeResult),
		};
	}
	const worktreePath = nonEmptyString(worktreeResult.stdout);
	if (worktreePath === undefined)
		return {
			type: "failed",
			code: "empty-worktree-root",
			message:
				"sdlcc cmux report must run inside a git worktree; git returned an empty worktree root.",
		};

	const branchArgs = ["branch", "--show-current"];
	const branchResult = await runCommand("git", branchArgs, {
		cwd,
		timeout: COMMAND_TIMEOUT_MS,
	});
	if (branchResult.code !== 0) {
		return {
			type: "failed",
			code: "git-branch-failed",
			message: `sdlcc cmux report could not resolve the current git branch: ${formatCommandFailure("git branch --show-current", branchResult, { verb: "exited" })}`,
			commandFailure: commandFailure("git", branchArgs, branchResult),
		};
	}
	const branch = nonEmptyString(branchResult.stdout);
	if (branch === undefined)
		return {
			type: "failed",
			code: "detached-head",
			message: "sdlcc cmux report requires a named git branch; detached HEAD is not supported.",
		};

	const shell = nonEmptyString(env.SHELL) ?? DEFAULT_RESTORE_SHELL;
	const metadata: SdlccCmuxReportMetadata = { branch, worktreePath, workspaceId, surfaceId, shell };
	const cmuxArgs = buildCmuxSurfaceResumeSetArgs(metadata);
	const cmuxResult = await runCommand("cmux", cmuxArgs, {
		cwd: worktreePath,
		timeout: COMMAND_TIMEOUT_MS,
	});
	if (cmuxResult.code !== 0) {
		return {
			type: "failed",
			code: "cmux-resume-set-failed",
			message: `cmux surface resume set failed: ${formatCommandFailure("cmux surface resume set", cmuxResult, { verb: "exited" })}`,
			commandFailure: commandFailure("cmux", cmuxArgs, cmuxResult),
		};
	}

	return { type: "reported", metadata };
}

export function buildCmuxSurfaceResumeSetArgs(
	metadata: SdlccCmuxReportMetadata,
): readonly string[] {
	return [
		"surface",
		"resume",
		"set",
		"--workspace",
		metadata.workspaceId,
		"--surface",
		metadata.surfaceId,
		"--cwd",
		metadata.worktreePath,
		"--name",
		metadata.branch,
		"--kind",
		SDLCC_CMUX_REPORT_KIND,
		"--source",
		SDLCC_CMUX_REPORT_SOURCE,
		"--shell",
		metadata.shell,
	];
}

export function sdlccCmuxReportData(
	metadata: SdlccCmuxReportMetadata,
): z.infer<typeof sdlccCmuxReportResultSchema> {
	return {
		branch: metadata.branch,
		worktreePath: metadata.worktreePath,
		workspaceId: metadata.workspaceId,
		surfaceId: metadata.surfaceId,
		kind: SDLCC_CMUX_REPORT_KIND,
		source: SDLCC_CMUX_REPORT_SOURCE,
		shell: metadata.shell,
	};
}

export function sdlccCmuxReportFailureData(
	result: Extract<SdlccCmuxReportResult, { type: "failed" }>,
): SdlccCmuxReportFailureData {
	return {
		code: result.code,
		commandFailure: result.commandFailure ?? null,
	};
}

export function isSdlccCmuxReportUsageFailure(code: SdlccCmuxReportFailureCode): boolean {
	return (
		code === "missing-workspace-id" ||
		code === "missing-surface-id" ||
		code === "not-git-worktree" ||
		code === "empty-worktree-root" ||
		code === "detached-head"
	);
}

export function formatSdlccCmuxReportHuman(
	data: z.infer<typeof sdlccCmuxReportResultSchema>,
): string {
	return `Reported cmux surface identity: ${data.branch} @ ${data.worktreePath}`;
}

function commandFailure(
	command: string,
	args: readonly string[],
	result: { readonly code: number; readonly stdout: string; readonly stderr: string },
): SdlccCmuxReportCommandFailure {
	return {
		command,
		args: [...args],
		exitCode: result.code,
		stdout: result.stdout,
		stderr: result.stderr,
	};
}

function nonEmptyString(value: string | undefined): string | undefined {
	const trimmed = value?.trim();
	return trimmed === undefined || trimmed.length === 0 ? undefined : trimmed;
}
