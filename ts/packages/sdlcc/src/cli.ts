#!/usr/bin/env bun

import { ClinkrGroup, resolveIo } from "@asdl/clinkr";

import { loadStackMapPrototypeModel } from "./stack-map-model-loader.ts";

const VERSION = "0.1.0";

export interface SdlccCliDeps {
	readonly stdout?: ((text: string) => void) | undefined;
	readonly stderr?: ((text: string) => void) | undefined;
	readonly startTui?: (() => Promise<void> | void) | undefined;
}

type SdlccCliContext = Record<string, never>;

export function buildCli(): ClinkrGroup<SdlccCliContext> {
	return new ClinkrGroup<SdlccCliContext>({
		name: "sdlcc",
		description: "Open a full-screen OpenTUI stack-map prototype.",
		version: VERSION,
		runtimeInfo,
	});
}

export async function runSdlccCli(args: readonly string[], deps: SdlccCliDeps = {}): Promise<number> {
	const stdout = deps.stdout ?? ((text: string) => process.stdout.write(text));
	const stderr = deps.stderr ?? ((text: string) => process.stderr.write(text));

	if (args.length === 0) {
		await (deps.startTui ?? startDefaultTui)();
		return 0;
	}

	const io = resolveIo({ stdout, stderr });
	return await buildCli().run(args, { context: {}, io });
}

function runtimeInfo(): string {
	return "runtime: bun\nentry_point: sdlcc bin sdlcc -> ts/packages/sdlcc/src/cli.ts\n";
}

async function startDefaultTui(): Promise<void> {
	const [{ startStackMapPrototypeTui }, model] = await Promise.all([
		import("./stack-map-prototype-renderer.ts"),
		loadStackMapPrototypeModel(),
	]);
	await startStackMapPrototypeTui({ model });
}

if (import.meta.main) {
	process.exitCode = await runSdlccCli(process.argv.slice(2));
}
