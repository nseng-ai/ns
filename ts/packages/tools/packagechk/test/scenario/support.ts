import type { ConfirmationResult } from "@ji/clinkr";
import { createScenarioClinkrInteraction } from "@ji/clinkr/testing";
import { optionalEntries, optionalEntry } from "@ji/core/primitives";

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
		...optionalEntries({ interaction: deps.interaction, confirmations }),
	});
	const code = await runCli(args, {
		...cliDeps,
		...optionalEntry("interaction", scenarioInteraction.depsInteraction),
		stdout: (text) => stdout.push(text),
		stderr: (text) => stderr.push(text),
	});
	scenarioInteraction.assertComplete();
	return { code, stdout: stdout.join(""), stderr: stderr.join("") };
}
