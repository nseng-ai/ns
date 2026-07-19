import {
	buildPiLaunchCommand,
	getPiLaunchOptions,
	type PiLaunchThinkingHost,
} from "@nseng-ai/capability-kit/pi-launch";

import type { HerdrGateway } from "./herdr-gateway.ts";
import type { CommandContext } from "@nseng-ai/capability-kit/pi-types";

export type HerdrHandoffTabLaunchResult =
	| {
			type: "launched";
			workspaceId: string;
			tabId: string;
			rootPaneId: string;
			label: string;
			command: string;
	  }
	| { type: "failed"; stage: "create-tab"; message: string }
	| {
			type: "failed";
			stage: "run-in-pane";
			message: string;
			workspaceId: string;
			tabId: string;
			rootPaneId: string;
			command: string;
	  };

export async function launchHerdrHandoffTab(options: {
	herdr: HerdrGateway;
	pi: PiLaunchThinkingHost;
	ctx: Pick<CommandContext, "cwd" | "model">;
	workspaceId: string;
	slug: string;
	pickupCommand: string;
}): Promise<HerdrHandoffTabLaunchResult> {
	const command = buildPiLaunchCommand(
		options.pickupCommand,
		getPiLaunchOptions(options.pi, options.ctx),
	);
	const label = `handoff: ${options.slug}`;
	const created = await options.herdr.createTab({
		workspaceId: options.workspaceId,
		cwd: options.ctx.cwd,
		label,
		shouldFocus: true,
	});
	if (created.type === "failed") {
		return { type: "failed", stage: "create-tab", message: created.message };
	}

	const ran = await options.herdr.runInPane(created.rootPaneId, command);
	if (ran.type === "failed") {
		return {
			type: "failed",
			stage: "run-in-pane",
			message: ran.message,
			workspaceId: created.workspaceId,
			tabId: created.tabId,
			rootPaneId: created.rootPaneId,
			command,
		};
	}
	return {
		type: "launched",
		workspaceId: created.workspaceId,
		tabId: created.tabId,
		rootPaneId: created.rootPaneId,
		label,
		command,
	};
}

export function formatHerdrHandoffTabLaunchSuccess(
	result: Extract<HerdrHandoffTabLaunchResult, { type: "launched" }>,
): string {
	return [
		"Opened handoff pickup tab.",
		`Workspace: ${result.workspaceId}`,
		`Tab: ${result.tabId}`,
		`Root pane: ${result.rootPaneId}`,
		`Label: ${result.label}`,
		`Command: ${result.command}`,
	].join("\n");
}

export function formatHerdrHandoffTabRunFailure(
	result: Extract<HerdrHandoffTabLaunchResult, { type: "failed"; stage: "run-in-pane" }>,
): string {
	return [
		result.message,
		"The Herdr tab was created, but the pickup Pi did not start.",
		`Workspace: ${result.workspaceId}`,
		`Tab: ${result.tabId}`,
		`Root pane: ${result.rootPaneId}`,
		`Manual recovery: herdr pane run ${result.rootPaneId} ${JSON.stringify(result.command)}`,
	].join("\n");
}
