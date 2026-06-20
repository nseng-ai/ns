#!/usr/bin/env node

import { ClinkrGroup } from "@asdl/clinkr";
import { defineCli } from "@asdl/core/cli-entry";

import { createRealAregContext, type AregCliContext } from "./context.ts";
import {
	checkRequestSchema,
	checkResultSchema,
	renderCheck,
	runCheck,
} from "./operations/check.ts";
import { initRequestSchema, initResultSchema, renderInit, runInit } from "./operations/init.ts";
import { buildSkillGroup } from "./operations/skill-kind.ts";
import { buildSkillxGroup } from "./operations/skillx.ts";
import {
	renderUpdateSkills,
	runUpdateSkills,
	updateSkillsRequestSchema,
	updateSkillsResultSchema,
} from "./operations/update-skills.ts";

export interface CliDeps {
	context?: AregCliContext | undefined;
	cwd?: string | undefined;
	env?: NodeJS.ProcessEnv | undefined;
	stdout?: ((text: string) => void) | undefined;
	stderr?: ((text: string) => void) | undefined;
}

const entry = defineCli<AregCliContext, CliDeps, undefined>({
	metaUrl: import.meta.url,
	runtime: "typescript",
	description: "Manage ASDL agent registry projects.",
	prepareRun: ({ deps, cwd, env }) => {
		const context = deps.context ?? createRealAregContext({ cwd, env });
		const runContext: AregCliContext = {
			...context,
			cwd,
			env: deps.env ?? context.env,
		};
		return { type: "run", context: runContext, buildState: undefined };
	},
	buildCli: ({ name, description, version, runtimeInfo }) => {
		const root = new ClinkrGroup<AregCliContext>({
			name,
			description,
			version,
			runtimeInfo,
		});
		root.command({
			name: "init",
			description: "Initialize an existing Git project for areg skill workflows.",
			schema: initRequestSchema,
			positionals: { target: { position: 0 } },
			resultSchema: initResultSchema,
			handler: runInit,
			renderHuman: renderInit,
		});
		root.command({
			name: "check",
			description: "Check that skills follow areg conventions.",
			schema: checkRequestSchema,
			resultSchema: checkResultSchema,
			handler: runCheck,
			renderHuman: renderCheck,
		});
		root.command({
			name: "update-skills",
			description: "Refresh GitHub-sourced skills recorded in skills-lock.json.",
			schema: updateSkillsRequestSchema,
			resultSchema: updateSkillsResultSchema,
			handler: runUpdateSkills,
			renderHuman: renderUpdateSkills,
		});
		root.group(buildSkillGroup());
		const execGroup = new ClinkrGroup<AregCliContext>({
			name: "exec",
			description: "Commands for use by skills (not interactive users).",
			isHidden: true,
		});
		execGroup.group(buildSkillxGroup());
		root.group(execGroup);
		return root;
	},
});

export const VERSION = entry.version;

export function buildCli(): ClinkrGroup<AregCliContext> {
	return entry.buildCli(undefined);
}

export async function runCli(args: readonly string[], deps: CliDeps = {}): Promise<number> {
	return await entry.run(args, deps);
}

await entry.runIfMain({ isImportMetaMain: import.meta.main });
