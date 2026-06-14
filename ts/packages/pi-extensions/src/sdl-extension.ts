import { listSdlCommands, runCli, type SdlCommandInfo } from "@asdl/sdl/cli";

import { registerCliCommandExtension, selectCliCommands, type ExtensionAPI } from "./cli-command-extension.ts";
import { definePiSurfaceParity } from "./parity.ts";

const SDL_COMMAND_NAMES = ["changes", "cp", "submit"] as const;

export const sdlExtensionParity = definePiSurfaceParity([
	{
		kind: "command",
		surface: "sdl:changes",
		workflow: "Summarize outstanding worktree changes without committing",
		parity: "FULL",
		cli: "sdl changes",
		ownerObjective: "cross-harness-parity",
		sourcePackage: "@asdl/pi-extensions",
		sourceModule: "sdl-extension",
		notes: "Pi command delegates to the built-in SDL changes command through registerCliCommandExtension.",
	},
	{
		kind: "command",
		surface: "sdl:cp",
		workflow: "Create a checkpoint commit for the current diff",
		parity: "FULL",
		cli: "sdl cp",
		skill: "code-checkpoint",
		ownerObjective: "cross-harness-parity",
		sourcePackage: "@asdl/pi-extensions",
		sourceModule: "sdl-extension",
		notes: "Pi command is registered through registerCliCommandExtension and delegates to the shared SDL cp command-module runner.",
	},
	{
		kind: "command",
		surface: "sdl:submit",
		workflow: "Checkpoint outstanding changes, then submit the current Graphite stack",
		parity: "FULL",
		cli: "sdl submit",
		skill: "sdl-submit",
		ownerObjective: "cross-harness-parity",
		sourcePackage: "@asdl/pi-extensions",
		sourceModule: "sdl-extension",
		notes: "Pi command delegates to the built-in SDL submit command through registerCliCommandExtension.",
	},
] as const);

export default function sdlExtension(pi: ExtensionAPI): void {
	registerCliCommandExtension(pi, {
		cliName: "sdl",
		piNamespace: "sdl",
		commands: selectSdlCommands(SDL_COMMAND_NAMES),
		runCli,
	});
}

function selectSdlCommands(names: readonly string[]): SdlCommandInfo[] {
	return selectCliCommands({
		availableCommands: listSdlCommands(),
		names,
		missingCommandLabel: "sdl",
	});
}
