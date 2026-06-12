import { runCli as runCccCli } from "@asdl/ccc/cli";

import { registerCliCommandExtension, type CliCommandRunDeps, type ExtensionAPI } from "./cli-command-extension.ts";

const AUTOBRANCH_COMMAND = {
	name: "autobranch",
	description: "Create a Graphite branch from current uncommitted changes, or from the latest commit when the worktree is clean",
} as const;

export type { ExtensionAPI };

export default function autobranchExtension(pi: ExtensionAPI): void {
	registerCliCommandExtension(pi, {
		cliName: "ccc",
		piNamespace: "code",
		commands: [AUTOBRANCH_COMMAND],
		runCli: runCccAutobranchCli,
	});
}

function runCccAutobranchCli(args: readonly string[], deps: CliCommandRunDeps): Promise<number> {
	return runCccCli(["exec", ...args], {
		cwd: deps.cwd,
		stdout: deps.stdout,
		stderr: deps.stderr,
		env: deps.env,
	});
}
