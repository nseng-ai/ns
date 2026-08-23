import {
	formatHerdrResourceLabel,
	HERDR_RESOURCE_LABEL_POLICY,
	type HerdrGateway,
} from "@nseng-ai/herdr/api";
import { deriveContentSlug } from "@nseng-ai/extension-kit/content-slug";
import type { CommandContext, NotifyLevel } from "@nseng-ai/extension-kit/pi-types";
import type { ModelSelection } from "@nseng-ai/foundation/model-slug";
import type { TextResult } from "@nseng-ai/foundation/primitives";

import type { HerdrPiCommandApi } from "./pi-command-api.ts";
import type { HerdrSlotLabelInputResolver } from "./resource-label.ts";

export interface HerdrGoalSlugDeriver {
	deriveSlug(input: { cwd: string; goal: string }): Promise<TextResult>;
}

export interface HandleHerdrSpaceGoalOptions {
	herdr: Pick<HerdrGateway, "renameWorkspace">;
	workspaceId: string;
	labelDeriver: HerdrGoalSlugDeriver;
	resolveSlotLabelInput?: HerdrSlotLabelInputResolver;
	args: string;
	ctx: CommandContext;
	notifyProgress: (message: string) => void;
}

export async function generateWorkspaceGoalSlug(
	pi: HerdrPiCommandApi,
	cwd: string,
	goal: string,
	modelSelection: ModelSelection,
): Promise<TextResult> {
	const result = await deriveContentSlug(
		pi,
		{ content: goal, cwd, modelSelection },
		HERDR_RESOURCE_LABEL_POLICY,
	);
	if (!result.ok) return { ok: false, message: result.error.message };
	return { ok: true, text: result.value.slug };
}

export async function handleHerdrSpaceGoal(options: HandleHerdrSpaceGoalOptions): Promise<void> {
	await options.ctx.waitForIdle();
	const goal = await resolveHerdrGoal({
		args: options.args,
		ctx: options.ctx,
		resourceName: "Workspace",
		placeholder: "What is this space for?",
	});
	if (goal === undefined) {
		notify(options.ctx, "Usage: /ns:herdr:space:goal <goal>", "warning");
		return;
	}
	options.notifyProgress("Interpreting goal…");
	const slug = await options.labelDeriver.deriveSlug({ cwd: options.ctx.cwd, goal });
	if (!slug.ok) {
		notify(options.ctx, slug.message, "error");
		return;
	}

	const slotLabelInput = await options.resolveSlotLabelInput?.(options.ctx.cwd);
	const label = formatHerdrResourceLabel({
		semanticLabel: slug.text,
		...(slotLabelInput ?? {}),
	});
	options.notifyProgress("Renaming Herdr workspace…");
	const renameResult = await options.herdr.renameWorkspace(options.workspaceId, label);
	if (renameResult.type === "failed") {
		notify(options.ctx, renameResult.message, "error");
		return;
	}

	notify(options.ctx, `Applied Herdr space goal label: ${label}`, "success");
}

export async function resolveHerdrGoal(options: {
	args: string;
	ctx: CommandContext;
	resourceName: string;
	placeholder: string;
}): Promise<string | undefined> {
	const argumentGoal = options.args.trim();
	if (argumentGoal.length > 0) return argumentGoal;
	if (options.ctx.hasUI !== true || options.ctx.ui.input === undefined) return undefined;
	const inputGoal = (
		await options.ctx.ui.input(`${options.resourceName} goal`, options.placeholder)
	)?.trim();
	return inputGoal !== undefined && inputGoal.length > 0 ? inputGoal : undefined;
}

function notify(ctx: CommandContext, message: string, level: NotifyLevel): void {
	if (ctx.hasUI !== false) ctx.ui.notify(message, level);
}
