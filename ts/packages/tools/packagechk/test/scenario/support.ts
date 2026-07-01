import type { ConfirmationResult } from "@sdl/clinkr";
import { createScenarioClinkrInteraction } from "@sdl/clinkr/testing";

import { runCli, type CliDeps } from "../../src/cli.ts";

export interface CliRun {
	code: number;
	stdout: string;
	stderr: string;
}

export async function runPackagechk(
	args: readonly string[],
	deps: CliDeps & { confirmations?: readonly ConfirmationResult[] } = {},
): Promise<CliRun> {
	const stdout: string[] = [];
	const stderr: string[] = [];
	const { confirmations, ...cliDeps } = deps;
	const scenarioInteraction = createScenarioClinkrInteraction({
		hasStdin: deps.stdin !== undefined,
		...(deps.interaction === undefined ? {} : { interaction: deps.interaction }),
		...(confirmations === undefined ? {} : { confirmations }),
	});
	const code = await runCli(args, {
		...cliDeps,
		...(scenarioInteraction.depsInteraction === undefined
			? {}
			: { interaction: scenarioInteraction.depsInteraction }),
		stdout: (text) => stdout.push(text),
		stderr: (text) => stderr.push(text),
	});
	scenarioInteraction.assertComplete();
	return { code, stdout: stdout.join(""), stderr: stderr.join("") };
}
