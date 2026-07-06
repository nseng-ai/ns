#!/usr/bin/env node

import { ClinkrGroup } from "@nseng-ai/clinkr";
import { defineCli, type CliEntrypointDeps } from "@nseng-ai/foundation/cli-runtime";

import { createRealRetrosContext, type RetrosCliContext } from "./context.ts";
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

const entry = defineCli<RetrosCliContext, CliDeps, undefined>({
	metaUrl: import.meta.url,
	runtime: "typescript",
	description: "Branch session retrospective evidence operations.",
	prepareRun: ({ deps, cwd, env }) => {
		const context = deps.context ?? createRealRetrosContext({ cwd, env });
		const runContext: RetrosCliContext = {
			...context,
			cwd,
			env: deps.env ?? context.env,
		};
		return { type: "run", context: runContext, buildState: undefined };
	},
	configureCli: ({ root }) => {
		const execGroup = new ClinkrGroup<RetrosCliContext>({
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

export interface CliDeps extends CliEntrypointDeps {
	context?: RetrosCliContext;
}

export function buildCli(): ClinkrGroup<RetrosCliContext> {
	return entry.buildCli(undefined);
}

export async function runCli(args: readonly string[], deps: CliDeps = {}): Promise<number> {
	return await entry.run(args, deps);
}

await entry.runIfMain({ isImportMetaMain: import.meta.main });
