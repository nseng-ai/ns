import { deriveContentSlug, type ContentSlugContext } from "@nseng-ai/extension-kit/content-slug";
import type { CommandContext, NotifyLevel } from "@nseng-ai/extension-kit/pi-types";
import {
	formatHerdrResourceLabel,
	HERDR_RESOURCE_LABEL_POLICY,
	HERDR_SPACE_GOAL_COMMAND_NAME,
	type HerdrGateway,
	type HerdrSlotLabelInput,
} from "@nseng-ai/herdr/api";
import type { TextResult } from "@nseng-ai/foundation/primitives";

const COMMAND_NAME = HERDR_SPACE_GOAL_COMMAND_NAME;
type SlotLabelInputResolver = (cwd: string) => Promise<HerdrSlotLabelInput>;

export interface HandleHerdrSpaceGoalOptions {
	contentSlug: ContentSlugContext;
	herdr: HerdrGateway;
	resolveSlotLabelInput: SlotLabelInputResolver;
	args: string;
	ctx: CommandContext;
	notifyProgress: (message: string) => void;
}

export async function generateHerdrGoalLabel(
	context: ContentSlugContext,
	cwd: string,
	goal: string,
): Promise<TextResult> {
	try {
		const evidence = await deriveContentSlug(
			context,
			{ content: goal, cwd },
			HERDR_RESOURCE_LABEL_POLICY,
		);
		return { ok: true, text: evidence.slug };
	} catch (error) {
		return { ok: false, message: error instanceof Error ? error.message : String(error) };
	}
}

export async function handleHerdrSpaceGoal(options: HandleHerdrSpaceGoalOptions): Promise<void> {
	await options.ctx.waitForIdle();

	const callerWorkspace = await options.herdr.resolveCallerPane();
	if (callerWorkspace.type === "failed") {
		notify(
			options.ctx,
			`Not running inside a Herdr caller space.\n${callerWorkspace.message}`,
			"warning",
		);
		return;
	}
	const workspaceId = callerWorkspace.workspaceId;

	const goal = await resolveHerdrGoal({
		args: options.args,
		ctx: options.ctx,
		resourceName: "Workspace",
		placeholder: "What is this space for?",
	});
	if (goal === undefined) {
		notify(options.ctx, `Usage: /${COMMAND_NAME} <goal>`, "warning");
		return;
	}

	options.notifyProgress("Interpreting goal…");
	const slug = await generateHerdrGoalLabel(options.contentSlug, options.ctx.cwd, goal);
	if (!slug.ok) {
		notify(options.ctx, slug.message, "error");
		return;
	}

	const slotLabelInput = await options.resolveSlotLabelInput(options.ctx.cwd);
	const label = formatHerdrResourceLabel({ semanticLabel: slug.text, ...slotLabelInput });
	options.notifyProgress("Renaming Herdr workspace…");
	const renameResult = await options.herdr.renameWorkspace(workspaceId, label);
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
