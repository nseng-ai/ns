// Slot intentionally exports a mountable command face rather than a standalone
// `defineCli` entrypoint. The supported user-facing surface is `ns slot ...`,
// so root CLI metadata such as `--version` and `--runtime` stays owned by
// `@nseng-ai/sdk` instead of this extension package.
import { ClinkrGroup, type ClinkrCommandSpec } from "@nseng-ai/clinkr";
import { optionalEntry } from "@nseng-ai/foundation/primitives";
import type { z } from "zod";

import type { SlotCliContext } from "../core/context.ts";
import { checkoutBranchesCompletionProviderFor } from "./checkout-completion.ts";
import {
	slotCommandBaseSpec,
	slotCommandSpecs,
	type SlotCommandSpec,
	type SlotCommandGroup,
} from "./slot-command-specs.ts";

export function buildSlotCommandGroup<TContext extends SlotCliContext>(): ClinkrGroup<TContext> {
	const group = new ClinkrGroup<TContext>({
		name: "slot",
		description: "Manage the pool of Git-worktree-backed slots.",
	});
	configureSlotCommands(group);
	return group;
}

function configureSlotCommands<TContext extends SlotCliContext>(root: ClinkrGroup<TContext>): void {
	const groups = groupSlotCommandSpecs();
	for (const spec of groups.root) addCommand(root, spec);
	root.group(buildProvisionGroup(groups));
	root.group(buildGtGroup(groups));
}

function groupSlotCommandSpecs(): Record<SlotCommandGroup, SlotCommandSpec[]> {
	return slotCommandSpecs.reduce<Record<SlotCommandGroup, SlotCommandSpec[]>>(
		(groups, spec) => {
			groups[spec.group].push(spec);
			return groups;
		},
		{ root: [], provision: [], gt: [], "gt-exec": [] },
	);
}

function buildProvisionGroup<TContext extends SlotCliContext>(
	groups: Record<SlotCommandGroup, SlotCommandSpec[]>,
): ClinkrGroup<TContext> {
	const provision = new ClinkrGroup<TContext>({
		name: "provision",
		description: "Copy declared gitignored files between the per-repo store and slot worktrees.",
	});
	for (const spec of groups.provision) addCommand(provision, spec);
	return provision;
}

function buildGtGroup<TContext extends SlotCliContext>(
	groups: Record<SlotCommandGroup, SlotCommandSpec[]>,
): ClinkrGroup<TContext> {
	const gt = new ClinkrGroup<TContext>({
		name: "gt",
		description:
			"Navigate and free Graphite-aware slot stacks; metadata-backed stack commands require the sqlite3 CLI.",
	});
	for (const spec of groups.gt) addCommand(gt, spec);
	const exec = new ClinkrGroup<TContext>({
		name: "exec",
		description: "Skill-invoked Graphite operations.",
		isHidden: true,
	});
	for (const spec of groups["gt-exec"]) addCommand(exec, spec);
	gt.group(exec);
	return gt;
}

function addCommand<TContext extends SlotCliContext>(
	group: ClinkrGroup<TContext>,
	spec: SlotCommandSpec,
): void {
	const completionProvider = checkoutBranchesCompletionProviderFor<TContext>({
		completionKind: spec.completionKind,
		gitFromContext: (ctx) => ctx.git,
	});
	const commandSpec: ClinkrCommandSpec<TContext, z.ZodObject, unknown> = {
		...slotCommandBaseSpec(spec),
		...optionalEntry("completionProvider", completionProvider),
	};
	group.command(commandSpec);
}
