import { GRILL_UI_SKILL_NAME, GRILL_WITH_DOCS_UI_SKILL_NAME } from "@nseng-ai/pi/grill/surfaces";
import { expandRepoSkillBlock } from "@nseng-ai/pi/skills/expansion";

import { buildGrillUiPrompt, buildGrillWithDocsUiPrompt } from "./prompts.ts";
import type { ExtensionAPI, GrillUiCommandContext } from "./protocol.ts";

type NotifyLevel = "info" | "warning" | "error";

interface StructuredGrillCommandOptions {
	skillName: string;
	emptyTargetMessage: string;
	expansionFailureMessage: string;
	editorTitle: string;
	buildPrompt(skillBlock: string | undefined, target: string): string;
}

export async function handleGrillUiCommand(
	pi: ExtensionAPI,
	args: string,
	ctx: GrillUiCommandContext,
): Promise<void> {
	await handleStructuredGrillCommand(pi, args, ctx, {
		skillName: GRILL_UI_SKILL_NAME,
		emptyTargetMessage: "No plan/design provided for /pi:grill-me.",
		expansionFailureMessage:
			"Could not expand pi-grill-ui skill; using fallback grill instructions.",
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
		expansionFailureMessage:
			"Could not expand pi-grill-with-docs-ui skill; using fallback docs-aware grill instructions.",
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
	const target = await resolveGrillTarget(args, ctx, options.editorTitle);
	if (target.trim().length === 0) {
		notify(ctx, options.emptyTargetMessage, "warning");
		return;
	}

	let skillBlock: string | undefined;
	try {
		skillBlock = (await expandRepoSkillBlock({ cwd: ctx.cwd, skillName: options.skillName })).block;
	} catch {
		notify(ctx, options.expansionFailureMessage, "warning");
	}

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
