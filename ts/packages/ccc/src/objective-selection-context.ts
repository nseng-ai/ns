import type { ObjectiveSelectionContext } from "@sdl/objective/api";
import type { CommandContext } from "./cmux/types.ts";

export function objectiveSelectionContextFromCommandContext(
	ctx: CommandContext,
): ObjectiveSelectionContext {
	const selectSource = ctx.ui.select;
	const select: ObjectiveSelectionContext["ui"]["select"] | undefined =
		selectSource === undefined
			? undefined
			: (title, options) => selectSource.call(ctx.ui, title, [...options]);
	const setStatus: ObjectiveSelectionContext["ui"]["setStatus"] | undefined =
		ctx.ui.setStatus?.bind(ctx.ui);

	return {
		cwd: ctx.cwd,
		hasUI: ctx.hasUI === true,
		ui: {
			notify: ctx.ui.notify.bind(ctx.ui),
			...(select === undefined ? {} : { select }),
			...(setStatus === undefined ? {} : { setStatus }),
		},
		waitForIdle: ctx.waitForIdle.bind(ctx),
	};
}
