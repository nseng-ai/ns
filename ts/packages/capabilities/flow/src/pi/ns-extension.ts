import { nsCommandSurface } from "@nseng-ai/foundation/command";
import { runCli, type NsCommandInfo } from "@nseng-ai/ns/kernel/cli";
import { PUSH_COMMAND_SUMMARY } from "../ns/commands/push.ts";

import {
	registerCliCommandExtension,
	type CliCommandExtensionAPI,
} from "@nseng-ai/pi/commands/cli-extension";
import { definePiSurfaceParity } from "@nseng-ai/pi/parity/extension";

export type NsExtensionAPI = CliCommandExtensionAPI;

type FlowCommandInfo = NsCommandInfo & {
	argvPrefix: readonly ["flow", string];
	displayName: string;
};

function flowCommand(name: string, description: string): FlowCommandInfo {
	return {
		name,
		description,
		group: "flow",
		argvPrefix: ["flow", name],
		displayName: `flow ${name}`,
	};
}

const NS_FLOW_COMMANDS = [
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
	flowCommand("submit", "Checkpoint outstanding changes, then submit the current Graphite stack."),
	flowCommand("regenerate-pr", "Regenerate the current branch PR title and description."),
	flowCommand("push", PUSH_COMMAND_SUMMARY),
	flowCommand("land", "Land the current PR or Graphite stack into trunk."),
	flowCommand(
		"pull-trunk",
		"Pull the configured Graphite trunk branch without running full gt sync.",
	),
] as const satisfies readonly FlowCommandInfo[];

export function nsFlowCommandSurface(name: string): string {
	if (!NS_FLOW_COMMANDS.some((command) => command.name === name)) {
		throw new Error(`Unknown ns flow command: ${name}`);
	}
	return nsCommandSurface("flow", name);
}

export const nsExtensionParity = definePiSurfaceParity(
	NS_FLOW_COMMANDS.map((command) => ({
		kind: "command" as const,
		surface: nsFlowCommandSurface(command.name),
		workflow: command.description.replace(/\.$/, ""),
		parity: "FULL" as const,
		cli: `ns ${command.displayName}`,
		ownerObjective: "cross-harness-parity",
		sourcePackage: "@nseng-ai/flow/pi" as const,
		sourceModule: "ns-extension",
		notes: `Pi command delegates to ns ${command.displayName} through registerCliCommandExtension; flat lifecycle mirrors are intentionally not registered.`,
	})),
);

export interface NsExtensionOptions {
	/**
	 * Seam for the ns CLI runner. Defaults to the real {@link runCli}, which
	 * discovers and dynamically imports project-local `.ns/extensions` commands.
	 * Tests inject a fake to exercise the Pi command bridge (argv routing and
	 * output rendering) without standing up a temporary ns extension project.
	 */
	runCli?: typeof runCli;
}

export default function nsExtension(pi: NsExtensionAPI, options: NsExtensionOptions = {}): void {
	registerCliCommandExtension(pi, {
		cliName: "ns",
		piNamespace: "ns:flow",
		commands: NS_FLOW_COMMANDS,
		runCli: options.runCli ?? runCli,
	});
}
