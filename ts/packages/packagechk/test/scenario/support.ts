import type { ConfirmationResult } from "@asdl/clinkr";
import { createFakeClinkrInteraction } from "@asdl/clinkr/testing";

import { runCli, type CliDeps } from "../../src/cli.ts";

export interface CliRun {
	code: number;
	stdout: string;
	stderr: string;
}

export async function runPackagechk(
	args: readonly string[],
	deps: CliDeps & { confirmations?: readonly ConfirmationResult[] | undefined } = {},
): Promise<CliRun> {
	const stdout: string[] = [];
	const stderr: string[] = [];
	const fakeInteraction =
		deps.stdin === undefined && deps.interaction === undefined
			? createFakeClinkrInteraction({ confirmations: deps.confirmations })
			: undefined;
	const code = await runCli(args, {
		...deps,
		...(fakeInteraction === undefined ? {} : { interaction: fakeInteraction.interaction }),
		stdout: (text) => stdout.push(text),
		stderr: (text) => stderr.push(text),
	});
	fakeInteraction?.assertComplete();
	return { code, stdout: stdout.join(""), stderr: stderr.join("") };
}
