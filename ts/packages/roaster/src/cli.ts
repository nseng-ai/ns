#!/usr/bin/env node

import { ClinkrGroup } from "@sdl/clinkr";
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
	recordFindingsRequestSchema,
	renderReviewList,
	renderReviewLog,
	renderReviewRun,
	renderRoastSkillList,
	reviewListRequestSchema,
	reviewListResultSchema,
	reviewLogRequestSchema,
	reviewLogResultSchema,
	reviewRunRequestSchema,
	roastSkillListRequestSchema,
	runRecordFindings,
	roastSkillListResultSchema,
	runPublishFindings,
	runReviewByKey,
	runReviewList,
	runReviewLog,
	runRoastSkillList,
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
		reviewGroup.command({
			name: "log",
			description: "List Branch Memory review log Entries for this branch.",
			schema: reviewLogRequestSchema,
			positionals: { key: { position: 0 } },
			resultSchema: reviewLogResultSchema,
			handler: runReviewLog,
			renderHuman: renderReviewLog,
		});
		root.group(reviewGroup);

		const roastGroup = new ClinkrGroup<RoasterRuntime>({
			name: "roast",
			description: "Roaster review-skill catalog operations.",
		});
		roastGroup.command({
			name: "list",
			description: "List Roaster review-skill commands.",
			schema: roastSkillListRequestSchema,
			resultSchema: roastSkillListResultSchema,
			handler: runRoastSkillList,
			renderHuman: renderRoastSkillList,
		});
		root.group(roastGroup);

		const execGroup = new ClinkrGroup<RoasterRuntime>({
			name: "exec",
			description: "Operations for roaster automation.",
			isHidden: true,
		});
		execGroup.command({
			name: "record-findings",
			description: "Record same-session structured findings as a Roaster review run.",
			schema: recordFindingsRequestSchema,
			resultSchema: reviewRunResultSchema,
			handler: runRecordFindings,
			renderHuman: renderReviewRun,
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
	if (deps.context === undefined) return await entry.run(args, deps);
	return await entry.run(args, {
		...deps,
		stdout: deps.context.stdout,
		stderr: deps.context.stderr,
	});
}

await entry.runIfMain({ isImportMetaMain: import.meta.main });
