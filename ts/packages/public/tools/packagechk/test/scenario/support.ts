import type { ConfirmationResult } from "@nseng-ai/clinkr";
import { createScenarioClinkrInteraction } from "@nseng-ai/clinkr/testing";
import { optionalEntries, optionalEntry } from "@nseng-ai/foundation/primitives";

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
