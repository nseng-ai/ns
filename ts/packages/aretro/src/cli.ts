#!/usr/bin/env node

import process from "node:process";

import { ClinkrGroup, resolveIo } from "@asdl/clinkr";
import { isDirectCliInvocation } from "@asdl/core/cli-entry";

import { createRealAretroContext, type AretroCliContext } from "./context.ts";
import {
	collectEvidenceRequestSchema,
	collectEvidenceResultSchema,
	renderCollectEvidence,
	runCollectEvidence,
} from "./operations/collect-evidence.ts";
import {
	readEvidenceDetailRequestSchema,
	readEvidenceDetailResultSchema,
	renderReadEvidenceDetail,
	runReadEvidenceDetail,
} from "./operations/read-evidence-detail.ts";

export const VERSION = "0.1.0";

export interface CliDeps {
	context?: AretroCliContext | undefined;
	cwd?: string | undefined;
	env?: NodeJS.ProcessEnv | undefined;
	stdout?: ((text: string) => void) | undefined;
	stderr?: ((text: string) => void) | undefined;
}

export function buildCli(): ClinkrGroup<AretroCliContext> {
	const root = new ClinkrGroup<AretroCliContext>({
		name: "aretro",
		description: "Branch session retrospective evidence operations.",
		version: VERSION,
		runtimeInfo,
	});

	const execGroup = new ClinkrGroup<AretroCliContext>({
		name: "exec",
		description: "Commands for use by skills (not interactive users).",
		isHidden: true,
	});

	execGroup.command({
		name: "collect-evidence",
		description: "Collect compact session evidence for a branch retrospective.",
		schema: collectEvidenceRequestSchema,
		resultSchema: collectEvidenceResultSchema,
		handler: runCollectEvidence,
		renderHuman: renderCollectEvidence,
	});

	execGroup.command({
		name: "read-evidence-detail",
		description: "Read evidence detail from a payload pointer.",
		schema: readEvidenceDetailRequestSchema,
		resultSchema: readEvidenceDetailResultSchema,
		handler: runReadEvidenceDetail,
		renderHuman: renderReadEvidenceDetail,
	});

	root.group(execGroup);

	return root;
}

export async function runCli(args: readonly string[], deps: CliDeps = {}): Promise<number> {
	const io = resolveIo({ stdout: deps.stdout, stderr: deps.stderr });
	const cwd = deps.cwd ?? process.cwd();
	const env = deps.env ?? process.env;
	const context = deps.context ?? createRealAretroContext({ cwd, env });
	const runContext: AretroCliContext = {
		...context,
		cwd,
		env: deps.env ?? context.env,
	};
	return await buildCli().run(args, { context: runContext, io });
}

function runtimeInfo(): string {
	return "runtime: typescript\nentry_point: @asdl/aretro bin aretro -> ts/packages/aretro/src/cli.ts\n";
}

if (import.meta.main || isDirectCliInvocation(import.meta.url, process.argv[1])) {
	process.exitCode = await runCli(process.argv.slice(2));
}
