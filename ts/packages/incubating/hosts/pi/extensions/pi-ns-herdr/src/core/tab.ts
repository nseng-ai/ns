import {
	HERDR_TAB_GOAL_COMMAND_NAME,
	HERDR_TAB_NEW_COMMAND_NAME,
	type HerdrGateway,
} from "@nseng-ai/herdr/api";
import type { ContentSlugContext } from "@nseng-ai/extension-kit/content-slug";
import type { CommandContext } from "@nseng-ai/extension-kit/pi-types";
import { optionalEntry } from "@nseng-ai/foundation/primitives";

import type { HerdrResourceLabelDeriver } from "./new-space.ts";
import { generateHerdrGoalLabel, resolveHerdrGoal } from "./space-goal.ts";

export interface HandleHerdrNewTabOptions {
	herdr: Pick<HerdrGateway, "createTab" | "resolveCallerPane">;
	labelDeriver: HerdrResourceLabelDeriver;
	args: string;
	ctx: CommandContext;
	notifyProgress: (message: string) => void;
}

export async function handleHerdrNewTab(options: HandleHerdrNewTabOptions): Promise<void> {
	const callerWorkspace = await options.herdr.resolveCallerPane();
	if (callerWorkspace.type === "failed") {
		options.ctx.ui.notify(
			`Not running inside a Herdr caller space.\n${callerWorkspace.message}`,
			"warning",
		);
		return;
	}
	const workspaceId = callerWorkspace.workspaceId;

	const description = options.args.trim();
	let label: string | undefined;
	if (description.length > 0) {
		options.notifyProgress("Deriving a semantic label for the new Herdr tab…");
		try {
			label = await options.labelDeriver.deriveLabel({
				description,
				cwd: options.ctx.cwd,
			});
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
	contentSlug: ContentSlugContext;
	herdr: Pick<HerdrGateway, "renameTab" | "resolveCallerPane">;
	args: string;
	ctx: CommandContext;
	notifyProgress: (message: string) => void;
}

export async function handleHerdrTabGoal(options: HandleHerdrTabGoalOptions): Promise<void> {
	const callerTab = await options.herdr.resolveCallerPane();
	if (callerTab.type === "failed") {
		if (options.ctx.hasUI !== false) {
			options.ctx.ui.notify(
				`Not running inside a Herdr caller tab.\n${callerTab.message}`,
				"warning",
			);
		}
		return;
	}
	const tabId = callerTab.tabId;
	await options.ctx.waitForIdle();
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
	const slug = await generateHerdrGoalLabel(options.contentSlug, options.ctx.cwd, goal);
	if (!slug.ok) {
		if (options.ctx.hasUI !== false) options.ctx.ui.notify(slug.message, "error");
		return;
	}
	const label = slug.text;
	options.notifyProgress("Renaming Herdr tab…");
	const result = await options.herdr.renameTab(tabId, label);
	if (result.type === "failed") {
		if (options.ctx.hasUI !== false) options.ctx.ui.notify(result.message, "error");
		return;
	}
	if (options.ctx.hasUI !== false)
		options.ctx.ui.notify(`Applied Herdr tab goal label: ${label}`, "success");
}
