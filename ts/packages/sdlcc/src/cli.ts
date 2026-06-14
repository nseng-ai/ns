#!/usr/bin/env bun

import { buildHelloWorldModel, formatHelpText, formatVersionText } from "./hello-world.ts";

export interface SdlccCliDeps {
	readonly stdout?: ((text: string) => void) | undefined;
	readonly stderr?: ((text: string) => void) | undefined;
	readonly startTui?: (() => Promise<void> | void) | undefined;
}

export async function runSdlccCli(args: readonly string[], deps: SdlccCliDeps = {}): Promise<number> {
	const stdout = deps.stdout ?? ((text: string) => process.stdout.write(text));
	const stderr = deps.stderr ?? ((text: string) => process.stderr.write(text));

	if (args.length === 0) {
		await (deps.startTui ?? startDefaultTui)();
		return 0;
	}

	if (args.length === 1 && (args[0] === "--help" || args[0] === "-h")) {
		stdout(formatHelpText());
		return 0;
	}

	if (args.length === 1 && args[0] === "--version") {
		stdout(`${formatVersionText()}\n`);
		return 0;
	}

	stderr(`Unknown sdlcc argument: ${args.join(" ")}\nRun 'sdlcc --help' for usage.\n`);
	return 2;
}

async function startDefaultTui(): Promise<void> {
	const { startHelloWorldTui } = await import("./opentui-renderer.ts");
	await startHelloWorldTui({ model: buildHelloWorldModel() });
}

if (import.meta.main) {
	process.exitCode = await runSdlccCli(process.argv.slice(2));
}
