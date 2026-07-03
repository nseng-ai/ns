import { runCli, type SdlCommandInfo } from "@ji/kernel/cli";
import { PUSH_COMMAND_SUMMARY } from "../ji/commands/push.ts";

import {
	registerCliCommandExtension,
	type CliCommandExtensionAPI,
} from "@ji/pi/commands/cli-extension";
import { definePiSurfaceParity } from "@ji/pi/parity/extension";

export type SdlExtensionAPI = CliCommandExtensionAPI;

type FlowCommandInfo = SdlCommandInfo & {
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

const SDL_FLOW_COMMANDS = [
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

export const sdlExtensionParity = definePiSurfaceParity(
	SDL_FLOW_COMMANDS.map((command) => ({
		kind: "command" as const,
		surface: `ns:flow:${command.name}`,
		workflow: command.description.replace(/\.$/, ""),
		parity: "FULL" as const,
		cli: `ns ${command.displayName}`,
		ownerObjective: "cross-harness-parity",
		sourcePackage: "@ji/flow/pi" as const,
		sourceModule: "sdl-extension",
		notes: `Pi command delegates to ns ${command.displayName} through registerCliCommandExtension; flat lifecycle mirrors are intentionally not registered.`,
	})),
);

export interface SdlExtensionOptions {
	/**
	 * Seam for the SDL CLI runner. Defaults to the real {@link runCli}, which
	 * discovers and dynamically imports project-local `.ns/extensions` commands.
	 * Tests inject a fake to exercise the Pi command bridge (argv routing and
	 * output rendering) without standing up a temporary SDL extension project.
	 */
	runCli?: typeof runCli;
}

export default function sdlExtension(pi: SdlExtensionAPI, options: SdlExtensionOptions = {}): void {
	registerCliCommandExtension(pi, {
		cliName: "ns",
		piNamespace: "ns:flow",
		commands: SDL_FLOW_COMMANDS,
		runCli: options.runCli ?? runCli,
	});
}
