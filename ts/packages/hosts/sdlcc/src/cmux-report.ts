import { z } from "zod";

import { runRealCommand, type CommandRunner } from "./command-runner.ts";

const COMMAND_TIMEOUT_MS = 10_000;
const DEFAULT_RESTORE_SHELL = "/bin/zsh";

export const SDLCC_CMUX_REPORT_KIND = "sdlcc-branch";
export const SDLCC_CMUX_REPORT_SOURCE = "sdlcc";

export const sdlccCmuxReportResultSchema = z.strictObject({
	branch: z.string(),
	worktree_path: z.string(),
	workspace_id: z.string(),
	surface_id: z.string(),
	kind: z.literal(SDLCC_CMUX_REPORT_KIND),
	source: z.literal(SDLCC_CMUX_REPORT_SOURCE),
	shell: z.string(),
});

export const sdlccCmuxReportFailureDataSchema = z.strictObject({
	code: z.string(),
	command_failure: z
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
	readonly PWD?: string | undefined;
	readonly SHELL?: string | undefined;
	readonly CMUX_WORKSPACE_ID?: string | undefined;
	readonly CMUX_SURFACE_ID?: string | undefined;
}

export interface SdlccCmuxReportMetadata {
	readonly branch: string;
	readonly worktreePath: string;
	readonly workspaceId: string;
	readonly surfaceId: string;
	readonly shell: string;
}

export type SdlccCmuxReportFailureCode =
	| "cmux_resume_set_failed"
	| "detached_head"
	| "empty_worktree_root"
	| "git_branch_failed"
	| "missing_surface_id"
	| "missing_workspace_id"
	| "not_git_worktree";

export interface SdlccCmuxReportCommandFailure {
	readonly command: string;
	readonly args: readonly string[];
	readonly exitCode: number;
	readonly stdout: string;
	readonly stderr: string;
}

export interface SdlccCmuxReportFailureData {
	readonly code: SdlccCmuxReportFailureCode;
	readonly command_failure: SdlccCmuxReportCommandFailure | null;
}

export type SdlccCmuxReportResult =
	| { readonly type: "reported"; readonly metadata: SdlccCmuxReportMetadata }
	| {
			readonly type: "failed";
			readonly code: SdlccCmuxReportFailureCode;
			readonly message: string;
			readonly commandFailure?: SdlccCmuxReportCommandFailure | undefined;
	  };

export interface RunSdlccCmuxReportOptions {
	readonly cwd?: string | undefined;
	readonly env?: CmuxReportEnvironment | undefined;
	readonly runCommand?: CommandRunner | undefined;
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
			code: "missing_workspace_id",
			message: "sdlcc cmux report must run inside a cmux surface; CMUX_WORKSPACE_ID is not set.",
		};
	const surfaceId = nonEmptyString(env.CMUX_SURFACE_ID);
	if (surfaceId === undefined)
		return {
			type: "failed",
			code: "missing_surface_id",
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
			code: "not_git_worktree",
			message: `sdlcc cmux report must run inside a git worktree: ${commandFailureMessage("git rev-parse --show-toplevel", worktreeResult)}`,
			commandFailure: commandFailure("git", worktreeArgs, worktreeResult),
		};
	}
	const worktreePath = nonEmptyString(worktreeResult.stdout);
	if (worktreePath === undefined)
		return {
			type: "failed",
			code: "empty_worktree_root",
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
			code: "git_branch_failed",
			message: `sdlcc cmux report could not resolve the current git branch: ${commandFailureMessage("git branch --show-current", branchResult)}`,
			commandFailure: commandFailure("git", branchArgs, branchResult),
		};
	}
	const branch = nonEmptyString(branchResult.stdout);
	if (branch === undefined)
		return {
			type: "failed",
			code: "detached_head",
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
			code: "cmux_resume_set_failed",
			message: `cmux surface resume set failed: ${commandFailureMessage("cmux surface resume set", cmuxResult)}`,
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
		worktree_path: metadata.worktreePath,
		workspace_id: metadata.workspaceId,
		surface_id: metadata.surfaceId,
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
		command_failure: result.commandFailure ?? null,
	};
}

export function isSdlccCmuxReportUsageFailure(code: SdlccCmuxReportFailureCode): boolean {
	return (
		code === "missing_workspace_id" ||
		code === "missing_surface_id" ||
		code === "not_git_worktree" ||
		code === "empty_worktree_root" ||
		code === "detached_head"
	);
}

export function formatSdlccCmuxReportHuman(
	data: z.infer<typeof sdlccCmuxReportResultSchema>,
): string {
	return `Reported cmux surface identity: ${data.branch} @ ${data.worktree_path}`;
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

function commandFailureMessage(
	commandName: string,
	result: { readonly code: number; readonly stdout: string; readonly stderr: string },
): string {
	return `${commandName} exited ${result.code}. stdout: ${result.stdout.trim() || "(empty)"} stderr: ${result.stderr.trim() || "(empty)"}`;
}

function nonEmptyString(value: string | undefined): string | undefined {
	const trimmed = value?.trim();
	return trimmed === undefined || trimmed.length === 0 ? undefined : trimmed;
}
