import { failure, ok, type ClinkrExit } from "@asdl/clinkr";
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
	source: z.array(z.string()).default([]).describe("Only update skills whose lockfile source matches; repeatable."),
	agent: z.array(z.string()).default([]).describe("Agent directory to populate; repeatable."),
	dry_run: z.boolean().default(false).describe("Print planned updates without calling npx."),
});

export const updateSkillsResultSchema = z.object({
	ok: z.boolean(),
	project_dir: z.string(),
	agents: z.array(z.string()),
	dry_run: z.boolean(),
	selected_updates: z.array(selectedUpdateSchema),
	attempted_updates: z.array(attemptedUpdateSchema),
	failure_count: z.number().int().nonnegative(),
});

export type UpdateSkillsRequest = z.infer<typeof updateSkillsRequestSchema>;
export type UpdateSkillsResult = z.infer<typeof updateSkillsResultSchema>;
type SelectedUpdate = z.infer<typeof selectedUpdateSchema>;
type AttemptedUpdate = z.infer<typeof attemptedUpdateSchema>;

export async function runUpdateSkills(ctx: AregCliContext, request: UpdateSkillsRequest): Promise<ClinkrExit<UpdateSkillsResult>> {
	const inspection = await ctx.updateProject.inspectProjectForUpdate({ cwd: ctx.cwd, projectPath: request.path, env: ctx.env });
	if (inspection.projectPathState.type !== "directory") {
		return failure("invalid_project", `${inspection.projectDir} is not a directory`);
	}

	const lockfileResult = parseInspectedLockfile(inspection);
	if (lockfileResult.type === "error") return failure("lockfile_invalid", lockfileResult.message);

	const selection = selectGithubUpdates(lockfileResult.lockfile.skills, request);
	if (selection.type === "error") return failure("invalid_selection", selection.message);
	const selectedUpdates = selection.updates;

	if (selectedUpdates.length === 0) return ok(emptyReport(inspection.projectDir, request.dry_run, true));

	const agentsResult = resolveProjectAgents({ explicitAgents: request.agent, asdlToml: inspection.asdlToml, aregJson: inspection.aregJson });
	if (agentsResult.type === "error") return failure("agent_resolution_failed", agentsResult.message);
	const agents = agentsResult.value;

	if (!request.dry_run) {
		const npx = await ctx.host.checkTool({ tool: "npx", cwd: inspection.projectDir, env: ctx.env });
		if (npx.type === "missing") return failure("missing_tool", npx.message);
	}

	const attemptedUpdates: AttemptedUpdate[] = [];
	for (const update of selectedUpdates) {
		if (request.dry_run) {
			attemptedUpdates.push({ ...update, status: "planned" });
			continue;
		}
		const result = await ctx.npxSkills.addSkills({ sourceRepo: update.source, skillNames: [update.skill], targetAgents: agents, cwd: inspection.projectDir, env: ctx.env });
		if (result.type === "ok") {
			attemptedUpdates.push({ ...update, status: "updated" });
			continue;
		}
		attemptedUpdates.push({ ...update, status: "failed", error: result.error.message });
	}

	const finalReport = report({ projectDir: inspection.projectDir, agents, dryRun: request.dry_run, selectedUpdates, attemptedUpdates });
	if (finalReport.failure_count > 0) return failure("skill_update_failed", formatFailureMessage(finalReport));
	return ok(finalReport);
}

export function renderUpdateSkills(result: UpdateSkillsResult): string {
	if (result.selected_updates.length === 0) return "No github-sourced skills match. Nothing to update.";
	const suffix = result.dry_run ? " [dry-run]" : "";
	const lines = [`Updating ${result.selected_updates.length} skill(s) with agents ${result.agents.join(", ")}${suffix}:`];
	for (const update of result.attempted_updates) {
		lines.push(`  ${update.skill}  <-  ${update.source}`);
		if (update.status === "failed") lines.push(`    FAILED: ${update.error ?? "unknown error"}`);
	}
	if (result.dry_run) lines.push("", `Planned: ${result.attempted_updates.length} skill(s). No changes made.`);
	else lines.push("", `Updated ${result.attempted_updates.length} skill(s).`);
	return lines.join("\n");
}

function selectGithubUpdates(skills: readonly LockfileSkill[], request: UpdateSkillsRequest): { type: "ok"; updates: readonly SelectedUpdate[] } | { type: "error"; message: string } {
	const githubEntries = new Map<string, string>();
	for (const skill of skills) {
		if (skill.sourceType === "github") githubEntries.set(skill.name, skill.source);
	}

	const requestedSkills = new Set(request.skill);
	if (requestedSkills.size > 0) {
		const unknown = sortStrings([...requestedSkills].filter((skill) => !githubEntries.has(skill)));
		if (unknown.length > 0) return { type: "error", message: `Skill(s) not found in lockfile (or not github-sourced): ${unknown.join(", ")}` };
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
	return { type: "ok", updates };
}

function report(input: {
	ok?: boolean | undefined;
	projectDir: string;
	agents: readonly string[];
	dryRun: boolean;
	selectedUpdates: readonly SelectedUpdate[];
	attemptedUpdates: readonly AttemptedUpdate[];
}): UpdateSkillsResult {
	const failures = input.attemptedUpdates.filter((update) => update.status === "failed");
	return {
		ok: input.ok ?? failures.length === 0,
		project_dir: input.projectDir,
		agents: [...input.agents],
		dry_run: input.dryRun,
		selected_updates: input.selectedUpdates.map((update) => ({ ...update })),
		attempted_updates: input.attemptedUpdates.map((update) => ({ ...update })),
		failure_count: failures.length,
	};
}

function emptyReport(projectDir: string, dryRun: boolean, isOk: boolean): UpdateSkillsResult {
	return report({ ok: isOk, projectDir, agents: [], dryRun, selectedUpdates: [], attemptedUpdates: [] });
}

function formatFailureMessage(result: UpdateSkillsResult): string {
	const failed = result.attempted_updates.filter((update) => update.status === "failed");
	const lines = [`${failed.length} skill(s) failed to update: ${failed.map((update) => update.skill).join(", ")}`];
	for (const update of failed) lines.push(`  ${update.skill}  <-  ${update.source}`, `    FAILED: ${update.error ?? "unknown error"}`);
	return lines.join("\n");
}
