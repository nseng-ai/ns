import { runCli, type CliDeps } from "../../src/cli.ts";
import type { PrAddressContext } from "../../src/context.ts";
import type { LegacyPrAddressGateway } from "../../src/legacy-python.ts";
import type { PayloadClock } from "../../src/payload-store.ts";
import { InMemoryLegacyPrAddressGateway } from "./in-memory-legacy-pr-address-gateway.ts";
import { fakePrAddressContext } from "./in-memory-pr-address-gateways.ts";

export interface ScenarioRunOptions {
	github?: PrAddressContext["github"] | undefined;
	git?: PrAddressContext["git"] | undefined;
	payloadClock?: PayloadClock | undefined;
	env?: NodeJS.ProcessEnv | undefined;
	cwd?: string | undefined;
	stdin?: string | (() => Promise<string>) | undefined;
	operations?: CliDeps["operations"] | undefined;
}

export interface ScenarioRun {
	exit: Promise<number>;
	stdout: string[];
	stderr: string[];
}

export interface ScenarioRunWithLegacy extends ScenarioRun {
	legacy: InMemoryLegacyPrAddressGateway;
}

/**
 * Drive the CLI in process with a legacy gateway that throws on any
 * invocation — the default for tests where reaching the legacy Python
 * fallback would itself be a failure.
 */
export function runScenario(args: readonly string[], options: ScenarioRunOptions = {}): ScenarioRun {
	const throwingLegacy: LegacyPrAddressGateway = {
		run: async () => {
			throw new Error("unexpected legacy fallback");
		},
	};
	return runWithLegacyGateway(args, throwingLegacy, options);
}

/**
 * Drive the CLI in process with a recording fake legacy gateway, exposed on
 * the result for call assertions. Exit codes are replayed in order.
 */
export function runScenarioWithLegacy(
	args: readonly string[],
	options: ScenarioRunOptions & { legacyExitCodes?: readonly number[] | undefined } = {},
): ScenarioRunWithLegacy {
	const legacy = new InMemoryLegacyPrAddressGateway(options.legacyExitCodes ?? [0]);
	return { ...runWithLegacyGateway(args, legacy, options), legacy };
}

export function fixedClock(iso: string): PayloadClock {
	const instant = new Date(iso);
	return () => instant;
}

function runWithLegacyGateway(args: readonly string[], legacy: LegacyPrAddressGateway, options: ScenarioRunOptions): ScenarioRun {
	const stdout: string[] = [];
	const stderr: string[] = [];
	const overrides: Partial<PrAddressContext> & { legacy: LegacyPrAddressGateway } = { legacy };
	if (options.github !== undefined) overrides.github = options.github;
	if (options.git !== undefined) overrides.git = options.git;
	if (options.payloadClock !== undefined) overrides.payloadClock = options.payloadClock;
	const stdin = options.stdin;
	return {
		exit: runCli(args, {
			context: fakePrAddressContext(overrides),
			cwd: options.cwd ?? "/repo",
			env: options.env ?? { PATH: "/fake/bin" },
			stdin: typeof stdin === "function" ? stdin : async () => stdin ?? "",
			operations: options.operations,
			stdout: (text) => stdout.push(text),
			stderr: (text) => stderr.push(text),
		}),
		stdout,
		stderr,
	};
}
