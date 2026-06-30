#!/usr/bin/env node

import { ClinkrGroup } from "@sdl/clinkr";
import { defineCli } from "@sdl/cli-runtime";
import type { ExplicitUndefined } from "@sdl/core/primitives";

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

const entry = defineCli<AretroCliContext, CliDeps, undefined>({
	metaUrl: import.meta.url,
	runtime: "typescript",
	description: "Branch session retrospective evidence operations.",
	prepareRun: ({ deps, cwd, env }) => {
		const context = deps.context ?? createRealAretroContext({ cwd, env });
		const runContext: AretroCliContext = {
			...context,
			cwd,
			env: deps.env ?? context.env,
		};
		return { type: "run", context: runContext, buildState: undefined };
	},
	configureCli: ({ root }) => {
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
	},
});

export const VERSION = entry.version;

export interface CliDeps {
	context?: AretroCliContext | undefined;
	cwd?: string | undefined;
	env?: ExplicitUndefined<"env-map", NodeJS.ProcessEnv>;
	stdout?: ((text: string) => void) | undefined;
	stderr?: ((text: string) => void) | undefined;
}

export function buildCli(): ClinkrGroup<AretroCliContext> {
	return entry.buildCli(undefined);
}

export async function runCli(args: readonly string[], deps: CliDeps = {}): Promise<number> {
	return await entry.run(args, deps);
}

await entry.runIfMain({ isImportMetaMain: import.meta.main });
