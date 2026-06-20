import { z } from "zod";

import { shellNegative, ok, type ClinkrExit } from "@asdl/clinkr";
import type { CommandExecApi } from "@asdl/core/exec";
import { RealCmuxGateway, type CmuxGateway, type CmuxGatewayFailure } from "./gateway.ts";

export const DEFAULT_CMUX_WORKSPACE_SUMMARY_STATUS_KEY = "pi-summary";
export const CMUX_WORKSPACE_SUMMARY_COMMAND_TIMEOUT_MS = 30_000;

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
	commandFailure?: CmuxGatewayFailure["commandFailure"];
}

export interface ApplyCmuxWorkspaceSummaryOptions {
	request: CmuxWorkspaceSummaryRequest;
	commands: CommandExecApi;
	cwd: string;
	env: Record<string, string | undefined>;
	cmux?: CmuxGateway;
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

	const cmux = options.cmux ?? new RealCmuxGateway(options.commands);
	const context = {
		cwd: options.cwd,
		env: options.env,
		timeoutMs: CMUX_WORKSPACE_SUMMARY_COMMAND_TIMEOUT_MS,
	};

	const renameResult = await cmux.renameWorkspace({
		...context,
		workspace,
		title: options.request.title,
	});
	if (renameResult.type === "failed") {
		return failedExit(
			options.request,
			workspace,
			commandFailure(
				"rename_workspace_failed",
				"Failed to rename cmux workspace.",
				renameResult.failure,
			),
		);
	}

	const descriptionResult = await cmux.setWorkspaceDescription({
		...context,
		workspace,
		description,
	});
	if (descriptionResult.type === "failed") {
		return failedExit(
			options.request,
			workspace,
			commandFailure(
				"set_description_failed",
				"Failed to set cmux workspace description.",
				descriptionResult.failure,
			),
		);
	}

	const clearStatusResult = await cmux.clearStatus({
		...context,
		workspace,
		statusKey: options.request.statusKey,
	});
	if (clearStatusResult.type === "failed") {
		return failedExit(
			options.request,
			workspace,
			commandFailure(
				"clear_status_failed",
				"Failed to clear cmux workspace status.",
				clearStatusResult.failure,
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

function commandFailure(
	code: Exclude<CmuxWorkspaceSummaryFailureCode, "missing_workspace" | "missing_description">,
	baseMessage: string,
	failure: CmuxGatewayFailure,
): CmuxWorkspaceSummaryFailure {
	const commandFailureValue = failure.commandFailure;
	if (commandFailureValue === undefined) {
		return { code, message: failure.message };
	}

	const details = commandFailureValue.stderr.trim() || commandFailureValue.stdout.trim();
	const message =
		details.length > 0
			? `${baseMessage} exit ${commandFailureValue.exitCode}: ${details}`
			: `${baseMessage} exit ${commandFailureValue.exitCode}.`;
	return { code, message, commandFailure: commandFailureValue };
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
