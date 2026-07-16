import type { CommandExecApi } from "@nseng-ai/foundation/command";
import type { SlotCheckoutTarget, SlotClient } from "@nseng-ai/slots/api";

import type { HerdrGateway } from "./herdr-gateway.ts";
import type { NotifyLevel } from "@nseng-ai/capability-kit/cmux/types";
import { checkoutSlot, formatSlotCheckoutFailureCause } from "./slot-checkout.ts";
import { getWorktreeDescription } from "./worktree-description.ts";

export interface HerdrSlotCheckoutOptions {
	pi: CommandExecApi;
	cwd: string;
	branchName: string;
	slotClient: SlotClient;
	notify: (message: string, level: NotifyLevel) => void;
	onStatus?: (message: string) => void;
}

export interface OpenBranchInHerdrWorkspaceOptions extends HerdrSlotCheckoutOptions {
	herdr: HerdrGateway;
	command?: string;
	description?: string;
	successMessage?: (target: SlotCheckoutTarget) => string;
	notifyProgress?: (message: string) => void;
}

export interface OpenBranchInHerdrCallerTabOptions extends HerdrSlotCheckoutOptions {
	herdr: HerdrGateway;
	callerWorkspaceId: string;
	command: string;
	tabTitle: string;
	onStatus?: (message: string | undefined) => void;
}

export async function checkoutBranchHerdrSlot(
	options: HerdrSlotCheckoutOptions,
): Promise<SlotCheckoutTarget | { error: string }> {
	const { branchName, notify, onStatus } = options;
	onStatus?.("checking out branch slot…");
	const checkout = await checkoutSlot(options.slotClient, { kind: "branch", branchName });
	if (!checkout.ok) {
		const cause = formatSlotCheckoutFailureCause(checkout.failure);
		notify(formatSlotCheckoutFailure(branchName, cause), "error");
		return { error: cause };
	}
	return checkout.target;
}

/**
 * Check out the slot for a branch, then open a new Herdr workspace at the
 * resulting worktree. Optionally runs a launch command in the root pane.
 *
 * Herdr owns workspace creation and process launch; ns owns the slot checkout.
 */
export async function openBranchInHerdrWorkspace(
	options: OpenBranchInHerdrWorkspaceOptions,
): Promise<SlotCheckoutTarget | { error: string }> {
	const { pi, herdr, command, description, notify, onStatus, successMessage } = options;

	const target = await checkoutBranchHerdrSlot(options);
	if ("error" in target) return target;

	onStatus?.("opening Herdr workspace…");
	const label =
		description ?? (await getWorktreeDescription(pi, target.worktreePath, target.branchName));
	const created = await herdr.createWorkspace({ cwd: target.worktreePath, label });
	if (created.type === "failed") {
		notify(
			[
				"Checked out the branch slot, but failed to open the Herdr workspace.",
				`Branch: ${target.branchName}`,
				`Worktree: ${target.worktreePath}`,
				created.message,
			]
				.filter((l) => l.length > 0)
				.join("\n"),
			"error",
		);
		return { error: created.message };
	}

	if (command !== undefined) {
		const ran = await herdr.runInPane(created.rootPaneId, command);
		if (ran.type === "failed") {
			notify(
				[
					"Opened Herdr workspace, but failed to launch command.",
					`Branch: ${target.branchName}`,
					`Workspace: ${created.workspaceId}`,
					`Pane: ${created.rootPaneId}`,
					ran.message,
				]
					.filter((l) => l.length > 0)
					.join("\n"),
				"error",
			);
			return { error: ran.message };
		}
	}

	notify(
		successMessage?.(target) ?? `Opened Herdr workspace for branch: ${target.branchName}`,
		"info",
	);
	return target;
}

/**
 * Check out the slot for a branch, then create a focused tab in the caller's
 * Herdr workspace and run the launch command there.
 *
 * Herdr owns tab creation and process launch; ns owns the slot checkout.
 */
export async function openBranchInHerdrCallerTab(
	options: OpenBranchInHerdrCallerTabOptions,
): Promise<
	{ type: "opened"; target: SlotCheckoutTarget; tabId: string; paneId: string } | { type: "error" }
> {
	const { herdr, callerWorkspaceId, command, tabTitle, notify, onStatus } = options;

	const target = await checkoutBranchHerdrSlot(options);
	if ("error" in target) return { type: "error" };

	onStatus?.("creating Herdr tab…");
	const created = await herdr.createTab({
		workspaceId: callerWorkspaceId,
		cwd: target.worktreePath,
		label: tabTitle,
		focus: true,
	});
	if (created.type === "failed") {
		notify(
			[
				"Checked out the branch slot, but failed to create Herdr tab.",
				`Branch: ${target.branchName}`,
				`Worktree: ${target.worktreePath}`,
				`Caller workspace: ${callerWorkspaceId}`,
				created.message,
			]
				.filter((l) => l.length > 0)
				.join("\n"),
			"error",
		);
		return { type: "error" };
	}

	// Tab was created with --label=tabTitle so no separate rename is needed.

	onStatus?.("launching command in Herdr tab…");
	const ran = await herdr.runInPane(created.rootPaneId, command);
	if (ran.type === "failed") {
		notify(
			[
				"Created Herdr tab, but failed to launch command.",
				`Branch: ${target.branchName}`,
				`Tab: ${created.tabId}`,
				`Pane: ${created.rootPaneId}`,
				ran.message,
			]
				.filter((l) => l.length > 0)
				.join("\n"),
			"error",
		);
		return { type: "error" };
	}

	onStatus?.(undefined);
	return { type: "opened", target, tabId: created.tabId, paneId: created.rootPaneId };
}

function formatSlotCheckoutFailure(branchName: string, cause: string): string {
	return ["Failed to check out branch slot.", `Branch: ${branchName}`, "", cause].join("\n");
}
