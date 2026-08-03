import {
	nsCommandSurface,
	specializedSkillBackedCommandsFromSpecs,
} from "@nseng-ai/foundation/command";

import { SQUASH_STACK_COMMAND_SUMMARY } from "../ns/commands/squash-stack.ts";

export interface FlowCommandSpec {
	readonly name: string;
	readonly description: string;
	readonly group: "flow";
	readonly argvPrefix: readonly ["flow", string];
	readonly displayName: string;
}

function flowCommand(name: string, description: string): FlowCommandSpec {
	return {
		name,
		description,
		group: "flow",
		argvPrefix: ["flow", name],
		displayName: `flow ${name}`,
	};
}

export const FLOW_COMMAND_SPECS = [
	flowCommand("changes", "Summarize outstanding worktree changes without committing."),
	flowCommand("cp", "Create a checkpoint commit for the current diff."),
	flowCommand("autobranch", "Create a Graphite branch from dirty worktree changes."),
	flowCommand(
		"branch-latest-commit",
		"Move the latest eligible commit to a new Graphite child branch.",
	),
	flowCommand(
		"autoslot",
		"Create a Graphite branch from current work, then move it into a managed slot worktree.",
	),
	flowCommand(
		"submit",
		"Checkpoint outstanding changes, then submit the configured branch or stack target.",
	),
	flowCommand(
		"generate-pr-inventory",
		"Generate and replace the current branch PR title and body.",
	),
	flowCommand("push", "Push committed non-Graphite branch work with git push."),
	flowCommand("land", "Land the configured current-PR or Graphite-stack target into trunk."),
	flowCommand(
		"pull-trunk",
		"Pull the Git trunk branch from its configured upstream without running full gt sync.",
	),
	flowCommand("squash-stack", SQUASH_STACK_COMMAND_SUMMARY),
] as const satisfies readonly FlowCommandSpec[];

export function nsFlowCommandSurface(name: string): string {
	if (!FLOW_COMMAND_SPECS.some((command) => command.name === name)) {
		throw new Error(`Unknown ns flow command: ${name}`);
	}
	return nsCommandSurface("flow", name);
}

export const flowSkillBackedCommandRegistrations = specializedSkillBackedCommandsFromSpecs([
	{ skillName: "ns-flow-autobranch", surface: nsFlowCommandSurface("autobranch") },
	{
		skillName: "ns-flow-branch-latest-commit",
		surface: nsFlowCommandSurface("branch-latest-commit"),
	},
	{ skillName: "ns-flow-cp", surface: nsFlowCommandSurface("cp") },
	{ skillName: "ns-flow-submit", surface: nsFlowCommandSurface("submit") },
]);
