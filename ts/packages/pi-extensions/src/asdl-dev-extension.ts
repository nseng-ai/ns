import { listAsdlDevCommands, runCli, type AsdlDevCommandInfo } from "asdl-dev/cli";

import { registerCliCommandExtension, type ExtensionAPI } from "./cli-command-extension.ts";
import { definePiSurfaceParity } from "./parity.ts";

const DEV_COMMAND_NAMES = ["preview-url"] as const;
const CODE_COMMAND_NAMES = ["cp", "submit", "pr-regen"] as const;

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
		surface: "code:cp",
		workflow: "Create a checkpoint commit for the current diff",
		parity: "FULL",
		cli: "asdl-dev cp",
		skill: "code-checkpoint",
		ownerObjective: "cross-harness-parity",
		sourcePackage: "@asdl/pi-extensions",
		sourceModule: "asdl-dev-extension",
		notes: "Pi command is registered through the code namespace mirror of the asdl-dev CLI checkpoint command.",
	},
	{
		kind: "command",
		surface: "code:submit",
		workflow: "Checkpoint outstanding changes, then submit the current Graphite stack",
		parity: "FULL",
		cli: "asdl-dev submit",
		skill: "code-submit",
		ownerObjective: "cross-harness-parity",
		sourcePackage: "@asdl/pi-extensions",
		sourceModule: "asdl-dev-extension",
		notes: "Pi command is registered through the code namespace mirror of the asdl-dev CLI submit command.",
	},
	{
		kind: "command",
		surface: "code:pr-regen",
		workflow: "Regenerate the current branch PR title and description",
		parity: "FULL",
		cli: "asdl-dev pr-regen",
		skill: "code-submit",
		ownerObjective: "cross-harness-parity",
		sourcePackage: "@asdl/pi-extensions",
		sourceModule: "asdl-dev-extension",
		notes: "Pi command delegates to asdl-dev pr-regen; the code-submit skill documents the PR description regeneration operation.",
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
		piNamespace: "code",
		commands: selectAsdlDevCommands(CODE_COMMAND_NAMES),
		runCli,
	});
}

function selectAsdlDevCommands(names: readonly string[]): AsdlDevCommandInfo[] {
	const commandsByName = new Map(listAsdlDevCommands().map((command) => [command.name, command]));
	return names.map((name) => {
		const command = commandsByName.get(name);
		if (command === undefined) {
			throw new Error(`Missing asdl-dev command: ${name}`);
		}
		return command;
	});
}
