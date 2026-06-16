#!/usr/bin/env node

import process from "node:process";

import { ClinkrGroup, resolveIo } from "@asdl/clinkr";
import { isDirectCliInvocation } from "@asdl/core/cli-entry";

import { createRealObjectiveContext, type ObjectiveCliContext } from "./context.ts";
import {
	legacyReadObjectiveMachine,
	readObjectiveRequestSchema,
	renderReadObjective,
	runReadObjective,
} from "./operations/read-objective.ts";

export const VERSION = "0.1.0";

export interface CliDeps {
	context?: ObjectiveCliContext | undefined;
	cwd?: string | undefined;
	env?: NodeJS.ProcessEnv | undefined;
	stdout?: ((text: string) => void) | undefined;
	stderr?: ((text: string) => void) | undefined;
}

export function buildCli(): ClinkrGroup<ObjectiveCliContext> {
	const root = new ClinkrGroup<ObjectiveCliContext>({
		name: "objective",
		description: "Work with checked-in Objective records.",
		version: VERSION,
		runtimeInfo,
	});
	const execGroup = new ClinkrGroup<ObjectiveCliContext>({
		name: "exec",
		description: "Commands for use by objective skills.",
		isHidden: true,
	});
	execGroup.command({
		name: "read-objective",
		description: "Read one Objective record by explicit slug as filesystem facts or raw Markdown.",
		schema: readObjectiveRequestSchema,
		positionals: { slug: { position: 0 } },
		handler: runReadObjective,
		renderHuman: renderReadObjective,
		renderMarkdown: renderReadObjective,
		legacyMachine: legacyReadObjectiveMachine,
	});
	root.group(execGroup);
	return root;
}

export async function runCli(args: readonly string[], deps: CliDeps = {}): Promise<number> {
	const io = resolveIo({ stdout: deps.stdout, stderr: deps.stderr });
	const cwd = deps.cwd ?? process.cwd();
	const env = deps.env ?? process.env;
	const context = deps.context ?? (await createRealObjectiveContext({ cwd, env }));
	return await buildCli().run(args, { context, io });
}

function runtimeInfo(): string {
	return "runtime: typescript\nentry_point: @asdl/objective bin objective -> ts/packages/objective/src/cli.ts\n";
}

if (import.meta.main || isDirectCliInvocation(import.meta.url, process.argv[1])) {
	process.exitCode = await runCli(process.argv.slice(2));
}
