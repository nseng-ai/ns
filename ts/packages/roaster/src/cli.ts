#!/usr/bin/env node

import process from "node:process";

import { ClinkrGroup, resolveIo } from "@asdl/clinkr";
import { isDirectCliInvocation } from "@asdl/core/cli-entry";
import { readStdin } from "@asdl/core/stdin";

const VERSION = "0.1.0";

export interface CliDeps {
	cwd?: string | undefined;
	env?: NodeJS.ProcessEnv | undefined;
	stdin?: (() => Promise<string>) | undefined;
	stdout?: ((text: string) => void) | undefined;
	stderr?: ((text: string) => void) | undefined;
}

interface RoasterCliContext {
	cwd: string;
	env: NodeJS.ProcessEnv;
	stdin: () => Promise<string>;
}

export function buildCli(): ClinkrGroup<RoasterCliContext> {
	const root = new ClinkrGroup<RoasterCliContext>({
		name: "roaster",
		description: "PR-diff findings runner.",
		version: VERSION,
		runtimeInfo,
	});
	const execGroup = new ClinkrGroup<RoasterCliContext>({
		name: "exec",
		description: "Operations for roaster automation.",
		isHidden: true,
	});
	root.group(execGroup);
	return root;
}

export async function runCli(args: readonly string[], deps: CliDeps = {}): Promise<number> {
	const io = resolveIo({ stdout: deps.stdout, stderr: deps.stderr });
	const context: RoasterCliContext = {
		cwd: deps.cwd ?? process.cwd(),
		env: deps.env ?? process.env,
		stdin: deps.stdin ?? readStdin,
	};
	return await buildCli().run(args, { context, io });
}

function runtimeInfo(): string {
	return "runtime: typescript\nentry_point: @asdl/roaster bin roaster -> ts/packages/roaster/src/cli.ts\n";
}

if (import.meta.main || isDirectCliInvocation(import.meta.url, process.argv[1])) {
	process.exitCode = await runCli(process.argv.slice(2));
}
