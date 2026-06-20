import { piExecApiToCommandExecApi } from "@asdl/core/exec";
import { checkoutSlot, type SlotCheckoutTarget } from "../slot-checkout.ts";
import { RealCmuxGateway, type CmuxGatewayFailure } from "./gateway.ts";
import { getWorktreeDescription } from "./worktree-description.ts";
import type { ExtensionAPI, NotifyLevel } from "./types.ts";

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
	const cmux = new RealCmuxGateway(piExecApiToCommandExecApi(pi));
	const result = await cmux.openWorkspace({
		cwd: target.worktreePath,
		name: target.branchName,
		description: options.description,
		workspaceCwd: target.worktreePath,
		...(options.command === undefined ? {} : { command: options.command }),
	});
	if (result.type === "success") return { ok: true };

	return {
		error: formatCmuxWorkspaceFailure(result.failure, options),
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
	failure: CmuxGatewayFailure,
	options: OpenCmuxWorkspaceOptions,
): string {
	const heading = options.failureHeading ?? "cmux new-workspace failed.";
	const lines = [heading, ...(options.failureDetails ?? []), failure.message];
	return lines.filter((line) => line.length > 0).join("\n");
}
