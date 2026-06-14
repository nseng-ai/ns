#!/usr/bin/env node

import process from "node:process";

import { ClinkrGroup, resolveIo } from "@asdl/clinkr";
import { isDirectCliInvocation } from "@asdl/core/cli-entry";

import { createRealAregContext, type AregCliContext } from "./context.ts";
import { checkRequestSchema, checkResultSchema, renderCheck, runCheck } from "./operations/check.ts";
import { buildSkillxGroup } from "./operations/skillx.ts";

export const VERSION = "0.1.0";

export interface CliDeps {
	context?: AregCliContext | undefined;
	cwd?: string | undefined;
	env?: NodeJS.ProcessEnv | undefined;
	stdout?: ((text: string) => void) | undefined;
	stderr?: ((text: string) => void) | undefined;
}

export function buildCli(): ClinkrGroup<AregCliContext> {
	const root = new ClinkrGroup<AregCliContext>({
		name: "areg",
		description: "Manage ASDL agent registry projects.",
		version: VERSION,
		runtimeInfo,
	});
	root.command({
		name: "check",
		description: "Check that skills follow areg conventions.",
		schema: checkRequestSchema,
		resultSchema: checkResultSchema,
		handler: runCheck,
		renderHuman: renderCheck,
	});
	const execGroup = new ClinkrGroup<AregCliContext>({
		name: "exec",
		description: "Commands for use by skills (not interactive users).",
		isHidden: true,
	});
	execGroup.group(buildSkillxGroup());
	root.group(execGroup);
	return root;
}

export async function runCli(args: readonly string[], deps: CliDeps = {}): Promise<number> {
	const io = resolveIo({ stdout: deps.stdout, stderr: deps.stderr });
	const cwd = deps.cwd ?? process.cwd();
	const env = deps.env ?? process.env;
	const context = deps.context ?? createRealAregContext({ cwd, env });
	const runContext: AregCliContext = {
		...context,
		cwd,
		env: deps.env ?? context.env,
	};
	return await buildCli().run(args, { context: runContext, io });
}

function runtimeInfo(): string {
	return "runtime: typescript\nentry_point: @asdl/areg bin areg -> ts/packages/areg/src/cli.ts\n";
}

if (import.meta.main || isDirectCliInvocation(import.meta.url, process.argv[1])) {
	process.exitCode = await runCli(process.argv.slice(2));
}
