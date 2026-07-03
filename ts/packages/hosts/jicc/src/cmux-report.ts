import { z } from "zod";

import {
	formatInlineCommandFailure,
	runRealCommand,
	type CommandRunner,
} from "./command-runner.ts";
import type { ExplicitUndefined } from "@ji/core/primitives";

const COMMAND_TIMEOUT_MS = 10_000;
const DEFAULT_RESTORE_SHELL = "/bin/zsh";

export const JICC_CMUX_REPORT_KIND = "jicc-branch";
export const JICC_CMUX_REPORT_SOURCE = "jicc";

export const jiccCmuxReportResultSchema = z.strictObject({
	branch: z.string(),
	worktreePath: z.string(),
	workspaceId: z.string(),
	surfaceId: z.string(),
	kind: z.literal(JICC_CMUX_REPORT_KIND),
	source: z.literal(JICC_CMUX_REPORT_SOURCE),
	shell: z.string(),
});

export const jiccCmuxReportFailureDataSchema = z.strictObject({
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

export interface JiccCmuxReportMetadata {
	readonly branch: string;
	readonly worktreePath: string;
	readonly workspaceId: string;
	readonly surfaceId: string;
	readonly shell: string;
}

export type JiccCmuxReportFailureCode =
	| "cmux-resume-set-failed"
	| "detached-head"
	| "empty-worktree-root"
	| "git-branch-failed"
	| "missing-surface-id"
	| "missing-workspace-id"
	| "not-git-worktree";

export interface JiccCmuxReportCommandFailure {
	readonly command: string;
	readonly args: readonly string[];
	readonly exitCode: number;
	readonly stdout: string;
	readonly stderr: string;
}

export interface JiccCmuxReportFailureData {
	readonly code: JiccCmuxReportFailureCode;
	readonly commandFailure: JiccCmuxReportCommandFailure | null;
}

export type JiccCmuxReportResult =
	| { readonly type: "reported"; readonly metadata: JiccCmuxReportMetadata }
	| {
			readonly type: "failed";
			readonly code: JiccCmuxReportFailureCode;
			readonly message: string;
			readonly commandFailure?: JiccCmuxReportCommandFailure;
	  };

export interface RunJiccCmuxReportOptions {
	readonly cwd?: string;
	readonly env?: ExplicitUndefined<"env-map", CmuxReportEnvironment>;
	readonly runCommand?: CommandRunner;
}

export async function runJiccCmuxReport(
	options: RunJiccCmuxReportOptions = {},
): Promise<JiccCmuxReportResult> {
	const cwd = options.cwd ?? process.cwd();
	const env = options.env ?? process.env;
	const runCommand = options.runCommand ?? runRealCommand;

	const workspaceId = nonEmptyString(env.CMUX_WORKSPACE_ID);
	if (workspaceId === undefined)
		return {
			type: "failed",
			code: "missing-workspace-id",
			message: "jicc cmux report must run inside a cmux surface; CMUX_WORKSPACE_ID is not set.",
		};
	const surfaceId = nonEmptyString(env.CMUX_SURFACE_ID);
	if (surfaceId === undefined)
		return {
			type: "failed",
			code: "missing-surface-id",
			message: "jicc cmux report must run inside a cmux surface; CMUX_SURFACE_ID is not set.",
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
			message: `jicc cmux report must run inside a git worktree: ${formatInlineCommandFailure("git rev-parse --show-toplevel", worktreeResult)}`,
			commandFailure: commandFailure("git", worktreeArgs, worktreeResult),
		};
	}
	const worktreePath = nonEmptyString(worktreeResult.stdout);
	if (worktreePath === undefined)
		return {
			type: "failed",
			code: "empty-worktree-root",
			message:
				"jicc cmux report must run inside a git worktree; git returned an empty worktree root.",
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
			message: `jicc cmux report could not resolve the current git branch: ${formatInlineCommandFailure("git branch --show-current", branchResult)}`,
			commandFailure: commandFailure("git", branchArgs, branchResult),
		};
	}
	const branch = nonEmptyString(branchResult.stdout);
	if (branch === undefined)
		return {
			type: "failed",
			code: "detached-head",
			message: "jicc cmux report requires a named git branch; detached HEAD is not supported.",
		};

	const shell = nonEmptyString(env.SHELL) ?? DEFAULT_RESTORE_SHELL;
	const metadata: JiccCmuxReportMetadata = { branch, worktreePath, workspaceId, surfaceId, shell };
	const cmuxArgs = buildCmuxSurfaceResumeSetArgs(metadata);
	const cmuxResult = await runCommand("cmux", cmuxArgs, {
		cwd: worktreePath,
		timeout: COMMAND_TIMEOUT_MS,
	});
	if (cmuxResult.code !== 0) {
		return {
			type: "failed",
			code: "cmux-resume-set-failed",
			message: `cmux surface resume set failed: ${formatInlineCommandFailure("cmux surface resume set", cmuxResult)}`,
			commandFailure: commandFailure("cmux", cmuxArgs, cmuxResult),
		};
	}

	return { type: "reported", metadata };
}

export function buildCmuxSurfaceResumeSetArgs(metadata: JiccCmuxReportMetadata): readonly string[] {
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
		JICC_CMUX_REPORT_KIND,
		"--source",
		JICC_CMUX_REPORT_SOURCE,
		"--shell",
		metadata.shell,
	];
}

export function jiccCmuxReportData(
	metadata: JiccCmuxReportMetadata,
): z.infer<typeof jiccCmuxReportResultSchema> {
	return {
		branch: metadata.branch,
		worktreePath: metadata.worktreePath,
		workspaceId: metadata.workspaceId,
		surfaceId: metadata.surfaceId,
		kind: JICC_CMUX_REPORT_KIND,
		source: JICC_CMUX_REPORT_SOURCE,
		shell: metadata.shell,
	};
}

export function jiccCmuxReportFailureData(
	result: Extract<JiccCmuxReportResult, { type: "failed" }>,
): JiccCmuxReportFailureData {
	return {
		code: result.code,
		commandFailure: result.commandFailure ?? null,
	};
}

export function isJiccCmuxReportUsageFailure(code: JiccCmuxReportFailureCode): boolean {
	return (
		code === "missing-workspace-id" ||
		code === "missing-surface-id" ||
		code === "not-git-worktree" ||
		code === "empty-worktree-root" ||
		code === "detached-head"
	);
}

export function formatJiccCmuxReportHuman(
	data: z.infer<typeof jiccCmuxReportResultSchema>,
): string {
	return `Reported cmux surface identity: ${data.branch} @ ${data.worktreePath}`;
}

function commandFailure(
	command: string,
	args: readonly string[],
	result: { readonly code: number; readonly stdout: string; readonly stderr: string },
): JiccCmuxReportCommandFailure {
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
