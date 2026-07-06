#!/usr/bin/env node

import { ClinkrGroup } from "@nseng-ai/clinkr";
import { defineCli, type CliEntrypointDeps } from "@nseng-ai/foundation/cli-runtime";

import { createRealAregContext, type AregCliContext } from "./context.ts";
import {
	doctorSkillsRequestSchema,
	doctorSkillsResultSchema,
	runDoctorSkills,
} from "./operations/doctor-skills.ts";
import { renderDoctorSkills } from "./operations/doctor-skills-report.ts";
import {
	checkRequestSchema,
	checkResultSchema,
	renderCheck,
	runCheck,
} from "./operations/check.ts";
import { buildSkillGroup } from "./operations/skill-kind.ts";

export interface CliDeps extends Pick<CliEntrypointDeps, "cwd" | "env" | "stdout" | "stderr"> {
	context?: AregCliContext;
	interaction?: AregCliContext["interaction"];
}

const entry = defineCli<AregCliContext, CliDeps, undefined>({
	metaUrl: import.meta.url,
	runtime: "typescript",
	description: "Manage ns agent registry projects.",
	prepareRun: ({ deps, cwd, env }) => {
		const context = deps.context ?? createRealAregContext({ cwd, env });
		const runContext: AregCliContext = {
			...context,
			cwd,
			env: deps.env ?? context.env,
			interaction: deps.interaction ?? context.interaction,
		};
		return { type: "run", context: runContext, buildState: undefined };
	},
	configureCli: ({ root }) => {
		root.command({
			name: "check",
			description: "Check that skills follow areg conventions.",
			schema: checkRequestSchema,
			resultSchema: checkResultSchema,
			handler: runCheck,
			renderHuman: renderCheck,
		});
		const doctorGroup = new ClinkrGroup<AregCliContext>({
			name: "doctor",
			description: "Diagnose areg project drift.",
		});
		doctorGroup.command({
			name: "skills",
			description: "Diagnose skill registry, Pi inventory, and replacement-command drift.",
			schema: doctorSkillsRequestSchema,
			resultSchema: doctorSkillsResultSchema,
			handler: runDoctorSkills,
			renderHuman: renderDoctorSkills,
		});
		root.group(doctorGroup);
		root.group(buildSkillGroup());
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
