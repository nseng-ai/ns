// Slot intentionally exports a mountable command face rather than a standalone
// `defineCli` entrypoint. The supported user-facing surface is `ns slot ...`,
// so root CLI metadata such as `--version` and `--runtime` stays owned by
// `@nseng-ai/kernel` instead of this capability package.
import {
	ClinkrGroup,
	type ClinkrCommandSpec,
	type ClinkrDynamicCompletionProvider,
} from "@nseng-ai/clinkr";
import type { z } from "zod";

import type { SlotCliContext } from "../core/context.ts";
import { completeCheckoutBranchesFromGit } from "./checkout-completion.ts";
import { slotCommandSpecs, type SlotCommandSpec } from "./slot-command-specs.ts";

export function buildSlotCommandGroup<TContext extends SlotCliContext>(): ClinkrGroup<TContext> {
	const group = new ClinkrGroup<TContext>({
		name: "slot",
		description: "Manage the pool of Git-worktree-backed slots.",
	});
	configureSlotCommands(group);
	return group;
}

function configureSlotCommands<TContext extends SlotCliContext>(root: ClinkrGroup<TContext>): void {
	for (const spec of slotCommandSpecs) {
		if (spec.group === "root") addCommand(root, spec);
	}
	root.group(buildGtGroup());
}

function buildGtGroup<TContext extends SlotCliContext>(): ClinkrGroup<TContext> {
	const gt = new ClinkrGroup<TContext>({
		name: "gt",
		description:
			"Navigate and free Graphite-aware slot stacks; metadata-backed stack commands require the sqlite3 CLI.",
	});
	for (const spec of slotCommandSpecs) {
		if (spec.group === "gt") addCommand(gt, spec);
	}
	const exec = new ClinkrGroup<TContext>({
		name: "exec",
		description: "Skill-invoked Graphite operations.",
		isHidden: true,
	});
	for (const spec of slotCommandSpecs) {
		if (spec.group === "gt-exec") addCommand(exec, spec);
	}
	gt.group(exec);
	return gt;
}

function addCommand<TContext extends SlotCliContext>(
	group: ClinkrGroup<TContext>,
	spec: SlotCommandSpec,
): void {
	const completionProvider = completionProviderFor<TContext>(spec);
	const commandSpec: ClinkrCommandSpec<TContext, z.ZodObject, unknown> = {
		name: spec.name,
		...(spec.summary === undefined ? {} : { summary: spec.summary }),
		...(spec.description === undefined ? {} : { description: spec.description }),
		schema: spec.schema,
		...(spec.positionals === undefined ? {} : { positionals: spec.positionals }),
		...(spec.options === undefined ? {} : { options: spec.options }),
		...(completionProvider === undefined ? {} : { completionProvider }),
		...(spec.resultSchema === undefined ? {} : { resultSchema: spec.resultSchema }),
		handler: spec.handler,
		...(spec.renderHuman === undefined ? {} : { renderHuman: spec.renderHuman }),
		...(spec.renderMarkdown === undefined ? {} : { renderMarkdown: spec.renderMarkdown }),
	};
	group.command(commandSpec);
}

function completionProviderFor<TContext extends SlotCliContext>(
	spec: SlotCommandSpec,
): ClinkrDynamicCompletionProvider<TContext> | undefined {
	if (spec.completionKind !== "checkout-branches") return undefined;
	return async (ctx, request) => await completeCheckoutBranchesFromGit(ctx.git, request);
}
