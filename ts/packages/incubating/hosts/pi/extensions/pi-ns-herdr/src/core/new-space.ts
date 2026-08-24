import {
	formatHerdrResourceLabel,
	HERDR_SPACE_NEW_COMMAND_NAME,
	slotLabelInput,
	type HerdrGateway,
} from "@nseng-ai/herdr/api";
import type { CommandContext } from "@nseng-ai/extension-kit/pi-types";
import { optionalEntry } from "@nseng-ai/foundation/primitives";

export interface HerdrResourceLabelDeriver {
	deriveLabel(input: {
		description: string;
		cwd: string;
		presentModelWarning: (message: string) => void;
		signal?: AbortSignal;
	}): Promise<string>;
}

export interface HandleHerdrNewSpaceOptions {
	herdr: Pick<HerdrGateway, "createWorkspace">;
	labelDeriver: HerdrResourceLabelDeriver;
	args: string;
	ctx: CommandContext;
	notifyProgress: (message: string) => void;
}

export async function handleHerdrNewSpace(options: HandleHerdrNewSpaceOptions): Promise<void> {
	const description = options.args.trim();
	let label: string | undefined;
	if (description.length > 0) {
		options.notifyProgress("Deriving a semantic label for the new Herdr space…");
		try {
			const semanticLabel = await options.labelDeriver.deriveLabel({
				description,
				cwd: options.ctx.cwd,
				presentModelWarning: (message) => options.ctx.ui.notify(message, "warning"),
			});
			label = formatHerdrResourceLabel({
				semanticLabel,
				...slotLabelInput(options.ctx.cwd),
			});
		} catch (error) {
			options.ctx.ui.notify(formatLabelError(error), "error");
			return;
		}
	}

	options.ctx.ui.setStatus?.(HERDR_SPACE_NEW_COMMAND_NAME, "opening Herdr space…");
	try {
		const created = await options.herdr.createWorkspace({
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
				? `Opened Herdr space at ${options.ctx.cwd}.`
				: `Opened Herdr space ${label} at ${options.ctx.cwd}.`,
			"info",
		);
	} finally {
		options.ctx.ui.setStatus?.(HERDR_SPACE_NEW_COMMAND_NAME, undefined);
	}
}

function formatLabelError(error: unknown): string {
	const detail = error instanceof Error ? error.message : String(error);
	return `Could not derive a label for the new Herdr space. No space was created.\n${detail}`;
}
