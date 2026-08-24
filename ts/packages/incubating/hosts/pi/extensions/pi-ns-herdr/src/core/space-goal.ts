import { formatHerdrResourceLabel, slotLabelInput, type HerdrGateway } from "@nseng-ai/herdr/api";
import { deriveSlugWithModel, formatRawTextModelFailure } from "@nseng-ai/extension-kit/model-slug";
import type { CommandContext, NotifyLevel } from "@nseng-ai/extension-kit/pi-types";
import { MAX_BRANCH_SLUG_LENGTH, sanitizeBranchName } from "@nseng-ai/foundation/branch-slug";
import type { ModelSelection } from "@nseng-ai/foundation/model-slug";
import type { TextResult } from "@nseng-ai/foundation/primitives";

import type { HerdrPiCommandApi } from "./pi-command-api.ts";

export interface HerdrGoalSlugDeriver {
	deriveSlug(input: { cwd: string; goal: string }): Promise<TextResult>;
}

export interface HandleHerdrSpaceGoalOptions {
	herdr: Pick<HerdrGateway, "renameWorkspace">;
	workspaceId: string;
	labelDeriver: HerdrGoalSlugDeriver;
	args: string;
	ctx: CommandContext;
	notifyProgress: (message: string) => void;
}

export function buildWorkspaceGoalSlugPrompt(goal: string): string {
	return [
		"Generate a concise workspace name slug for this stated goal.",
		"Infer the concrete deliverable or outcome the workspace is intended to accomplish.",
		"Rules:",
		"- Return only the slug, with no quotes, markdown, or explanation.",
		"- Use kebab-case: lowercase ASCII words separated by hyphens.",
		`- Keep it at or under ${MAX_BRANCH_SLUG_LENGTH} characters.`,
		"- Lead with a verb when natural, such as add-, fix-, refactor-, migrate-, rename-, remove-, or update-.",
		"- Do not use spaces, underscores, slashes, punctuation, or special characters.",
		"- Prefer concrete deliverables and specific nouns over broad words like changes, cleanup, or improvements.",
		"",
		"Goal:",
		goal,
	].join("\n");
}

export async function generateWorkspaceGoalSlug(
	pi: HerdrPiCommandApi,
	cwd: string,
	goal: string,
	modelSelection: ModelSelection,
): Promise<TextResult> {
	const fallbackSlug = sanitizeBranchName(goal);
	const result = await deriveSlugWithModel({
		cwd,
		prompt: buildWorkspaceGoalSlugPrompt(goal),
		modelSelection,
		exec: (command, args, options) => pi.exec(command, args, options),
		slugKind: "workspace goal slug",
		normalizeOutput: (raw) => sanitizeBranchName(raw.trim()) ?? fallbackSlug,
	});
	if (!result.ok) return { ok: false, message: formatRawTextModelFailure(result.failure) };
	return { ok: true, text: result.evidence.slug };
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

	const label = formatHerdrResourceLabel({
		semanticLabel: slug.text,
		...slotLabelInput(options.ctx.cwd),
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
