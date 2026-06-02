import { listAsdlDevCommands, runCli } from "asdl-dev/src/cli.ts";

import { registerCliCommandExtension, type ExtensionAPI } from "./cli-command-extension.ts";

export default function asdlDevExtension(pi: ExtensionAPI): void {
	registerCliCommandExtension(pi, {
		cliName: "asdl-dev",
		piNamespace: "dev",
		commands: listAsdlDevCommands(),
		runCli,
	});
}
