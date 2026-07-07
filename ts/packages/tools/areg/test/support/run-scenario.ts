import type { ConfirmationResult } from "@nseng-ai/clinkr";
import { createFakeClinkrInteraction, type FakeClinkrInteraction } from "@nseng-ai/clinkr/testing";
import { optionalEntries } from "@nseng-ai/foundation/primitives";
import {
	InMemoryGitGateway,
	type InMemoryGitGatewayState,
} from "@nseng-ai/capability-kit/git/testing";

import { runCli, type CliDeps } from "../../src/cli.ts";
import type { AregCliContext } from "../../src/context.ts";
import {
	FakeAregProjectGateway,
	type FakeAregProjectGatewayOptions,
} from "../../src/fake-gateways.ts";

export interface ScenarioRunOptions {
	context?: AregCliContext;
	project?: FakeAregProjectGatewayOptions;
	git?: InMemoryGitGatewayState;
	confirmations?: readonly ConfirmationResult[];
	isInteractive?: boolean;
	cwd?: string;
	env?: NodeJS.ProcessEnv;
}

export interface ScenarioRun {
	exit: Promise<number>;
	stdout: string[];
	stderr: string[];
}

export function createScenarioFakeClinkrInteraction(
	options: {
		confirmations?: readonly ConfirmationResult[];
		isInteractive?: boolean;
	} = {},
): FakeClinkrInteraction {
	return createFakeClinkrInteraction({
		...optionalEntries({
			confirmations: options.confirmations,
			isInteractive: options.isInteractive,
		}),
	});
}

export function runScenario(
	args: readonly string[],
	options: ScenarioRunOptions = {},
): ScenarioRun {
	const stdout: string[] = [];
	const stderr: string[] = [];
	const cwd = options.cwd ?? "/repo";
	const env = options.env ?? { PATH: "/fake/bin" };
	const fakeInteraction = createScenarioFakeClinkrInteraction(options);
	const context =
		options.context ??
		({
			project: new FakeAregProjectGateway(options.project),
			git: new InMemoryGitGateway(options.git),
			interaction: fakeInteraction.interaction,
			cwd,
			env,
		} satisfies AregCliContext);
	const deps: CliDeps = {
		context,
		cwd,
		env,
		stdout: (text) => stdout.push(text),
		stderr: (text) => stderr.push(text),
	};
	return {
		exit: runCli(args, deps).then((code) => {
			fakeInteraction.assertComplete();
			return code;
		}),
		stdout,
		stderr,
	};
}
