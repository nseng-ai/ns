import {
	nsCommandSurface,
	specializedSkillBackedCommandsFromSpecs,
} from "@nseng-ai/foundation/command";

import { SQUASH_STACK_COMMAND_SUMMARY } from "../ns/commands/squash-stack.ts";

export type FlowCommandProvider = "graphite" | "gh-stack";

export interface FlowCommandSpec {
	/** Stable identity independent of the command's leaf name or route depth. */
	readonly id: string;
	readonly name: string;
	readonly description: string;
	readonly group: "flow";
	readonly provider?: FlowCommandProvider;
	readonly argvPrefix: readonly string[];
	readonly displayName: string;
	readonly piSurface: string;
}

function directFlowCommand(name: string, description: string): FlowCommandSpec {
	return {
		id: `flow:${name}`,
		name,
		description,
		group: "flow",
		argvPrefix: ["flow", name],
		displayName: `flow ${name}`,
		piSurface: nsCommandSurface("flow", name),
	};
}

function providerFlowCommand(
	provider: FlowCommandProvider,
	namespace: "gt" | "gs",
	name: string,
	description: string,
): FlowCommandSpec {
	return {
		id: `flow:${namespace}:${name}`,
		name,
		description,
		group: "flow",
		provider,
		argvPrefix: ["flow", namespace, name],
		displayName: `flow ${namespace} ${name}`,
		piSurface: nsCommandSurface("flow", `${namespace}:${name}`),
	};
}

const changesCommand = directFlowCommand(
	"changes",
	"Summarize outstanding worktree changes without committing.",
);
const cpCommand = directFlowCommand("cp", "Create a checkpoint commit for the current diff.");
function graphiteFlowCommand(name: string, description: string): FlowCommandSpec {
	return providerFlowCommand("graphite", "gt", name, description);
}

function ghStackFlowCommand(name: string, description: string): FlowCommandSpec {
	return providerFlowCommand("gh-stack", "gs", name, description);
}

const autobranchCommand = graphiteFlowCommand(
	"autobranch",
	"Create a Graphite branch from dirty worktree changes.",
);
const branchLatestCommitCommand = graphiteFlowCommand(
	"branch-latest-commit",
	"Move the latest eligible commit to a new Graphite child branch.",
);
const ghStackAutobranchCommand = ghStackFlowCommand(
	"autobranch",
	"Create a branch from dirty worktree changes with the official github/gh-stack extension.",
);
const ghStackBranchLatestCommitCommand = ghStackFlowCommand(
	"branch-latest-commit",
	"Move the latest eligible commit to a new child with the official github/gh-stack extension.",
);
const autoslotCommand = graphiteFlowCommand(
	"autoslot",
	"Create a Graphite branch from current work, then move it into a managed slot worktree.",
);
const ghStackAutoslotCommand = ghStackFlowCommand(
	"autoslot",
	"Create a branch from current work with the official github/gh-stack extension, then move it into a managed slot worktree.",
);
export const FLOW_SUBMIT_COMMAND_SPEC = graphiteFlowCommand(
	"submit",
	"Checkpoint outstanding changes, then submit the current Graphite stack.",
);
const generatePrInventoryCommand = directFlowCommand(
	"generate-pr-inventory",
	"Generate and replace the current branch PR title and body.",
);
const pushCommand = directFlowCommand(
	"push",
	"Push committed non-Graphite branch work with git push.",
);
const landCommand = graphiteFlowCommand(
	"land",
	"Land the current PR or Graphite stack into trunk.",
);
const pullTrunkCommand = directFlowCommand(
	"pull-trunk",
	"Pull the Git trunk branch from its configured upstream without running full gt sync.",
);
const squashStackCommand = graphiteFlowCommand("squash-stack", SQUASH_STACK_COMMAND_SUMMARY);

export const FLOW_COMMAND_SPECS = [
	changesCommand,
	cpCommand,
	autobranchCommand,
	branchLatestCommitCommand,
	ghStackAutobranchCommand,
	ghStackBranchLatestCommitCommand,
	autoslotCommand,
	ghStackAutoslotCommand,
	FLOW_SUBMIT_COMMAND_SPEC,
	generatePrInventoryCommand,
	pushCommand,
	landCommand,
	pullTrunkCommand,
	squashStackCommand,
] as const satisfies readonly FlowCommandSpec[];

export const flowSkillBackedCommandRegistrations = specializedSkillBackedCommandsFromSpecs([
	{ skillName: "ns-flow-gt-autobranch", surface: autobranchCommand.piSurface },
	{
		skillName: "ns-flow-gt-branch-latest-commit",
		surface: branchLatestCommitCommand.piSurface,
	},
	{ skillName: "ns-flow-gs-autobranch", surface: ghStackAutobranchCommand.piSurface },
	{
		skillName: "ns-flow-gs-branch-latest-commit",
		surface: ghStackBranchLatestCommitCommand.piSurface,
	},
	{ skillName: "ns-flow-cp", surface: cpCommand.piSurface },
	{ skillName: "ns-flow-submit", surface: FLOW_SUBMIT_COMMAND_SPEC.piSurface },
]);
