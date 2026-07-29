import { CREATE_FOCUS_QUESTION } from "./command-constants.ts";
import type { CommandContext, ExtensionAPI } from "./runtime-types.ts";

export async function resolveCreateFocus(
	pi: ExtensionAPI,
	rawArgs: string,
	ctx: CommandContext,
): Promise<string | undefined> {
	const focus = rawArgs.trim();
	if (focus.length > 0) {
		return focus;
	}

	if (ctx.hasUI && ctx.ui.input !== undefined) {
		const response = await ctx.ui.input(CREATE_FOCUS_QUESTION);
		const promptedFocus = response?.trim() ?? "";
		if (promptedFocus.length > 0) {
			return promptedFocus;
		}
		ctx.ui.notify("Continuation focus is required to create a handoff.", "warning");
		return undefined;
	}

	pi.sendUserMessage(
		`Ask the user exactly this question before creating a handoff: ${CREATE_FOCUS_QUESTION}\n\nDo not create a handoff until the user answers with a meaningful continuation focus.`,
	);
	return undefined;
}
