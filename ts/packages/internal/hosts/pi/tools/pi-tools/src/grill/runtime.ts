import { formatErrorMessage } from "@nseng-ai/foundation/primitives";
import {
	GRILL_UI_SKILL_NAME,
	GRILL_WITH_DOCS_UI_SKILL_NAME,
	activateGrillAskTool,
} from "@nseng-ai/pi-runtime/grill/surfaces";
import type { NotifyLevel } from "@nseng-ai/pi-runtime/runtime/tool-types";
import { requireRepoSkillBlock } from "@nseng-ai/pi-runtime/skills/expansion";

import { buildGrillUiPrompt, buildGrillWithDocsUiPrompt } from "./prompts.ts";
import type { ExtensionAPI, GrillUiCommandContext } from "./protocol.ts";

interface StructuredGrillCommandOptions {
	skillName: string;
	emptyTargetMessage: string;
	editorTitle: string;
	buildPrompt(skillBlock: string, target: string): string;
}

export async function handleGrillUiCommand(
	pi: ExtensionAPI,
	args: string,
	ctx: GrillUiCommandContext,
): Promise<void> {
	await handleStructuredGrillCommand(pi, args, ctx, {
		skillName: GRILL_UI_SKILL_NAME,
		emptyTargetMessage: "No plan/design provided for /pi:grill-me.",
		editorTitle: "What plan or design should be grilled?",
		buildPrompt: buildGrillUiPrompt,
	});
}

export async function handleGrillWithDocsUiCommand(
	pi: ExtensionAPI,
	args: string,
	ctx: GrillUiCommandContext,
): Promise<void> {
	await handleStructuredGrillCommand(pi, args, ctx, {
		skillName: GRILL_WITH_DOCS_UI_SKILL_NAME,
		emptyTargetMessage: "No plan/design provided for /pi:grill-with-docs.",
		editorTitle: "What plan or design should be grilled against docs?",
		buildPrompt: buildGrillWithDocsUiPrompt,
	});
}

async function handleStructuredGrillCommand(
	pi: ExtensionAPI,
	args: string,
	ctx: GrillUiCommandContext,
	options: StructuredGrillCommandOptions,
): Promise<void> {
	await ctx.waitForIdle();
	let skillBlock: string;
	try {
		skillBlock = (await requireRepoSkillBlock({ cwd: ctx.cwd, skillName: options.skillName }))
			.block;
	} catch (error) {
		notify(ctx, formatErrorMessage(error), "error");
		return;
	}

	const target = await resolveGrillTarget(args, ctx, options.editorTitle);
	if (target.trim().length === 0) {
		notify(ctx, options.emptyTargetMessage, "warning");
		return;
	}

	// Activate only after both required inputs are ready: failed skill preflight must
	// not open the editor, expose grill_ask, or send a model turn.
	activateGrillAskTool(pi);
	pi.sendUserMessage(options.buildPrompt(skillBlock, target));
}

async function resolveGrillTarget(
	args: string,
	ctx: GrillUiCommandContext,
	editorTitle: string,
): Promise<string> {
	const trimmedArgs = args.trim();
	if (trimmedArgs.length > 0) {
		return trimmedArgs;
	}
	if (!ctx.hasUI || ctx.ui.editor === undefined) {
		return "";
	}
	return (await ctx.ui.editor(editorTitle, "")) ?? "";
}

function notify(ctx: GrillUiCommandContext, message: string, level: NotifyLevel): void {
	if (!ctx.hasUI) return;
	ctx.ui.notify?.(message, level);
}
