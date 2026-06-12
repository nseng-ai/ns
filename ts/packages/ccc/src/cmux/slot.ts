import { formatCommand, formatOutputSection } from "@asdl/core/exec";
import { parseMachineEnvelopeData } from "@asdl/pi-extension-runtime/machine-envelope";
import { getWorktreeDescription } from "./worktree-description.ts";
import type { ExecResult, ExtensionAPI, NotifyLevel } from "./types.ts";

const SLOT_TIMEOUT_MS = 30_000;
const CMUX_TIMEOUT_MS = 10_000;
const MAX_ERROR_CHARS = 4_000;

export interface SlotCheckoutTarget {
	slotName: string;
	branchName: string;
	worktreePath: string;
	isAlreadyAssigned: boolean;
}

export interface OpenBranchInCmuxSlotOptions {
	pi: Pick<ExtensionAPI, "exec">;
	cwd: string;
	branchName: string;
	command?: string;
	notify: (message: string, level: NotifyLevel) => void;
	onStatus?: (message: string) => void;
	successMessage?: (target: SlotCheckoutTarget) => string;
}

export interface OpenCmuxWorkspaceOptions {
	description: string;
	command?: string;
	failureHeading?: string;
	failureDetails?: readonly string[];
}

export async function openBranchInCmuxSlot(
	options: OpenBranchInCmuxSlotOptions,
): Promise<SlotCheckoutTarget | { error: string }> {
	const { pi, cwd, branchName, command, notify, onStatus, successMessage } = options;
	onStatus?.("checking out branch slot…");
	const target = await checkoutSlot(pi, cwd, branchName);
	if ("error" in target) {
		notify(formatSlotCheckoutFailure(branchName, target.error), "error");
		return target;
	}

	onStatus?.("opening cmux workspace…");
	const description = await getWorktreeDescription(pi, target.worktreePath, target.branchName);
	const workspaceOptions: OpenCmuxWorkspaceOptions = {
		description,
		failureHeading: "Checked out the branch slot, but failed to open the cmux workspace.",
		failureDetails: [`Branch: ${target.branchName}`, `Worktree: ${target.worktreePath}`],
	};
	if (command !== undefined) {
		workspaceOptions.command = command;
	}
	const launched = await openCmuxWorkspace(pi, target, workspaceOptions);
	if ("error" in launched) {
		notify(launched.error, "error");
		return launched;
	}

	notify(successMessage?.(target) ?? `Opened cmux workspace for branch: ${target.branchName}`, "info");
	return target;
}

export async function checkoutSlot(
	pi: Pick<ExtensionAPI, "exec">,
	cwd: string,
	branch: string,
): Promise<SlotCheckoutTarget | { error: string }> {
	const result = await pi.exec("slot", ["checkout", branch, "--format", "json", "--no-clipboard"], {
		cwd,
		timeout: SLOT_TIMEOUT_MS,
	});

	const parsed = parseMachineEnvelopeData(result.stdout, { label: "slot checkout JSON", stdoutTail: false });
	if (parsed.type === "failure") {
		return { error: formatSlotCheckoutCliFailure(parsed) };
	}
	if (parsed.type === "invalid") {
		return { error: "slot checkout failed with unreadable JSON output." };
	}

	const target = coerceSlotCheckoutTarget(parsed.data);
	if (target === undefined) {
		return { error: "slot checkout failed with malformed JSON data." };
	}
	return target;
}

export async function openCmuxWorkspace(
	pi: Pick<ExtensionAPI, "exec">,
	target: SlotCheckoutTarget,
	options: OpenCmuxWorkspaceOptions,
): Promise<{ ok: true } | { error: string }> {
	const args = buildNewWorkspaceArgs(target, options);
	const result = await pi.exec("cmux", args, { cwd: target.worktreePath, timeout: CMUX_TIMEOUT_MS });
	if (result.code === 0 && !result.killed) {
		return { ok: true };
	}

	return {
		error: formatCmuxWorkspaceFailure(result, args, options),
	};
}

export function buildNewWorkspaceArgs(
	target: SlotCheckoutTarget,
	options: Pick<OpenCmuxWorkspaceOptions, "description" | "command">,
): string[] {
	const args = [
		"new-workspace",
		"--name",
		target.branchName,
		"--description",
		options.description,
		"--cwd",
		target.worktreePath,
	];
	if (options.command !== undefined) {
		args.push("--command", options.command);
	}
	return args;
}

function formatSlotCheckoutFailure(branchName: string, cause: string): string {
	return ["Failed to check out branch slot.", `Branch: ${branchName}`, "", cause].join("\n");
}

function coerceSlotCheckoutTarget(data: Record<string, unknown>): SlotCheckoutTarget | undefined {
	if (
		typeof data.slot_name !== "string" ||
		typeof data.branch_name !== "string" ||
		typeof data.worktree_path !== "string" ||
		typeof data.already_assigned !== "boolean"
	) {
		return undefined;
	}
	return {
		slotName: data.slot_name,
		branchName: data.branch_name,
		worktreePath: data.worktree_path,
		isAlreadyAssigned: data.already_assigned,
	};
}

function formatSlotCheckoutCliFailure(failure: { exitCode: number; errorType?: string; cliMessage?: string }): string {
	const status = failure.errorType === undefined ? "" : ` (${failure.errorType})`;
	if (failure.cliMessage !== undefined) {
		return `slot checkout failed${status}: ${failure.cliMessage}`;
	}
	return `slot checkout failed with exit_code ${failure.exitCode}${status}.`;
}

function formatCmuxWorkspaceFailure(
	result: ExecResult,
	args: string[],
	options: OpenCmuxWorkspaceOptions,
): string {
	const heading = options.failureHeading ?? "cmux new-workspace failed.";
	const lines = [
		heading,
		...(options.failureDetails ?? []),
		formatCommandFailure("cmux new-workspace failed.", "cmux", args, result),
	];
	return lines.filter((line) => line.length > 0).join("\n");
}

function formatCommandFailure(title: string, command: string, args: string[], result: ExecResult): string {
	const status = result.killed ? `exit code ${result.code}; process was killed or timed out` : `exit code ${result.code}`;
	const sections = [
		`${title} (${status})`,
		`Command: ${formatCommand(command, args)}`,
		formatOutputSection("stdout", result.stdout, { maxChars: MAX_ERROR_CHARS, maxLines: 80 }),
		formatOutputSection("stderr", result.stderr, { maxChars: MAX_ERROR_CHARS, maxLines: 80 }),
	];
	return sections.join("\n\n");
}
