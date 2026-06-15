import { AUTOBRANCH_SUMMARY, runCli } from "@asdl/ccc/cli";

import { registerCliCommandExtension, type ExtensionAPI } from "./cli-command-extension.ts";
import { definePiSurfaceParity } from "./parity.ts";

export type { ExtensionAPI };

export const autobranchParity = definePiSurfaceParity([
	{
		kind: "command",
		surface: "code:autobranch",
		workflow: "Create a Graphite branch from dirty worktree changes or the latest unpushed commit",
		parity: "FULL",
		cli: "ccc exec autobranch",
		skill: "code-autobranch",
		ownerObjective: "cross-harness-parity",
		sourcePackage: "@asdl/pi-extensions",
		sourceModule: "autobranch",
		notes: "Pi command delegates to the CCC CLI autobranch operation through registerCliCommandExtension.",
	},
] as const);

export default function autobranchExtension(pi: ExtensionAPI): void {
	registerCliCommandExtension(pi, {
		cliName: "ccc",
		piNamespace: "code",
		commands: [
			{
				name: "autobranch",
				description: AUTOBRANCH_SUMMARY,
				startMessage: "Starting /code:autobranch — waiting for Pi idle, then creating a Graphite branch.",
			},
		],
		runCli: (args, deps) => runCli(["exec", ...args], deps),
	});
}
