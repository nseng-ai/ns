#!/usr/bin/env node

import { ClinkrGroup, resolveIo } from "@sdl/clinkr";
import { rawCommand } from "@sdl/clinkr/raw";
import { defineCli } from "@sdl/core/cli-entry";
import { readStdin } from "@sdl/core/stdin";

import {
	createRealRoasterContext,
	createRoasterRuntime,
	type RoasterContext,
	type RoasterRuntime,
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
} from "./operations/cli-operations.ts";
import { reviewRunResultSchema } from "./models.ts";

export interface CliDeps {
	context?: RoasterContext | undefined;
	cwd?: string | undefined;
	env?: NodeJS.ProcessEnv | undefined;
	signal?: AbortSignal | undefined;
	stdin?: (() => Promise<string>) | undefined;
	stdout?: ((text: string) => void) | undefined;
	stderr?: ((text: string) => void) | undefined;
}

const entry = defineCli<RoasterRuntime, CliDeps, undefined>({
	metaUrl: import.meta.url,
	runtime: "typescript",
	description: "PR-diff findings runner.",
	prepareRun: ({ deps, cwd, env, io }) => {
		if (deps.context !== undefined) {
			return {
				type: "run",
				context: createRoasterRuntime(deps.context),
				buildState: undefined,
				io: resolveIo({ stdout: deps.context.stdout, stderr: deps.context.stderr }),
			};
		}
		const context = createRealRoasterContext({
			cwd: deps.cwd ?? cwd,
			env: deps.env ?? env,
			stdin: deps.stdin ?? readStdin,
			stdout: io.stdout,
			stderr: io.stderr,
			...(deps.signal === undefined ? {} : { signal: deps.signal }),
		});
		return {
			type: "run",
			context: createRoasterRuntime(context),
			buildState: undefined,
		};
	},
	buildCli: ({ name, description, version, runtimeInfo }) => {
		const root = new ClinkrGroup<RoasterRuntime>({
			name,
			description,
			version,
			runtimeInfo,
		});
		const reviewGroup = new ClinkrGroup<RoasterRuntime>({
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

		const execGroup = new ClinkrGroup<RoasterRuntime>({
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
	},
});

export function buildCli(): ClinkrGroup<RoasterRuntime> {
	return entry.buildCli(undefined);
}

export async function runCli(args: readonly string[], deps: CliDeps = {}): Promise<number> {
	return await entry.run(args, deps);
}

await entry.runIfMain({ isImportMetaMain: import.meta.main });
