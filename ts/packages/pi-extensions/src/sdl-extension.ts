import { listSdlCommands, runCli, type SdlCommandInfo } from "@asdl/sdl/cli";

import { registerCliCommandExtension, type ExtensionAPI } from "./cli-command-extension.ts";
import { definePiSurfaceParity } from "./parity.ts";

const SDL_COMMAND_NAMES = ["cp"] as const;

export const sdlExtensionParity = definePiSurfaceParity([
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
		notes: "Pi command is registered through registerCliCommandExtension and delegates to the native sdl checkpoint command.",
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
	const commandsByName = new Map(listSdlCommands().map((command) => [command.name, command]));
	return names.map((name) => {
		const command = commandsByName.get(name);
		if (command === undefined) {
			throw new Error(`Missing sdl command: ${name}`);
		}
		return command;
	});
}
