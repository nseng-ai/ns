import {
	formatHerdrResourceLabel,
	HERDR_SPACE_GOAL_COMMAND_NAME,
	slotLabelInput,
	type HerdrGateway,
} from "@nseng-ai/herdr/api";
import { deriveSlugWithModel, formatRawTextModelFailure } from "@nseng-ai/extension-kit/model-slug";
import {
	MODEL_OPERATION_IDS,
	loadModelPolicy,
	resolveModelOperation,
} from "@nseng-ai/extension-kit/model-policy";
import type { CommandContext, NotifyLevel } from "@nseng-ai/extension-kit/pi-types";
import { MAX_BRANCH_SLUG_LENGTH, sanitizeBranchName } from "@nseng-ai/foundation/branch-slug";
import { RealGitGateway } from "@nseng-ai/foundation/git";
import type { TextResult } from "@nseng-ai/foundation/primitives";
import { createNodeProjectConfigGateway } from "@nseng-ai/sdk/project-config/points";

import type { HerdrPiCommandApi } from "./pi-command-api.ts";

const COMMAND_NAME = HERDR_SPACE_GOAL_COMMAND_NAME;

export interface HandleHerdrSpaceGoalOptions {
	pi: HerdrPiCommandApi;
	herdr: HerdrGateway;
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
	presentModelWarning: (message: string) => void,
): Promise<TextResult> {
	const repository = await new RealGitGateway(pi).repoRoot({ cwd });
	if (!repository.ok) {
		return {
			ok: false,
			message: `Could not resolve the Git repository root: ${repository.error.message}`,
		};
	}

	const policy = loadModelPolicy({
		repoRoot: repository.value,
		gateway: createNodeProjectConfigGateway(),
	});
	if (!policy.ok) {
		return { ok: false, message: `Invalid model policy in ns.toml: ${policy.error.message}` };
	}
	const model = resolveModelOperation(policy.value, MODEL_OPERATION_IDS.slug, {
		presentWarning: presentModelWarning,
	});
	if (!model.ok) {
		return { ok: false, message: `Invalid model policy in ns.toml: ${model.error.message}` };
	}

	const fallbackSlug = sanitizeBranchName(goal);
	const result = await deriveSlugWithModel({
		cwd,
		prompt: buildWorkspaceGoalSlugPrompt(goal),
		modelSelection: model.value.selection,
		exec: (command, args, options) => pi.exec(command, args, options),
		slugKind: "workspace goal slug",
		normalizeOutput: (raw) => sanitizeBranchName(raw.trim()) ?? fallbackSlug,
	});
	if (!result.ok) return { ok: false, message: formatRawTextModelFailure(result.failure) };
	return { ok: true, text: result.evidence.slug };
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
	const slug = await generateWorkspaceGoalSlug(options.pi, options.ctx.cwd, goal, (message) =>
		options.ctx.ui.notify(message, "warning"),
	);
	if (!slug.ok) {
		notify(options.ctx, slug.message, "error");
		return;
	}

	const label = formatHerdrResourceLabel({
		semanticLabel: slug.text,
		...slotLabelInput(options.ctx.cwd),
	});
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
