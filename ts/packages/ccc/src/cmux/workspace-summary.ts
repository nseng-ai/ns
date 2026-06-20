import { z } from "zod";

import { shellNegative, ok, type ClinkrExit } from "@asdl/clinkr";
import { isSuccessfulExecResult, type CommandExecApi, type ExecResult } from "@asdl/core/exec";
import { formatErrorMessage } from "@asdl/core/primitives";

export const DEFAULT_CMUX_WORKSPACE_SUMMARY_STATUS_KEY = "pi-summary";
export const CMUX_WORKSPACE_SUMMARY_COMMAND_TIMEOUT_MS = 30_000;
const STARTUP_ERROR_EXIT_CODE = 127;

export const cmuxWorkspaceSummaryRequestSchema = z.strictObject({
	workspace: z
		.string()
		.optional()
		.describe("Caller cmux workspace id/ref. Defaults to CMUX_WORKSPACE_ID, then CMUX_TAB_ID."),
	title: z.string().describe("Workspace title."),
	description: z.string().optional().describe("Workspace description."),
	statusKey: z
		.string()
		.default(DEFAULT_CMUX_WORKSPACE_SUMMARY_STATUS_KEY)
		.describe("cmux status key to clear."),
});

const cmuxCommandFailureSchema = z.strictObject({
	command: z.array(z.string()),
	exit_code: z.number().int(),
	stdout: z.string(),
	stderr: z.string(),
});

const cmuxWorkspaceSummaryErrorSchema = z.strictObject({
	code: z.string(),
	message: z.string(),
	command_failure: cmuxCommandFailureSchema.nullable(),
});

export const cmuxWorkspaceSummaryResultSchema = z.strictObject({
	success: z.boolean(),
	workspace: z.string().nullable(),
	title: z.string(),
	description: z.string().nullable(),
	status_key: z.string(),
	error: cmuxWorkspaceSummaryErrorSchema.nullable(),
});

export type CmuxWorkspaceSummaryRequest = z.infer<typeof cmuxWorkspaceSummaryRequestSchema>;
export type CmuxWorkspaceSummaryResult = z.infer<typeof cmuxWorkspaceSummaryResultSchema>;

type CmuxWorkspaceSummaryFailureCode =
	| "missing_workspace"
	| "missing_description"
	| "rename_workspace_failed"
	| "set_description_failed"
	| "clear_status_failed";

interface CmuxWorkspaceSummaryFailure {
	code: CmuxWorkspaceSummaryFailureCode;
	message: string;
	commandFailure?: CmuxCommandFailure;
}

interface CmuxCommandFailure {
	command: string[];
	exitCode: number;
	stdout: string;
	stderr: string;
}

export interface ApplyCmuxWorkspaceSummaryOptions {
	request: CmuxWorkspaceSummaryRequest;
	commands: CommandExecApi;
	cwd: string;
	env: Record<string, string | undefined>;
}

export async function applyCmuxWorkspaceSummaryCommand(
	options: ApplyCmuxWorkspaceSummaryOptions,
): Promise<ClinkrExit<CmuxWorkspaceSummaryResult>> {
	const workspace =
		nonBlank(options.request.workspace) ??
		nonBlank(options.env["CMUX_WORKSPACE_ID"]) ??
		nonBlank(options.env["CMUX_TAB_ID"]);
	if (workspace === undefined) {
		return failedExit(options.request, null, {
			code: "missing_workspace",
			message:
				"Not running inside a cmux caller workspace (CMUX_WORKSPACE_ID/CMUX_TAB_ID missing).",
		});
	}

	const description = nonBlank(options.request.description);
	if (description === undefined) {
		return failedExit(options.request, workspace, {
			code: "missing_description",
			message: "Provide --description.",
		});
	}

	const renameFailure = await runCmux(options, [
		"workspace",
		"rename",
		workspace,
		"--title",
		options.request.title,
	]);
	if (renameFailure !== undefined) {
		return failedExit(
			options.request,
			workspace,
			commandFailure("rename_workspace_failed", "Failed to rename cmux workspace.", renameFailure),
		);
	}

	const descriptionFailure = await runCmux(options, [
		"workspace-action",
		"--workspace",
		workspace,
		"--action",
		"set-description",
		"--description",
		description,
	]);
	if (descriptionFailure !== undefined) {
		return failedExit(
			options.request,
			workspace,
			commandFailure(
				"set_description_failed",
				"Failed to set cmux workspace description.",
				descriptionFailure,
			),
		);
	}

	const clearStatusFailure = await runCmux(options, [
		"clear-status",
		options.request.statusKey,
		"--workspace",
		workspace,
	]);
	if (clearStatusFailure !== undefined) {
		return failedExit(
			options.request,
			workspace,
			commandFailure(
				"clear_status_failed",
				"Failed to clear cmux workspace status.",
				clearStatusFailure,
			),
		);
	}

	return ok({
		success: true,
		workspace,
		title: options.request.title,
		description,
		status_key: options.request.statusKey,
		error: null,
	});
}

export function renderCmuxWorkspaceSummaryHuman(data: CmuxWorkspaceSummaryResult): string {
	if (data.success) return `Applied cmux workspace summary: ${data.title}\n`;
	return `${data.error?.message ?? "Unknown cmux summary failure."}\n`;
}

async function runCmux(
	options: ApplyCmuxWorkspaceSummaryOptions,
	args: string[],
): Promise<CmuxCommandFailure | undefined> {
	const command = ["cmux", ...args];
	let result: ExecResult;
	try {
		result = await options.commands.exec("cmux", args, {
			cwd: options.cwd,
			env: options.env,
			timeout: CMUX_WORKSPACE_SUMMARY_COMMAND_TIMEOUT_MS,
		});
	} catch (error) {
		return {
			command,
			exitCode: STARTUP_ERROR_EXIT_CODE,
			stdout: "",
			stderr: formatErrorMessage(error),
		};
	}

	if (isSuccessfulExecResult(result)) return undefined;
	return {
		command,
		exitCode: result.code,
		stdout: result.stdout,
		stderr:
			result.stderr || result.startupError || (result.killed ? "cmux command timed out." : ""),
	};
}

function commandFailure(
	code: Exclude<CmuxWorkspaceSummaryFailureCode, "missing_workspace" | "missing_description">,
	baseMessage: string,
	failure: CmuxCommandFailure,
): CmuxWorkspaceSummaryFailure {
	const details = failure.stderr.trim() || failure.stdout.trim();
	const message =
		details.length > 0
			? `${baseMessage} exit ${failure.exitCode}: ${details}`
			: `${baseMessage} exit ${failure.exitCode}.`;
	return { code, message, commandFailure: failure };
}

function failedExit(
	request: CmuxWorkspaceSummaryRequest,
	workspace: string | null,
	failure: CmuxWorkspaceSummaryFailure,
): ClinkrExit<CmuxWorkspaceSummaryResult> {
	const result: CmuxWorkspaceSummaryResult = {
		success: false,
		workspace,
		title: request.title,
		description: null,
		status_key: request.statusKey,
		error: {
			code: failure.code,
			message: failure.message,
			command_failure:
				failure.commandFailure === undefined
					? null
					: {
							command: failure.commandFailure.command,
							exit_code: failure.commandFailure.exitCode,
							stdout: failure.commandFailure.stdout,
							stderr: failure.commandFailure.stderr,
						},
		},
	};
	return shellNegative(failure.message, result);
}

function nonBlank(value: string | undefined): string | undefined {
	if (value === undefined) return undefined;
	const trimmed = value.trim();
	return trimmed.length === 0 ? undefined : trimmed;
}
