import { buildPiLaunchCommand, type PiLaunchOptions } from "@nseng-ai/extension-kit/pi-launch";
import { formatShellArg } from "@nseng-ai/foundation/exec";

import type { HerdrGateway } from "./herdr-gateway.ts";

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
	cwd: string;
	launchOptions: PiLaunchOptions;
	workspaceId: string;
	slug: string;
	pickupCommand: string;
}): Promise<HerdrHandoffTabLaunchResult> {
	const command = buildPiLaunchCommand(options.pickupCommand, options.launchOptions);
	const label = `handoff:${options.slug}`;
	const created = await options.herdr.createTab({
		workspaceId: options.workspaceId,
		cwd: options.cwd,
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
		`Manual recovery: ${["herdr", "pane", "run", result.rootPaneId, result.command].map(formatShellArg).join(" ")}`,
	].join("\n");
}
