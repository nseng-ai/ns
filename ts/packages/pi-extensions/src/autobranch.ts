import { AUTOBRANCH_SUMMARY, runCli } from "@asdl/ccc/cli";

import { registerCliCommandExtension, type ExtensionAPI } from "./cli-command-extension.ts";

export type { ExtensionAPI };

export default function autobranchExtension(pi: ExtensionAPI): void {
	registerCliCommandExtension(pi, {
		cliName: "ccc",
		piNamespace: "code",
		commands: [{ name: "autobranch", description: AUTOBRANCH_SUMMARY }],
		runCli: (args, deps) => runCli(["exec", ...args], deps),
	});
}
