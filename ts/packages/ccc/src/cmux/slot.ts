import { formatCommand, formatOutputSection } from "@asdl/core/exec";
import { checkoutSlot, type SlotCheckoutTarget } from "../slot-checkout.ts";
import { getWorktreeDescription } from "./worktree-description.ts";
import type { ExecResult, ExtensionAPI, NotifyLevel } from "./types.ts";

const CMUX_TIMEOUT_MS = 10_000;
const MAX_ERROR_CHARS = 4_000;

export interface BranchCmuxSlotCheckoutOptions {
	pi: Pick<ExtensionAPI, "exec">;
	cwd: string;
	branchName: string;
	notify: (message: string, level: NotifyLevel) => void;
	onStatus?: (message: string) => void;
}

export interface OpenBranchInCmuxSlotOptions extends BranchCmuxSlotCheckoutOptions {
	command?: string;
	description?: string;
	successMessage?: (target: SlotCheckoutTarget) => string;
}

export interface OpenCmuxWorkspaceOptions {
	description: string;
	command?: string;
	failureHeading?: string;
	failureDetails?: readonly string[];
}

export async function checkoutBranchCmuxSlot(
	options: BranchCmuxSlotCheckoutOptions,
): Promise<SlotCheckoutTarget | { error: string }> {
	const { pi, cwd, branchName, notify, onStatus } = options;
	onStatus?.("checking out branch slot…");
	const checkout = await checkoutSlot(pi, cwd, { kind: "branch", branchName });
	if (!checkout.ok) {
		const error = { error: checkout.error };
		notify(formatSlotCheckoutFailure(branchName, checkout.error), "error");
		return error;
	}

	return checkout.target;
}

export async function openBranchInCmuxSlot(
	options: OpenBranchInCmuxSlotOptions,
): Promise<SlotCheckoutTarget | { error: string }> {
	const { pi, command, description, notify, onStatus, successMessage } = options;
	const target = await checkoutBranchCmuxSlot(options);
	if ("error" in target) return target;
	onStatus?.("opening cmux workspace…");
	const workspaceDescription =
		description ?? (await getWorktreeDescription(pi, target.worktreePath, target.branchName));
	const workspaceOptions: OpenCmuxWorkspaceOptions = {
		description: workspaceDescription,
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

	notify(
		successMessage?.(target) ?? `Opened cmux workspace for branch: ${target.branchName}`,
		"info",
	);
	return target;
}

export async function openCmuxWorkspace(
	pi: Pick<ExtensionAPI, "exec">,
	target: SlotCheckoutTarget,
	options: OpenCmuxWorkspaceOptions,
): Promise<{ ok: true } | { error: string }> {
	const args = buildNewWorkspaceArgs(target, options);
	const result = await pi.exec("cmux", args, {
		cwd: target.worktreePath,
		timeout: CMUX_TIMEOUT_MS,
	});
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

function formatCommandFailure(
	title: string,
	command: string,
	args: string[],
	result: ExecResult,
): string {
	const status = result.killed
		? `exit code ${result.code}; process was killed or timed out`
		: `exit code ${result.code}`;
	const sections = [
		`${title} (${status})`,
		`Command: ${formatCommand(command, args)}`,
		formatOutputSection("stdout", result.stdout, { maxChars: MAX_ERROR_CHARS, maxLines: 80 }),
		formatOutputSection("stderr", result.stderr, { maxChars: MAX_ERROR_CHARS, maxLines: 80 }),
	];
	return sections.join("\n\n");
}
