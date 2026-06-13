import { listSdlCommands, type SdlCommandInfo } from "@asdl/sdl/cli";
import { createRealSdlCommandContext } from "@asdl/sdl/context";
import { runCp } from "@asdl/sdl/cp-command";

import { registerCliCommandExtension, selectCliCommands, type CliCommandRunDeps, type ExtensionAPI } from "./cli-command-extension.ts";
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
		notes: "Pi command is registered through registerCliCommandExtension and delegates to the shared SDL cp command-module runner.",
	},
] as const);

export default function sdlExtension(pi: ExtensionAPI): void {
	registerCliCommandExtension(pi, {
		cliName: "sdl",
		piNamespace: "sdl",
		commands: selectSdlCommands(SDL_COMMAND_NAMES),
		runCli: runSdlCpCommand,
	});
}

async function runSdlCpCommand(args: readonly string[], deps: CliCommandRunDeps): Promise<number> {
	if (args.length !== 1 || args[0] !== "cp") {
		deps.stderr("sdl cp does not accept arguments.\n");
		return 2;
	}

	const result = await runCp(createRealSdlCommandContext({ cwd: deps.cwd, env: deps.env }));
	if (result.ok) {
		deps.stdout(`${result.message}\n`);
		return 0;
	}
	deps.stderr(`${result.message}\n`);
	return result.exitCode;
}

function selectSdlCommands(names: readonly string[]): SdlCommandInfo[] {
	return selectCliCommands({
		availableCommands: listSdlCommands(),
		names,
		missingCommandLabel: "sdl",
	});
}
