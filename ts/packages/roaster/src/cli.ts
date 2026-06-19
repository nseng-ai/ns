#!/usr/bin/env node

import process from "node:process";

import { ClinkrGroup, resolveIo } from "@asdl/clinkr";
import { rawCommand } from "@asdl/clinkr/raw";
import { isDirectCliInvocation } from "@asdl/core/cli-entry";
import { readStdin } from "@asdl/core/stdin";

import {
	createRealRoasterGateways,
	createRoasterContext,
	type RoasterGateways,
} from "./context.ts";
import {
	publishFindingsRequestSchema,
	renderReviewList,
	renderReviewRun,
	reviewListRequestSchema,
	reviewListResultSchema,
	reviewRunRequestSchema,
	runPublishFindings,
	runReviewByKey,
	runReviewList,
	type RoasterCliContext,
} from "./operations/cli-operations.ts";
import { reviewRunResultSchema } from "./models.ts";

const VERSION = "0.1.0";

export interface CliDeps {
	gateways?: RoasterGateways | undefined;
	cwd?: string | undefined;
	env?: NodeJS.ProcessEnv | undefined;
	signal?: AbortSignal | undefined;
	stdin?: (() => Promise<string>) | undefined;
	stdout?: ((text: string) => void) | undefined;
	stderr?: ((text: string) => void) | undefined;
}

export function buildCli(): ClinkrGroup<RoasterCliContext> {
	const root = new ClinkrGroup<RoasterCliContext>({
		name: "roaster",
		description: "PR-diff findings runner.",
		version: VERSION,
		runtimeInfo,
	});
	const reviewGroup = new ClinkrGroup<RoasterCliContext>({
		name: "review",
		description: "Review catalog and runner operations.",
	});
	reviewGroup.command({
		name: "list",
		description: "List configured roaster reviews.",
		schema: reviewListRequestSchema,
		resultSchema: reviewListResultSchema,
		handler: runReviewList,
		renderHuman: renderReviewList,
	});
	reviewGroup.command({
		name: "ls",
		description: "Alias for review list.",
		schema: reviewListRequestSchema,
		resultSchema: reviewListResultSchema,
		handler: runReviewList,
		renderHuman: renderReviewList,
	});
	reviewGroup.command({
		name: "run",
		description: "Run one roaster review against the local diff.",
		schema: reviewRunRequestSchema,
		positionals: { key: { position: 0 } },
		resultSchema: reviewRunResultSchema,
		handler: runReviewByKey,
		renderHuman: renderReviewRun,
	});
	root.group(reviewGroup);

	const execGroup = new ClinkrGroup<RoasterCliContext>({
		name: "exec",
		description: "Operations for roaster automation.",
		isHidden: true,
	});
	execGroup.command(
		rawCommand({
			name: "publish-findings",
			description: "Publish inline and summary findings from a roaster run envelope on stdin.",
			schema: publishFindingsRequestSchema,
			run: runPublishFindings,
		}),
	);
	root.group(execGroup);
	return root;
}

export async function runCli(args: readonly string[], deps: CliDeps = {}): Promise<number> {
	const io = resolveIo({ stdout: deps.stdout, stderr: deps.stderr });
	const cwd = deps.cwd ?? process.cwd();
	const env = deps.env ?? process.env;
	const gateways = deps.gateways ?? createRealRoasterGateways();
	const context = createRoasterContext(gateways, {
		cwd,
		env,
		...(deps.signal === undefined ? {} : { signal: deps.signal }),
	});
	const cliContext: RoasterCliContext = {
		...context,
		stdin: deps.stdin ?? readStdin,
		stdout: io.stdout,
		stderr: io.stderr,
	};
	return await buildCli().run(args, { context: cliContext, io });
}

function runtimeInfo(): string {
	return "runtime: typescript\nentry_point: @asdl/roaster bin roaster -> ts/packages/roaster/src/cli.ts\n";
}

if (import.meta.main || isDirectCliInvocation(import.meta.url, process.argv[1])) {
	process.exitCode = await runCli(process.argv.slice(2));
}
