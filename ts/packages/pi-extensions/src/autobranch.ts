import { AUTOBRANCH_SUMMARY, runCli } from "@asdl/ccc/cli";

import {
	registerCliCommandExtension,
	type CliCommandExtensionAPI,
} from "./cli-command-extension.ts";
import { definePiSurfaceParity } from "./parity.ts";

export type { CliCommandExtensionAPI };

export const autobranchParity = definePiSurfaceParity([
	{
		kind: "command",
		surface: "sdl:code:autobranch",
		workflow: "Create a Graphite branch from dirty worktree changes or the latest unpushed commit",
		parity: "FULL",
		cli: "ccc exec autobranch",
		skill: "code-autobranch",
		ownerObjective: "cross-harness-parity",
		sourcePackage: "@asdl/pi-extensions",
		sourceModule: "autobranch",
		notes:
			"Pi command exposes the SDL code-lifecycle surface while delegating to the CCC CLI autobranch operation through registerCliCommandExtension.",
	},
] as const);

export default function autobranchExtension(pi: CliCommandExtensionAPI): void {
	registerCliCommandExtension(pi, {
		cliName: "ccc",
		piNamespace: "sdl:code",
		commands: [
			{
				name: "autobranch",
				description: AUTOBRANCH_SUMMARY,
				startMessage:
					"Starting /sdl:code:autobranch — runs once Pi finishes its current response, then creates a Graphite branch. Interrupt Pi to run it now.",
			},
		],
		runCli: (args, deps) => runCli(["exec", ...args], deps),
	});
}
