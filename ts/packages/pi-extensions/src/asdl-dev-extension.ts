import { listAsdlDevCommands, runCli, type AsdlDevCommandInfo } from "asdl-dev/src/cli.ts";

import { registerCliCommandExtension, type ExtensionAPI } from "./cli-command-extension.ts";

const DEV_COMMAND_NAMES = ["preview-url"] as const;
const CODE_COMMAND_NAMES = ["cp", "submit"] as const;

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
