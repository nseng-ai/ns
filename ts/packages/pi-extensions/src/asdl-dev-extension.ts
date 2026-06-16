import { listAsdlDevCommands, runCli, type AsdlDevCommandInfo } from "asdl-dev/cli";

import { registerCliCommandExtension, selectCliCommands, type ExtensionAPI } from "./cli-command-extension.ts";
import { definePiSurfaceParity } from "./parity.ts";

const DEV_COMMAND_NAMES = ["preview-url"] as const;
const CODE_COMMAND_NAMES = ["pr-regen"] as const;

export const asdlDevExtensionParity = definePiSurfaceParity([
	{
		kind: "command",
		surface: "dev:preview-url",
		workflow: "Resolve the current Vercel preview URL",
		parity: "FULL",
		cli: "asdl-dev preview-url",
		skill: "dev-preview-url",
		ownerObjective: "cross-harness-parity",
		sourcePackage: "@asdl/pi-extensions",
		sourceModule: "asdl-dev-extension",
		notes: "Pi command is registered through registerCliCommandExtension and delegates to the asdl-dev CLI.",
	},
] as const);

export const asdlDevCodeExtensionParity = definePiSurfaceParity([
	{
		kind: "command",
		surface: "sdl:code:regenerate-pr",
		workflow: "Regenerate the current branch PR title and description",
		parity: "FULL",
		cli: "asdl-dev pr-regen",
		skill: "sdl-submit",
		ownerObjective: "cross-harness-parity",
		sourcePackage: "@asdl/pi-extensions",
		sourceModule: "asdl-dev-extension",
		notes: "Pi command exposes the SDL code-lifecycle surface while delegating to the remaining asdl-dev PR metadata implementation.",
	},
] as const);

export default function asdlDevExtension(pi: ExtensionAPI): void {
	registerCliCommandExtension(pi, {
		cliName: "asdl-dev",
		piNamespace: "dev",
		commands: selectAsdlDevCommands(DEV_COMMAND_NAMES),
		runCli,
	});
}

export function asdlDevCodeExtension(pi: ExtensionAPI): void {
	registerCliCommandExtension(pi, {
		cliName: "asdl-dev",
		piNamespace: "sdl:code",
		commands: selectAsdlDevCommands(CODE_COMMAND_NAMES),
		piCommandNameForCommand: () => "sdl:code:regenerate-pr",
		runCli,
	});
}

function selectAsdlDevCommands(names: readonly string[]): AsdlDevCommandInfo[] {
	return selectCliCommands({
		availableCommands: listAsdlDevCommands(),
		names,
		missingCommandLabel: "asdl-dev",
	});
}
