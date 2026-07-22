import type { NotifyLevel } from "@nseng-ai/capability-kit/pi-types";
import type { SlotCheckoutTarget, SlotClient } from "@nseng-ai/slots/api";

import type { HerdrGateway } from "./herdr-gateway.ts";
import { checkoutSlot, formatSlotCheckoutFailureCause } from "./slot-checkout.ts";
import { formatGoalWorkspaceLabel, slotLabelInput } from "./workspace-label.ts";

export interface PreparedDispatchPayload {
	readonly branchName: string;
	readonly semanticSlug: string;
	readonly launchCommand: string;
}

export type PreparedDispatchDestination =
	| { readonly type: "workspace" }
	| { readonly type: "tab"; readonly callerWorkspaceId: string };

export interface OpenedPreparedDispatchTarget {
	readonly checkout: SlotCheckoutTarget;
	readonly label: string;
	readonly workspaceId: string;
	readonly tabId: string;
	readonly paneId: string;
}

export type PreparedDispatchResult =
	| {
			type: "opened";
			destination: "workspace" | "tab";
			target: OpenedPreparedDispatchTarget;
	  }
	| {
			type: "failed";
			stage: "slot-checkout" | "destination-create" | "pane-launch";
			message: string;
			target?: SlotCheckoutTarget;
			workspaceId?: string;
			tabId?: string;
			paneId?: string;
	  };

type FailedPreparedDispatchResult = Extract<PreparedDispatchResult, { type: "failed" }>;

interface CreatedPreparedDispatchDestination {
	readonly type: "created";
	readonly destination: "workspace" | "tab";
	readonly label: string;
	readonly workspaceId: string;
	readonly tabId: string;
	readonly paneId: string;
}

export async function dispatchPreparedBranch(options: {
	payload: PreparedDispatchPayload;
	destination: PreparedDispatchDestination;
	herdr: HerdrGateway;
	slotClient: SlotClient;
	notify: (message: string, level: NotifyLevel) => void;
	onStatus?: (message: string | undefined) => void;
}): Promise<PreparedDispatchResult> {
	const { payload } = options;
	options.onStatus?.("checking out branch slot…");
	const checkout = await checkoutSlot(options.slotClient, {
		kind: "branch",
		branchName: payload.branchName,
	});
	if (!checkout.ok) {
		const message = formatSlotCheckoutFailureCause(checkout.failure);
		options.notify(
			["Failed to check out branch slot.", `Branch: ${payload.branchName}`, "", message].join("\n"),
			"error",
		);
		return { type: "failed", stage: "slot-checkout", message };
	}
	const target = checkout.target;
	const created = await createPreparedDispatchDestination({
		destination: options.destination,
		target,
		semanticSlug: payload.semanticSlug,
		herdr: options.herdr,
		notify: options.notify,
		...(options.onStatus === undefined ? {} : { onStatus: options.onStatus }),
	});
	if (created.type === "failed") {
		return created;
	}

	options.onStatus?.(`launching command in Herdr ${created.destination}…`);
	const ran = await options.herdr.runInPane(created.paneId, payload.launchCommand);
	if (ran.type === "failed") {
		const failureLead =
			created.destination === "workspace"
				? "Opened Herdr workspace, but failed to launch command."
				: "Created Herdr tab, but failed to launch command.";
		options.notify(
			[
				failureLead,
				`Branch: ${target.branchName}`,
				`Workspace: ${created.workspaceId}`,
				`Tab: ${created.tabId}`,
				`Pane: ${created.paneId}`,
				ran.message,
			].join("\n"),
			"error",
		);
		return {
			type: "failed",
			stage: "pane-launch",
			message: ran.message,
			target,
			workspaceId: created.workspaceId,
			tabId: created.tabId,
			paneId: created.paneId,
		};
	}

	options.onStatus?.(undefined);
	return {
		type: "opened",
		destination: created.destination,
		target: {
			checkout: target,
			label: created.label,
			workspaceId: created.workspaceId,
			tabId: created.tabId,
			paneId: created.paneId,
		},
	};
}

async function createPreparedDispatchDestination(options: {
	destination: PreparedDispatchDestination;
	target: SlotCheckoutTarget;
	semanticSlug: string;
	herdr: HerdrGateway;
	notify: (message: string, level: NotifyLevel) => void;
	onStatus?: (message: string | undefined) => void;
}): Promise<CreatedPreparedDispatchDestination | FailedPreparedDispatchResult> {
	if (options.destination.type === "workspace") {
		options.onStatus?.("opening Herdr workspace…");
		const label = formatGoalWorkspaceLabel({
			slug: options.semanticSlug,
			...slotLabelInput(options.target.worktreePath),
		});
		const created = await options.herdr.createWorkspace({
			cwd: options.target.worktreePath,
			label,
		});
		if (created.type === "failed") {
			options.notify(
				[
					"Checked out the branch slot, but failed to open the Herdr workspace.",
					`Branch: ${options.target.branchName}`,
					`Worktree: ${options.target.worktreePath}`,
					created.message,
				].join("\n"),
				"error",
			);
			return {
				type: "failed",
				stage: "destination-create",
				message: created.message,
				target: options.target,
			};
		}
		return {
			type: "created",
			destination: "workspace",
			label,
			workspaceId: created.workspaceId,
			tabId: created.tabId,
			paneId: created.rootPaneId,
		};
	}

	options.onStatus?.("creating Herdr tab…");
	const created = await options.herdr.createTab({
		workspaceId: options.destination.callerWorkspaceId,
		cwd: options.target.worktreePath,
		label: options.semanticSlug,
		shouldFocus: true,
	});
	if (created.type === "failed") {
		options.notify(
			[
				"Checked out the branch slot, but failed to create Herdr tab.",
				`Branch: ${options.target.branchName}`,
				`Worktree: ${options.target.worktreePath}`,
				`Caller workspace: ${options.destination.callerWorkspaceId}`,
				created.message,
			].join("\n"),
			"error",
		);
		return {
			type: "failed",
			stage: "destination-create",
			message: created.message,
			target: options.target,
		};
	}
	return {
		type: "created",
		destination: "tab",
		label: options.semanticSlug,
		workspaceId: created.workspaceId,
		tabId: created.tabId,
		paneId: created.rootPaneId,
	};
}
