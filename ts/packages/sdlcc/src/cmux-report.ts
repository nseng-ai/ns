import { runRealCommand, type CommandRunner } from "./command-runner.ts";

const COMMAND_TIMEOUT_MS = 10_000;
const DEFAULT_RESTORE_SHELL = "/bin/zsh";

export const SDLCC_CMUX_REPORT_KIND = "sdlcc-branch";
export const SDLCC_CMUX_REPORT_SOURCE = "sdlcc";

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

export type SdlccCmuxReportResult =
	| { readonly type: "reported"; readonly metadata: SdlccCmuxReportMetadata }
	| { readonly type: "failed"; readonly message: string };

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
			message: "sdlcc cmux report must run inside a cmux surface; CMUX_WORKSPACE_ID is not set.",
		};
	const surfaceId = nonEmptyString(env.CMUX_SURFACE_ID);
	if (surfaceId === undefined)
		return {
			type: "failed",
			message: "sdlcc cmux report must run inside a cmux surface; CMUX_SURFACE_ID is not set.",
		};

	const worktreeResult = await runCommand("git", ["rev-parse", "--show-toplevel"], {
		cwd,
		timeout: COMMAND_TIMEOUT_MS,
	});
	if (worktreeResult.code !== 0) {
		return {
			type: "failed",
			message: `sdlcc cmux report must run inside a git worktree: ${commandFailureMessage("git rev-parse --show-toplevel", worktreeResult)}`,
		};
	}
	const worktreePath = nonEmptyString(worktreeResult.stdout);
	if (worktreePath === undefined)
		return {
			type: "failed",
			message:
				"sdlcc cmux report must run inside a git worktree; git returned an empty worktree root.",
		};

	const branchResult = await runCommand("git", ["branch", "--show-current"], {
		cwd,
		timeout: COMMAND_TIMEOUT_MS,
	});
	if (branchResult.code !== 0) {
		return {
			type: "failed",
			message: `sdlcc cmux report could not resolve the current git branch: ${commandFailureMessage("git branch --show-current", branchResult)}`,
		};
	}
	const branch = nonEmptyString(branchResult.stdout);
	if (branch === undefined)
		return {
			type: "failed",
			message: "sdlcc cmux report requires a named git branch; detached HEAD is not supported.",
		};

	const shell = nonEmptyString(env.SHELL) ?? DEFAULT_RESTORE_SHELL;
	const metadata: SdlccCmuxReportMetadata = { branch, worktreePath, workspaceId, surfaceId, shell };
	const cmuxResult = await runCommand("cmux", buildCmuxSurfaceResumeSetArgs(metadata), {
		cwd: worktreePath,
		timeout: COMMAND_TIMEOUT_MS,
	});
	if (cmuxResult.code !== 0) {
		return {
			type: "failed",
			message: `cmux surface resume set failed: ${commandFailureMessage("cmux surface resume set", cmuxResult)}`,
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

export function formatSdlccCmuxReportHuman(result: SdlccCmuxReportResult): string {
	if (result.type === "failed") return `${result.message}\n`;
	return `Reported cmux surface identity: ${result.metadata.branch} @ ${result.metadata.worktreePath}\n`;
}

export function formatSdlccCmuxReportJson(result: SdlccCmuxReportResult): string {
	if (result.type === "failed") return `${JSON.stringify({ ok: false, error: result.message })}\n`;
	return `${JSON.stringify({
		ok: true,
		branch: result.metadata.branch,
		worktree_path: result.metadata.worktreePath,
		workspace_id: result.metadata.workspaceId,
		surface_id: result.metadata.surfaceId,
		kind: SDLCC_CMUX_REPORT_KIND,
		source: SDLCC_CMUX_REPORT_SOURCE,
	})}\n`;
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
