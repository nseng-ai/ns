import { failure, negative, ok, shellNegative, type ClinkrExit, ClinkrGroup } from "@asdl/clinkr";
import { z } from "zod";

import type { AregCliContext } from "../context.ts";
import { isPathStateError } from "./file-state.ts";
import { inspectSkillKindProject } from "./project-inspection.ts";
import { applyProjectMutationPlan } from "./project-mutations.ts";
import {
	APPLY_OPERATION_TYPES,
	APPLY_STATUS_OPERATION_TYPES,
	buildSkillKindApplyPlan,
	deletionPrompt,
	hasDeletionPrompt,
	inspectionAfterPlannedApply,
	operationStatusesForPlans,
	plannedDeletes,
	plannedRemoveEmptyDirs,
	plannedWrites,
	toApplyResult,
	type SkillKindApplyPlan,
} from "./skill-kind-apply-plan.ts";
import {
	buildSkillKindRecords,
	INFERRED_SKILL_INVOCATION_KINDS,
	MODEL_INVOCATION_STATUSES,
	NATIVE_DIRECT_STATUSES,
	PI_EXTENSION_STATUSES,
	SKILL_INVOCATION_KINDS,
	type SkillKindProjectInspection,
	type SkillKindRecord,
} from "./skill-kind-inference.ts";

interface ResolvedProjectInspection {
	projectDir: string;
	inspection: SkillKindProjectInspection;
}

const skillKindArtifactFactsSchema = z.object({
	disable_model_invocation: z.boolean(),
	codex_sidecar: z.boolean(),
	user_invocable_key_present: z.boolean(),
	user_invocable_false: z.boolean(),
	pi_excluded: z.boolean(),
});

const skillKindReplacementSchema = z.object({
	verified: z.boolean(),
	surface: z.string().optional(),
	label: z.string(),
	evidence: z.string().optional(),
	advice: z.string().optional(),
});

const skillKindRecordSchema = z.object({
	skill: z.string(),
	kind: z.enum(INFERRED_SKILL_INVOCATION_KINDS),
	model_invocation: z.enum(MODEL_INVOCATION_STATUSES),
	native_direct: z.enum(NATIVE_DIRECT_STATUSES),
	pi_extension: z.enum(PI_EXTENSION_STATUSES),
	artifacts: skillKindArtifactFactsSchema,
	replacement: skillKindReplacementSchema,
	notes: z.array(z.string()),
});

const skillKindApplyOperationResultSchema = z.object({
	type: z.enum(APPLY_OPERATION_TYPES),
	path: z.string(),
	reason: z.string().optional(),
	applied: z.boolean(),
});

const skillKindApplyOperationStatusSchema = z.object({
	type: z.enum(APPLY_STATUS_OPERATION_TYPES),
	path: z.string(),
	description: z.string(),
	status: z.enum(["applied", "failed", "not_attempted", "skipped"]),
	error: z.unknown().optional(),
});

const skillKindApplySkillResultSchema = z.object({
	skill: z.string(),
	operations: z.array(z.union([skillKindApplyOperationResultSchema, skillKindApplyOperationStatusSchema])),
});

export const skillKindListRequestSchema = z.object({
	path: z.string().default(".").describe("Project directory or subdirectory to inspect (default: current directory)."),
});

export const skillKindShowRequestSchema = z.object({
	path: z.string().default(".").describe("Project directory or subdirectory to inspect (default: current directory)."),
	skill: z.string().describe("Local skill name or path-like skill spec."),
});

export const skillKindApplyRequestSchema = z.object({
	path: z.string().default(".").describe("Project directory or subdirectory to mutate (default: current directory)."),
	dry_run: z.boolean().default(false).describe("Show planned edits without writing files."),
	yes: z.boolean().default(false).describe("Approve deletion prompts for managed artifacts."),
	kind: z.enum(SKILL_INVOCATION_KINDS).describe("Desired skill invocation kind."),
	skills: z.array(z.string()).min(1).describe("Local skill names or path-like skill specs."),
});

export const skillKindListResultSchema = z.object({
	project_dir: z.string(),
	skills: z.array(skillKindRecordSchema),
});

export const skillKindShowResultSchema = z.object({
	project_dir: z.string(),
	skill: skillKindRecordSchema,
});

export const skillKindApplyResultSchema = z.object({
	project_dir: z.string(),
	kind: z.enum(SKILL_INVOCATION_KINDS),
	dry_run: z.boolean(),
	skills: z.array(skillKindApplySkillResultSchema),
	mutation_failed: z.boolean().optional(),
	operations: z.array(skillKindApplyOperationStatusSchema).optional(),
});

export type SkillKindListRequest = z.infer<typeof skillKindListRequestSchema>;
export type SkillKindShowRequest = z.infer<typeof skillKindShowRequestSchema>;
export type SkillKindApplyRequest = z.infer<typeof skillKindApplyRequestSchema>;
export type SkillKindRecordResult = z.infer<typeof skillKindRecordSchema>;
export type SkillKindListResult = z.infer<typeof skillKindListResultSchema>;
export type SkillKindShowResult = z.infer<typeof skillKindShowResultSchema>;
export type SkillKindApplyResult = z.infer<typeof skillKindApplyResultSchema>;

export function buildSkillGroup(): ClinkrGroup<AregCliContext> {
	const skillGroup = new ClinkrGroup<AregCliContext>({
		name: "skill",
		description: "Inspect and reconcile local skill invocation metadata.",
	});
	skillGroup.command({
		name: "list",
		description: "List local skill invocation status.",
		schema: skillKindListRequestSchema,
		resultSchema: skillKindListResultSchema,
		handler: runSkillKindList,
		renderHuman: renderSkillKindList,
	});
	skillGroup.command({
		name: "show",
		description: "Show invocation status for one local skill.",
		schema: skillKindShowRequestSchema,
		positionals: { skill: { position: 0 } },
		resultSchema: skillKindShowResultSchema,
		handler: runSkillKindShow,
		renderHuman: renderSkillKindShow,
	});
	skillGroup.command({
		name: "apply",
		description: "Apply the managed artifacts for a skill invocation kind. This reconciles managed artifacts to the requested kind. It is not a historical undo system; use git to roll back exact previous file contents.",
		schema: skillKindApplyRequestSchema,
		positionals: { kind: { position: 0 }, skills: { position: 1 } },
		resultSchema: skillKindApplyResultSchema,
		handler: runSkillKindApply,
		renderHuman: renderSkillKindApply,
	});
	return skillGroup;
}

export async function runSkillKindList(ctx: AregCliContext, request: SkillKindListRequest): Promise<ClinkrExit<SkillKindListResult>> {
	const resolved = await inspectResolvedProject(ctx, request.path);
	if (resolved.type === "error") return failure("project_inspection_failed", resolved.message);
	const records = buildSkillKindRecords(resolved.value.inspection);
	if (!records.ok) return skillKindRecordsFailure(records.error, { project_dir: resolved.value.projectDir, skills: [] });
	return ok({ project_dir: resolved.value.projectDir, skills: records.value.map(toSkillKindRecordResult) });
}

export async function runSkillKindShow(ctx: AregCliContext, request: SkillKindShowRequest): Promise<ClinkrExit<SkillKindShowResult>> {
	const resolved = await inspectResolvedProject(ctx, request.path);
	if (resolved.type === "error") return failure("project_inspection_failed", resolved.message);
	const resolvedSkill = await ctx.project.resolveLocalSkillSpec({ projectDir: resolved.value.projectDir, spec: request.skill, cwd: ctx.cwd, env: ctx.env });
	if (resolvedSkill.type === "error") return failure("skill_resolution_failed", resolvedSkill.error.message);
	const records = buildSkillKindRecords(resolved.value.inspection);
	if (!records.ok) return skillKindRecordsFailure(records.error, emptyShowResult(resolved.value.projectDir, resolvedSkill.skillName));
	const record = records.value.find((candidate) => candidate.skill === resolvedSkill.skillName);
	if (record === undefined) {
		return negative(`Local skill not found: ${request.skill}`, emptyShowResult(resolved.value.projectDir, resolvedSkill.skillName));
	}
	return ok({ project_dir: resolved.value.projectDir, skill: toSkillKindRecordResult(record) });
}

export async function runSkillKindApply(ctx: AregCliContext, request: SkillKindApplyRequest): Promise<ClinkrExit<SkillKindApplyResult>> {
	const resolved = await inspectResolvedProject(ctx, request.path);
	if (resolved.type === "error") return failure("project_inspection_failed", resolved.message);
	const projectDir = resolved.value.projectDir;
	const plans: SkillKindApplyPlan[] = [];
	let planningInspection = resolved.value.inspection;
	for (const spec of request.skills) {
		const resolvedSkill = await ctx.project.resolveLocalSkillSpec({ projectDir, spec, cwd: ctx.cwd, env: ctx.env });
		if (resolvedSkill.type === "error") return failure("skill_resolution_failed", resolvedSkill.error.message);
		const plan = buildSkillKindApplyPlan(planningInspection, resolvedSkill.skillName, request.kind);
		if (!plan.ok) return failure("skill_plan_failed", plan.error.message);
		plans.push(plan.value);
		planningInspection = inspectionAfterPlannedApply(planningInspection, plan.value);
	}
	if (request.dry_run) {
		return ok({
			project_dir: projectDir,
			kind: request.kind,
			dry_run: request.dry_run,
			skills: plans.map((plan) => ({ skill: plan.skill, operations: plan.operations.map((operation) => toApplyResult(operation, false, false)) })),
		});
	}
	if (!request.yes) {
		for (const plan of plans) {
			if (!hasDeletionPrompt(plan)) continue;
			const confirmed = await ctx.prompt.confirm({ message: deletionPrompt(plan), defaultValue: false });
			if (!confirmed) return negative(`Declined to apply ${request.kind} to ${plan.skill}.`, { project_dir: projectDir, kind: request.kind, dry_run: request.dry_run, skills: [] });
		}
	}
	const applyResult = await applyProjectMutationPlan({
		ctx,
		projectDir,
		policy: "skill-kind",
		writes: plans.flatMap(plannedWrites),
		deletes: plans.flatMap(plannedDeletes),
		removeEmptyDirs: plans.flatMap(plannedRemoveEmptyDirs),
	});
	if (!applyResult.ok) {
		return shellNegative(applyResult.error.message, {
			project_dir: projectDir,
			kind: request.kind,
			dry_run: false,
			mutation_failed: true,
			operations: [...applyResult.operationStatuses],
			skills: operationStatusesForPlans(plans, applyResult.operationStatuses).map((skill) => ({ skill: skill.skill, operations: [...skill.operations] })),
		});
	}
	return ok({
		project_dir: projectDir,
		kind: request.kind,
		dry_run: request.dry_run,
		skills: plans.map((plan) => ({
			skill: plan.skill,
			operations: plan.operations.map((operation) => toApplyResult(operation, true, applyResult.removedEmptyDirRelativePaths.includes(operation.relativePath))),
		})),
	});
}

function skillKindRecordsFailure<T>(error: { code: string; message: string }, shellNegativeData: T): ClinkrExit<T> {
	if (isPathStateError(error)) return shellNegative(error.message, shellNegativeData);
	return failure("skill_records_invalid", error.message);
}

export function renderSkillKindList(result: SkillKindListResult): string {
	if (result.skills.length === 0) return "No local skills found.";
	const includeNotes = result.skills.some((record) => record.notes.length > 0);
	const header = includeNotes ? "Skill\tKind\tModel\tNative\tPi\tNotes" : "Skill\tKind\tModel\tNative\tPi";
	const rows = result.skills.map((record) => {
		const base = [record.skill, record.kind, record.model_invocation, record.native_direct, record.pi_extension];
		if (includeNotes) base.push(record.notes.join("; "));
		return base.join("\t");
	});
	return [header, ...rows].join("\n");
}

export function renderSkillKindShow(result: SkillKindShowResult): string {
	const record = result.skill;
	const lines = [
		`Skill: ${record.skill}`,
		`Kind: ${record.kind}`,
		`model-invocation: ${record.model_invocation}`,
		`native-direct: ${record.native_direct}`,
		`pi-extension: ${record.pi_extension}`,
		"Artifacts:",
		`- disable-model-invocation: ${presence(record.artifacts.disable_model_invocation)}`,
		`- agents/openai.yaml: ${presence(record.artifacts.codex_sidecar)}`,
		`- user-invocable:false: ${presence(record.artifacts.user_invocable_false)}`,
		`- Pi skill exclusion: ${presence(record.artifacts.pi_excluded)}`,
		`- Pi replacement: ${record.replacement.label}`,
	];
	if (record.notes.length > 0) {
		lines.push("Notes:");
		for (const note of record.notes) lines.push(`- ${note}`);
	}
	return lines.join("\n");
}

export function renderSkillKindApply(result: SkillKindApplyResult): string {
	const lines: string[] = [];
	for (const skill of result.skills) {
		lines.push(`Applying ${result.kind} to ${skill.skill}...`);
		for (const operation of skill.operations) {
			const rendered = renderApplyOperation(operation, result.dry_run);
			if (rendered !== undefined) lines.push(rendered);
		}
	}
	return lines.join("\n");
}

async function inspectResolvedProject(ctx: AregCliContext, requestPath: string): Promise<{ type: "ok"; value: ResolvedProjectInspection } | { type: "error"; message: string; projectDir: string }> {
	const targetInspection = await inspectSkillKindProject(ctx, requestPath);
	if (targetInspection.projectPathState.type === "missing") return { type: "error", message: `Target ${targetInspection.projectDir} does not exist.`, projectDir: targetInspection.projectDir };
	if (targetInspection.projectPathState.type !== "directory") return { type: "error", message: `${targetInspection.projectDir} is not a directory.`, projectDir: targetInspection.projectDir };
	const repoRoot = await ctx.git.optionalRepoRoot({ cwd: targetInspection.projectDir });
	if (repoRoot.type === "error") return { type: "error", message: repoRoot.error.message, projectDir: targetInspection.projectDir };
	if (repoRoot.type === "missing") return { type: "error", message: `No Git root found containing ${targetInspection.projectDir}.`, projectDir: targetInspection.projectDir };
	if (repoRoot.value === targetInspection.projectDir) return { type: "ok", value: { projectDir: targetInspection.projectDir, inspection: targetInspection } };
	const rootInspection = await inspectSkillKindProject(ctx, repoRoot.value);
	return { type: "ok", value: { projectDir: repoRoot.value, inspection: rootInspection } };
}

function toSkillKindRecordResult(record: SkillKindRecord): SkillKindRecordResult {
	return {
		skill: record.skill,
		kind: record.kind,
		model_invocation: record.modelInvocation,
		native_direct: record.nativeDirect,
		pi_extension: record.piExtension,
		artifacts: {
			disable_model_invocation: record.artifacts.isModelInvocationDisabled,
			codex_sidecar: record.artifacts.hasCodexSidecar,
			user_invocable_key_present: record.artifacts.hasUserInvocableKey,
			user_invocable_false: record.artifacts.isUserInvocableFalse,
			pi_excluded: record.artifacts.isPiExcluded,
		},
		replacement: {
			verified: record.replacement.verified,
			surface: record.replacement.surface,
			label: record.replacement.label,
			evidence: record.replacement.evidence,
			advice: record.replacement.advice,
		},
		notes: [...record.notes],
	};
}

function renderApplyOperation(operation: SkillKindApplyResult["skills"][number]["operations"][number], dryRun: boolean): string | undefined {
	if (!("applied" in operation)) return undefined;
	switch (operation.type) {
		case "write":
			return `${dryRun ? "Would write" : "Wrote"} ${operation.path}`;
		case "skip":
			return `${dryRun ? "Would skip" : "Skipped"} ${operation.path}: ${operation.reason ?? "already current"}`;
		case "delete":
			return `${dryRun ? "Would delete" : "Deleted"} ${operation.path}`;
		case "remove_empty_dir":
			if (dryRun) return `Would remove ${operation.path} if empty`;
			return operation.applied ? `Removed ${operation.path}` : undefined;
	}
}

function presence(value: boolean): "present" | "absent" {
	return value ? "present" : "absent";
}

function emptyShowResult(projectDir: string, skillName: string): SkillKindShowResult {
	return {
		project_dir: projectDir,
		skill: {
			skill: skillName,
			kind: "inconsistent",
			model_invocation: "enabled",
			native_direct: "enabled",
			pi_extension: "n/a",
			artifacts: {
				disable_model_invocation: false,
				codex_sidecar: false,
				user_invocable_key_present: false,
				user_invocable_false: false,
				pi_excluded: false,
			},
			replacement: { verified: false, label: "replacement-missing" },
			notes: [],
		},
	};
}
