import {
	formatHerdrResourceLabel,
	HERDR_SPACE_NEW_COMMAND_NAME,
	type HerdrGateway,
} from "@nseng-ai/herdr/api";
import type { ContentSlugResult } from "@nseng-ai/extension-kit/content-slug";
import type { CommandContext } from "@nseng-ai/extension-kit/pi-types";
import { optionalEntry } from "@nseng-ai/foundation/primitives";

import type { HerdrSlotLabelInputResolver } from "./resource-label.ts";

export interface HerdrResourceLabelDeriver {
	deriveLabel(input: {
		description: string;
		cwd: string;
		signal?: AbortSignal;
	}): Promise<ContentSlugResult>;
}

export interface HandleHerdrNewSpaceOptions {
	herdr: Pick<HerdrGateway, "createWorkspace">;
	labelDeriver: HerdrResourceLabelDeriver;
	resolveSlotLabelInput: HerdrSlotLabelInputResolver;
	args: string;
	ctx: CommandContext;
	notifyProgress: (message: string) => void;
}

export async function handleHerdrNewSpace(options: HandleHerdrNewSpaceOptions): Promise<void> {
	const description = options.args.trim();
	let label: string | undefined;
	if (description.length > 0) {
		options.notifyProgress("Deriving a semantic label for the new Herdr space…");
		const semanticLabel = await options.labelDeriver.deriveLabel({
			description,
			cwd: options.ctx.cwd,
		});
		if (!semanticLabel.ok) {
			options.ctx.ui.notify(formatLabelError(semanticLabel.error.message), "error");
			return;
		}
		const slotLabelInput = await options.resolveSlotLabelInput(options.ctx.cwd);
		label = formatHerdrResourceLabel({
			semanticLabel: semanticLabel.value.slug,
			...slotLabelInput,
		});
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

function formatLabelError(detail: string): string {
	return `Could not derive a label for the new Herdr space. No space was created.\n${detail}`;
}
