import { failure, ok, type ClinkrExit } from "@ji/clinkr";
import type { Result } from "@ji/core/result";
import { z } from "zod";

import type { AregCliContext } from "../context.ts";
import { sortStrings } from "../sort.ts";
import { parseInspectedLockfile, type LockfileSkill } from "./lockfile.ts";
import { resolveProjectAgents } from "./project-agents.ts";

const updateStatusSchema = z.enum(["planned", "updated", "failed"]);

const selectedUpdateSchema = z.object({
	skill: z.string(),
	source: z.string(),
});

const attemptedUpdateSchema = selectedUpdateSchema.extend({
	status: updateStatusSchema,
	error: z.string().optional(),
});

export const updateSkillsRequestSchema = z.object({
	path: z.string().default(".").describe("Project directory containing skills-lock.json."),
	skill: z.array(z.string()).default([]).describe("Skill name to update; repeatable."),
	source: z
		.array(z.string())
		.default([])
		.describe("Only update skills whose lockfile source matches; repeatable."),
	agent: z.array(z.string()).default([]).describe("Agent directory to populate; repeatable."),
	dryRun: z.boolean().default(false).describe("Print planned updates without calling npx."),
});

export const updateSkillsResultSchema = z.object({
	ok: z.boolean(),
	projectDir: z.string(),
	agents: z.array(z.string()),
	dryRun: z.boolean(),
	selectedUpdates: z.array(selectedUpdateSchema),
	attemptedUpdates: z.array(attemptedUpdateSchema),
	failureCount: z.number().int().nonnegative(),
});

export type UpdateSkillsRequest = z.infer<typeof updateSkillsRequestSchema>;
export type UpdateSkillsResult = z.infer<typeof updateSkillsResultSchema>;
type SelectedUpdate = z.infer<typeof selectedUpdateSchema>;
type AttemptedUpdate = z.infer<typeof attemptedUpdateSchema>;

export async function runUpdateSkills(
	ctx: AregCliContext,
	request: UpdateSkillsRequest,
): Promise<ClinkrExit<UpdateSkillsResult>> {
	const inspection = await ctx.project.inspectProjectBase({
		cwd: ctx.cwd,
		projectPath: request.path,
		env: ctx.env,
	});
	if (inspection.projectPathState.type !== "directory") {
		return failure("invalid-project", `${inspection.projectDir} is not a directory`);
	}

	const lockfileResult = parseInspectedLockfile(inspection);
	if (!lockfileResult.ok) return failure("lockfile-invalid", lockfileResult.error.message);

	const selection = selectGithubUpdates(lockfileResult.value.skills, request);
	if (!selection.ok) return failure("invalid-selection", selection.error.message);
	const selectedUpdates = selection.value;

	if (selectedUpdates.length === 0)
		return ok(emptyReport(inspection.projectDir, request.dryRun, true));

	const agentsResult = resolveProjectAgents({
		explicitAgents: request.agent,
		sdlToml: inspection.sdlToml,
		aregJson: inspection.aregJson,
	});
	if (!agentsResult.ok) return failure("agent-resolution-failed", agentsResult.error.message);
	const agents = agentsResult.value;

	if (!request.dryRun) {
		const npx = await ctx.host.checkTool({ tool: "npx", cwd: inspection.projectDir, env: ctx.env });
		if (npx.type === "missing") return failure("missing-tool", npx.message);
	}

	const attemptedUpdates: AttemptedUpdate[] = [];
	for (const update of selectedUpdates) {
		if (request.dryRun) {
			attemptedUpdates.push({ ...update, status: "planned" });
			continue;
		}
		const result = await ctx.npxSkills.addSkills({
			sourceRepo: update.source,
			skillNames: [update.skill],
			targetAgents: agents,
			cwd: inspection.projectDir,
			env: ctx.env,
		});
		if (result.type === "ok") {
			attemptedUpdates.push({ ...update, status: "updated" });
			continue;
		}
		attemptedUpdates.push({ ...update, status: "failed", error: result.error.message });
	}

	const finalReport = report({
		projectDir: inspection.projectDir,
		agents,
		dryRun: request.dryRun,
		selectedUpdates,
		attemptedUpdates,
	});
	if (finalReport.failureCount > 0)
		return failure("skill-update-failed", formatFailureMessage(finalReport));
	return ok(finalReport);
}

export function renderUpdateSkills(result: UpdateSkillsResult): string {
	if (result.selectedUpdates.length === 0)
		return "No github-sourced skills match. Nothing to update.";
	const suffix = result.dryRun ? " [dry-run]" : "";
	const lines = [
		`Updating ${result.selectedUpdates.length} skill(s) with agents ${result.agents.join(", ")}${suffix}:`,
	];
	for (const update of result.attemptedUpdates) {
		lines.push(`  ${update.skill}  <-  ${update.source}`);
		if (update.status === "failed") lines.push(`    FAILED: ${update.error ?? "unknown error"}`);
	}
	if (result.dryRun)
		lines.push("", `Planned: ${result.attemptedUpdates.length} skill(s). No changes made.`);
	else lines.push("", `Updated ${result.attemptedUpdates.length} skill(s).`);
	return lines.join("\n");
}

function selectGithubUpdates(
	skills: readonly LockfileSkill[],
	request: UpdateSkillsRequest,
): Result<readonly SelectedUpdate[]> {
	const githubEntries = new Map<string, string>();
	for (const skill of skills) {
		if (skill.sourceType === "github") githubEntries.set(skill.name, skill.source);
	}

	const requestedSkills = new Set(request.skill);
	if (requestedSkills.size > 0) {
		const unknown = sortStrings([...requestedSkills].filter((skill) => !githubEntries.has(skill)));
		if (unknown.length > 0)
			return {
				ok: false,
				error: {
					code: "skill_not_found",
					message: `Skill(s) not found in lockfile (or not github-sourced): ${unknown.join(", ")}`,
				},
			};
	}

	const requestedSources = new Set(request.source);
	const updates: SelectedUpdate[] = [];
	for (const skill of sortStrings([...githubEntries.keys()])) {
		const source = githubEntries.get(skill);
		if (source === undefined) continue;
		if (requestedSkills.size > 0 && !requestedSkills.has(skill)) continue;
		if (requestedSources.size > 0 && !requestedSources.has(source)) continue;
		updates.push({ skill, source });
	}
	return { ok: true, value: updates };
}

function report(input: {
	ok?: boolean;
	projectDir: string;
	agents: readonly string[];
	dryRun: boolean;
	selectedUpdates: readonly SelectedUpdate[];
	attemptedUpdates: readonly AttemptedUpdate[];
}): UpdateSkillsResult {
	const failures = input.attemptedUpdates.filter((update) => update.status === "failed");
	return {
		ok: input.ok ?? failures.length === 0,
		projectDir: input.projectDir,
		agents: [...input.agents],
		dryRun: input.dryRun,
		selectedUpdates: input.selectedUpdates.map((update) => ({ ...update })),
		attemptedUpdates: input.attemptedUpdates.map((update) => ({ ...update })),
		failureCount: failures.length,
	};
}

function emptyReport(projectDir: string, dryRun: boolean, isOk: boolean): UpdateSkillsResult {
	return report({
		ok: isOk,
		projectDir,
		agents: [],
		dryRun,
		selectedUpdates: [],
		attemptedUpdates: [],
	});
}

function formatFailureMessage(result: UpdateSkillsResult): string {
	const failed = result.attemptedUpdates.filter((update) => update.status === "failed");
	const lines = [
		`${failed.length} skill(s) failed to update: ${failed.map((update) => update.skill).join(", ")}`,
	];
	for (const update of failed)
		lines.push(
			`  ${update.skill}  <-  ${update.source}`,
			`    FAILED: ${update.error ?? "unknown error"}`,
		);
	return lines.join("\n");
}
