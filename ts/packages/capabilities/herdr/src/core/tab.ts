import type { CommandContext } from "@nseng-ai/capability-kit/pi-types";
import { optionalEntry } from "@nseng-ai/foundation/primitives";

import { HERDR_TAB_GOAL_COMMAND_NAME, HERDR_TAB_NEW_COMMAND_NAME } from "./command-surfaces.ts";
import type { HerdrGateway } from "./herdr-gateway.ts";
import type { HerdrSpaceLabelDeriver } from "./new-space.ts";
import type { HerdrPiCommandApi } from "./pi-command-api.ts";
import {
	formatGoalWorkspaceLabel,
	generateWorkspaceGoalSlug,
	resolveHerdrGoal,
} from "./space-goal.ts";
import { getCallerTabId, getCallerWorkspaceId } from "./sidebar.ts";
import { slotLabelInput } from "./workspace-label.ts";

export interface HandleHerdrNewTabOptions {
	herdr: Pick<HerdrGateway, "createTab">;
	labelDeriver: HerdrSpaceLabelDeriver;
	args: string;
	ctx: CommandContext;
	notifyProgress: (message: string) => void;
	env?: NodeJS.ProcessEnv;
}

export async function handleHerdrNewTab(options: HandleHerdrNewTabOptions): Promise<void> {
	const workspaceId = getCallerWorkspaceId(options.env);
	if (workspaceId === undefined) {
		options.ctx.ui.notify("Not running inside a Herdr caller workspace.", "warning");
		return;
	}

	const description = options.args.trim();
	let label: string | undefined;
	if (description.length > 0) {
		options.notifyProgress("Deriving a semantic label for the new Herdr tab…");
		try {
			label = await options.labelDeriver.deriveLabel({ description, cwd: options.ctx.cwd });
		} catch (error) {
			const detail = error instanceof Error ? error.message : String(error);
			options.ctx.ui.notify(
				`Could not derive a label for the new Herdr tab. No tab was created.\n${detail}`,
				"error",
			);
			return;
		}
	}

	options.ctx.ui.setStatus?.(HERDR_TAB_NEW_COMMAND_NAME, "opening Herdr tab…");
	try {
		const created = await options.herdr.createTab({
			workspaceId,
			cwd: options.ctx.cwd,
			shouldFocus: true,
			...optionalEntry("label", label),
		});
		if (created.type === "failed") {
			options.ctx.ui.notify(created.message, "error");
			return;
		}
		options.ctx.ui.notify(
			label === undefined
				? `Opened Herdr tab at ${options.ctx.cwd}.`
				: `Opened Herdr tab ${label} at ${options.ctx.cwd}.`,
			"info",
		);
	} finally {
		options.ctx.ui.setStatus?.(HERDR_TAB_NEW_COMMAND_NAME, undefined);
	}
}

export interface HandleHerdrTabGoalOptions {
	pi: HerdrPiCommandApi;
	herdr: Pick<HerdrGateway, "renameTab">;
	args: string;
	ctx: CommandContext;
	notifyProgress: (message: string) => void;
	env?: NodeJS.ProcessEnv;
}

export async function handleHerdrTabGoal(options: HandleHerdrTabGoalOptions): Promise<void> {
	await options.ctx.waitForIdle();
	const tabId = getCallerTabId(options.env);
	if (tabId === undefined) {
		if (options.ctx.hasUI !== false)
			options.ctx.ui.notify("Not running inside a Herdr caller tab.", "warning");
		return;
	}
	const goal = await resolveHerdrGoal({
		args: options.args,
		ctx: options.ctx,
		resourceName: "Tab",
		placeholder: "What is this tab for?",
	});
	if (goal === undefined) {
		if (options.ctx.hasUI !== false)
			options.ctx.ui.notify(`Usage: /${HERDR_TAB_GOAL_COMMAND_NAME} <goal>`, "warning");
		return;
	}

	options.notifyProgress("Interpreting goal…");
	const slug = await generateWorkspaceGoalSlug(options.pi, options.ctx.cwd, goal);
	if (!slug.ok) {
		if (options.ctx.hasUI !== false) options.ctx.ui.notify(slug.message, "error");
		return;
	}
	const label = formatGoalWorkspaceLabel({ slug: slug.text, ...slotLabelInput(options.ctx.cwd) });
	options.notifyProgress("Renaming Herdr tab…");
	const result = await options.herdr.renameTab(tabId, label);
	if (result.type === "failed") {
		if (options.ctx.hasUI !== false) options.ctx.ui.notify(result.message, "error");
		return;
	}
	if (options.ctx.hasUI !== false)
		options.ctx.ui.notify(`Applied Herdr tab goal label: ${label}`, "success");
}
