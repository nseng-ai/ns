import path from "node:path";

import {
	failure,
	negative,
	ok,
	requireInteractiveOrUsageError,
	type ClinkrExit,
	ClinkrGroup,
	type RenderCapabilities,
} from "@sdl/clinkr";
import { renderTextTable, type TextTableColumn } from "@sdl/core/text-table";
import { z } from "zod";

import type { AregCliContext } from "../context.ts";
import type {
	AregSkillFindRoot,
	AregSkillFindSkillInspection,
	AregSkillFindSourceType,
} from "../gateways.ts";
import { isPathStateError } from "./file-state.ts";
import { parseSkillFrontmatterBlock } from "./frontmatter.ts";
import { inspectSkillKindProject } from "./project-inspection.ts";
import {
	applyProjectMutationPlan,
	PROJECT_MUTATION_OPERATION_STATUSES,
} from "./project-mutations.ts";
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
	disableModelInvocation: z.boolean(),
	codexSidecar: z.boolean(),
	userInvocableKeyPresent: z.boolean(),
	userInvocableFalse: z.boolean(),
	piExcluded: z.boolean(),
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
	modelInvocation: z.enum(MODEL_INVOCATION_STATUSES),
	nativeDirect: z.enum(NATIVE_DIRECT_STATUSES),
	piExtension: z.enum(PI_EXTENSION_STATUSES),
	artifacts: skillKindArtifactFactsSchema,
	replacement: skillKindReplacementSchema,
	notes: z.array(z.string()),
});

const skillKindApplyOperationResultSchema = z.object({
	type: z.enum(APPLY_OPERATION_TYPES),
	path: z.string(),
	reason: z.string().optional(),
	isApplied: z.boolean(),
});

const skillKindApplyOperationStatusSchema = z.object({
	type: z.enum(APPLY_STATUS_OPERATION_TYPES),
	path: z.string(),
	description: z.string(),
	status: z.enum(PROJECT_MUTATION_OPERATION_STATUSES),
	error: z.unknown().optional(),
});

const skillKindApplySkillResultSchema = z.object({
	skill: z.string(),
	operations: z.array(
		z.union([skillKindApplyOperationResultSchema, skillKindApplyOperationStatusSchema]),
	),
});

const SKILL_FIND_ROOTS = [
	{ root: "skills", sourceType: "repo" },
	{ root: ".agents/skills", sourceType: "vendored" },
	{ root: ".claude/skills", sourceType: "claude" },
] as const satisfies ReadonlyArray<{
	root: AregSkillFindRoot;
	sourceType: AregSkillFindSourceType;
}>;

const skillFindRootSchema = z.enum(["skills", ".agents/skills", ".claude/skills"]);
const skillFindSourceTypeSchema = z.enum(["repo", "vendored", "claude"]);

const skillFindWarningSchema = z.object({
	code: z.string(),
	message: z.string(),
	path: z.string(),
});

const skillFindMatchSchema = z.object({
	name: z.string(),
	root: skillFindRootSchema,
	sourceType: skillFindSourceTypeSchema,
	isPreferred: z.boolean(),
	baseRelativePath: z.string(),
	skillFileRelativePath: z.string(),
	basePath: z.string(),
	skillFilePath: z.string(),
	frontmatterName: z.string().optional(),
	description: z.string().optional(),
	disableModelInvocation: z.boolean().optional(),
	warnings: z.array(skillFindWarningSchema).optional(),
});

const skillFindSearchedRootSchema = z.object({
	root: skillFindRootSchema,
	sourceType: skillFindSourceTypeSchema,
	rootRelativePath: z.string(),
	searchedRelativePath: z.string(),
	searchedPath: z.string(),
});

const skillFindCandidateSchema = z.object({
	name: z.string(),
	roots: z.array(skillFindRootSchema),
});

export const skillFindRequestSchema = z.object({
	path: z
		.string()
		.default(".")
		.describe("Project directory or subdirectory to inspect (default: current directory)."),
	skill: z.string().describe("Exact managed skill name to find."),
});

export const skillFindSuccessResultSchema = z.object({
	projectDir: z.string(),
	query: z.string(),
	preferred: skillFindMatchSchema,
	matches: z.array(skillFindMatchSchema),
	searchedRoots: z.array(skillFindSearchedRootSchema),
});

export const skillFindMissResultSchema = z.object({
	projectDir: z.string(),
	query: z.string(),
	matches: z.array(skillFindMatchSchema),
	candidates: z.array(skillFindCandidateSchema),
	candidateLimit: z.number(),
	searchedRoots: z.array(skillFindSearchedRootSchema),
});

export const skillFindResultSchema = z.union([
	skillFindSuccessResultSchema,
	skillFindMissResultSchema,
]);

export const skillKindListRequestSchema = z.object({
	path: z
		.string()
		.default(".")
		.describe("Project directory or subdirectory to inspect (default: current directory)."),
});

export const skillKindShowRequestSchema = z.object({
	path: z
		.string()
		.default(".")
		.describe("Project directory or subdirectory to inspect (default: current directory)."),
	skill: z.string().describe("Installed skill name or path-like skill spec."),
});

export const skillKindApplyRequestSchema = z.object({
	path: z
		.string()
		.default(".")
		.describe("Project directory or subdirectory to mutate (default: current directory)."),
	dryRun: z.boolean().default(false).describe("Show planned edits without writing files."),
	yes: z.boolean().default(false).describe("Approve deletion prompts for managed artifacts."),
	kind: z.enum(SKILL_INVOCATION_KINDS).describe("Desired skill invocation kind."),
	skills: z.array(z.string()).min(1).describe("Installed skill names or path-like skill specs."),
});

export const skillKindListResultSchema = z.object({
	projectDir: z.string(),
	skills: z.array(skillKindRecordSchema),
});

export const skillKindShowResultSchema = z.object({
	projectDir: z.string(),
	skill: skillKindRecordSchema,
});

export const skillKindApplyResultSchema = z.object({
	projectDir: z.string(),
	kind: z.enum(SKILL_INVOCATION_KINDS),
	dryRun: z.boolean(),
	skills: z.array(skillKindApplySkillResultSchema),
	mutationFailed: z.boolean().optional(),
	operations: z.array(skillKindApplyOperationStatusSchema).optional(),
});

export type SkillFindRequest = z.infer<typeof skillFindRequestSchema>;
export type SkillFindMatch = z.infer<typeof skillFindMatchSchema>;
export type SkillFindSearchedRoot = z.infer<typeof skillFindSearchedRootSchema>;
export type SkillFindSuccessResult = z.infer<typeof skillFindSuccessResultSchema>;
export type SkillFindMissResult = z.infer<typeof skillFindMissResultSchema>;
export type SkillFindResult = z.infer<typeof skillFindResultSchema>;
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
		description: "Inspect and reconcile installed skill invocation metadata.",
	});
	skillGroup.command({
		name: "find",
		description: "Find a managed skill by exact name.",
		schema: skillFindRequestSchema,
		positionals: { skill: { position: 0 } },
		resultSchema: skillFindResultSchema,
		handler: runSkillFind,
		renderHuman: renderSkillFind,
	});
	skillGroup.command({
		name: "list",
		description: "List installed skill invocation status.",
		schema: skillKindListRequestSchema,
		resultSchema: skillKindListResultSchema,
		handler: runSkillKindList,
		renderHuman: renderSkillKindList,
	});
	skillGroup.command({
		name: "show",
		description: "Show invocation status for one installed skill.",
		schema: skillKindShowRequestSchema,
		positionals: { skill: { position: 0 } },
		resultSchema: skillKindShowResultSchema,
		handler: runSkillKindShow,
		renderHuman: renderSkillKindShow,
	});
	skillGroup.command({
		name: "apply",
		description:
			"Apply the managed artifacts for a skill invocation kind. This reconciles managed artifacts to the requested kind. It is not a historical undo system; use git to roll back exact previous file contents.",
		schema: skillKindApplyRequestSchema,
		positionals: { kind: { position: 0 }, skills: { position: 1 } },
		options: { yes: { short: "-y" } },
		resultSchema: skillKindApplyResultSchema,
		handler: runSkillKindApply,
		renderHuman: renderSkillKindApply,
	});
	return skillGroup;
}

export async function runSkillFind(
	ctx: AregCliContext,
	request: SkillFindRequest,
): Promise<ClinkrExit<SkillFindResult>> {
	const resolved = await inspectResolvedProjectDir(ctx, request.path);
	if (resolved.type === "error") return failure("project-inspection-failed", resolved.message);
	const projectDir = resolved.projectDir;
	const inspection = await ctx.project.inspectSkillFindRoots({ projectDir, env: ctx.env });
	const searchedRoots = buildSkillFindSearchedRoots(projectDir, request.skill);
	const exactSkills = inspection.skills
		.filter((skill) => skill.name === request.skill)
		.toSorted(compareSkillFindInspection);
	if (exactSkills.length > 0) {
		const matches = exactSkills.map((skill, index) =>
			toSkillFindMatch(projectDir, skill, index === 0),
		);
		const preferred = matches[0];
		if (preferred === undefined)
			return failure(
				"skill-find-invalid-result",
				`Exact skill vanished while finding ${request.skill}.`,
			);
		return ok({
			projectDir,
			query: request.skill,
			preferred,
			matches,
			searchedRoots,
		});
	}
	const miss = {
		projectDir,
		query: request.skill,
		matches: [],
		candidates: buildSkillFindCandidates(inspection.skills, request.skill, 10),
		candidateLimit: 10,
		searchedRoots,
	};
	return negative(`Skill not found: ${request.skill}`, {
		data: miss,
		human: renderSkillFindMiss(miss),
	});
}

export async function runSkillKindList(
	ctx: AregCliContext,
	request: SkillKindListRequest,
): Promise<ClinkrExit<SkillKindListResult>> {
	const resolved = await inspectResolvedProject(ctx, request.path);
	if (resolved.type === "error") return failure("project-inspection-failed", resolved.message);
	const records = buildSkillKindRecords(resolved.value.inspection);
	if (!records.ok)
		return skillKindRecordsFailure(records.error, {
			projectDir: resolved.value.projectDir,
			skills: [],
		});
	return ok({
		projectDir: resolved.value.projectDir,
		skills: records.value.map(toSkillKindRecordResult),
	});
}

export async function runSkillKindShow(
	ctx: AregCliContext,
	request: SkillKindShowRequest,
): Promise<ClinkrExit<SkillKindShowResult>> {
	const resolved = await inspectResolvedProject(ctx, request.path);
	if (resolved.type === "error") return failure("project-inspection-failed", resolved.message);
	const resolvedSkill = await ctx.project.resolveSkillKindSpec({
		projectDir: resolved.value.projectDir,
		spec: request.skill,
		cwd: ctx.cwd,
		env: ctx.env,
	});
	if (resolvedSkill.type === "error")
		return failure("skill-resolution-failed", resolvedSkill.error.message);
	const records = buildSkillKindRecords(resolved.value.inspection);
	if (!records.ok)
		return skillKindRecordsFailure(
			records.error,
			emptyShowResult(resolved.value.projectDir, resolvedSkill.skillName),
		);
	const record = records.value.find((candidate) => candidate.skill === resolvedSkill.skillName);
	if (record === undefined) {
		return negative(`Managed skill not found: ${request.skill}`, {
			data: emptyShowResult(resolved.value.projectDir, resolvedSkill.skillName),
		});
	}
	return ok({ projectDir: resolved.value.projectDir, skill: toSkillKindRecordResult(record) });
}

export async function runSkillKindApply(
	ctx: AregCliContext,
	request: SkillKindApplyRequest,
): Promise<ClinkrExit<SkillKindApplyResult>> {
	const resolved = await inspectResolvedProject(ctx, request.path);
	if (resolved.type === "error") return failure("project-inspection-failed", resolved.message);
	const projectDir = resolved.value.projectDir;
	const plans: SkillKindApplyPlan[] = [];
	let planningInspection = resolved.value.inspection;
	for (const spec of request.skills) {
		const resolvedSkill = await ctx.project.resolveSkillKindSpec({
			projectDir,
			spec,
			cwd: ctx.cwd,
			env: ctx.env,
		});
		if (resolvedSkill.type === "error")
			return failure("skill-resolution-failed", resolvedSkill.error.message);
		const plan = buildSkillKindApplyPlan(planningInspection, resolvedSkill.skillName, request.kind);
		if (!plan.ok) return failure("skill-plan-failed", plan.error.message);
		plans.push(plan.value);
		planningInspection = inspectionAfterPlannedApply(planningInspection, plan.value);
	}
	if (request.dryRun) {
		return ok({
			projectDir: projectDir,
			kind: request.kind,
			dryRun: request.dryRun,
			skills: plans.map((plan) => ({
				skill: plan.skill,
				operations: plan.operations.map((operation) => toApplyResult(operation, false, false)),
			})),
		});
	}
	if (!request.yes) {
		for (const plan of plans) {
			if (!hasDeletionPrompt(plan)) continue;
			const gate = requireInteractiveOrUsageError(ctx.interaction, {
				message: "Deleting managed skill artifacts requires --yes when non-interactive.",
				missingFlag: "--yes",
				howToSupply: "Pass --yes (or -y) to apply deletion prompts without prompting.",
			});
			if (gate) return gate;
			const confirmed = await ctx.interaction.confirm({
				message: deletionPrompt(plan),
				defaultAnswer: "no",
			});
			if (confirmed.type === "aborted") return failure("aborted", "Aborted!");
			if (confirmed.type === "declined")
				return ok(
					{
						projectDir: projectDir,
						kind: request.kind,
						dryRun: request.dryRun,
						skills: [],
					},
					{ human: `Declined to apply ${request.kind} to ${plan.skill}.` },
				);
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
		return failure("skill-kind-apply-failed", applyResult.error.message, {
			projectDir: projectDir,
			kind: request.kind,
			dryRun: false,
			mutationFailed: true,
			operations: [...applyResult.operationStatuses],
			skills: operationStatusesForPlans(plans, applyResult.operationStatuses).map((skill) => ({
				skill: skill.skill,
				operations: [...skill.operations],
			})),
		});
	}
	return ok({
		projectDir: projectDir,
		kind: request.kind,
		dryRun: request.dryRun,
		skills: plans.map((plan) => ({
			skill: plan.skill,
			operations: plan.operations.map((operation) =>
				toApplyResult(
					operation,
					true,
					applyResult.removedEmptyDirRelativePaths.includes(operation.relativePath),
				),
			),
		})),
	});
}

function skillKindRecordsFailure<T>(
	error: { code: string; message: string },
	negativeData: T,
): ClinkrExit<T> {
	if (isPathStateError(error)) return negative(error.message, { data: negativeData });
	return failure("skill-records-invalid", error.message);
}

export function renderSkillFind(result: SkillFindResult): string {
	if ("preferred" in result) return renderSkillFindSuccess(result);
	return renderSkillFindMiss(result);
}

export function renderSkillKindList(
	result: SkillKindListResult,
	caps: RenderCapabilities = { canEmitAnsi: false },
): string {
	if (result.skills.length === 0) return "No managed skills found.";
	const includeNotes = result.skills.some((record) => record.notes.length > 0);
	const columns: TextTableColumn[] = [
		{ header: "SKILL", style: "bold-cyan" },
		{ header: "KIND" },
		{ header: "MODEL" },
		{ header: "NATIVE" },
		{ header: "PI" },
	];
	if (includeNotes) columns.push({ header: "NOTES", style: "dim" });
	return renderTextTable({
		columns,
		rows: result.skills.map((record) => {
			const base = [
				record.skill,
				record.kind,
				record.modelInvocation,
				record.nativeDirect,
				record.piExtension,
			];
			if (includeNotes) base.push(record.notes.join("; "));
			return base;
		}),
		canEmitAnsi: caps.canEmitAnsi,
		shouldDrawRule: true,
		headerStyle: "bold-cyan",
	});
}

export function renderSkillKindShow(result: SkillKindShowResult): string {
	const record = result.skill;
	const lines = [
		`Skill: ${record.skill}`,
		`Kind: ${record.kind}`,
		`model-invocation: ${record.modelInvocation}`,
		`native-direct: ${record.nativeDirect}`,
		`pi-extension: ${record.piExtension}`,
		"Artifacts:",
		`- disable-model-invocation: ${presence(record.artifacts.disableModelInvocation)}`,
		`- agents/openai.yaml: ${presence(record.artifacts.codexSidecar)}`,
		`- user-invocable:false: ${presence(record.artifacts.userInvocableFalse)}`,
		`- Pi skill exclusion: ${presence(record.artifacts.piExcluded)}`,
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
			const rendered = renderApplyOperation(operation, result.dryRun);
			if (rendered !== undefined) lines.push(rendered);
		}
	}
	return lines.join("\n");
}

function buildSkillFindSearchedRoots(projectDir: string, query: string): SkillFindSearchedRoot[] {
	return SKILL_FIND_ROOTS.map((root) => {
		const searchedRelativePath = `${root.root}/${query}/SKILL.md`;
		return {
			root: root.root,
			sourceType: root.sourceType,
			rootRelativePath: root.root,
			searchedRelativePath,
			searchedPath: path.join(projectDir, ...searchedRelativePath.split("/")),
		};
	});
}

function toSkillFindMatch(
	projectDir: string,
	skill: AregSkillFindSkillInspection,
	isPreferred: boolean,
): SkillFindMatch {
	const skillFileRelativePath = `${skill.baseRelativePath}/SKILL.md`;
	const skillFilePath = path.join(projectDir, ...skillFileRelativePath.split("/"));
	const frontmatter = parseSkillFindFrontmatter(skillFileRelativePath, skill.skillMd);
	return {
		name: skill.name,
		root: skill.root,
		sourceType: skill.sourceType,
		isPreferred,
		baseRelativePath: skill.baseRelativePath,
		skillFileRelativePath,
		basePath: path.join(projectDir, ...skill.baseRelativePath.split("/")),
		skillFilePath,
		...frontmatter.fields,
		...(frontmatter.warnings.length === 0 ? {} : { warnings: frontmatter.warnings }),
	};
}

function parseSkillFindFrontmatter(
	skillFileRelativePath: string,
	skillMd: AregSkillFindSkillInspection["skillMd"],
): {
	fields: Pick<SkillFindMatch, "frontmatterName" | "description" | "disableModelInvocation">;
	warnings: Array<{ code: string; message: string; path: string }>;
} {
	if (skillMd.type !== "file") {
		return {
			fields: {},
			warnings: [
				{
					code: "skill-file-unreadable",
					message: `Expected readable SKILL.md, got ${skillMd.type}.`,
					path: skillFileRelativePath,
				},
			],
		};
	}
	const parsed = parseSkillFrontmatterBlock(skillMd.text);
	if (!parsed.ok) {
		return {
			fields: {},
			warnings: [
				{
					code: parsed.error.code.replaceAll("_", "-"),
					message: parsed.error.message,
					path: skillFileRelativePath,
				},
			],
		};
	}
	const frontmatterName = nonEmpty(parsed.value.fields.name);
	const description = nonEmpty(parsed.value.fields.description);
	const disableModelInvocation = parseOptionalBoolean(
		parsed.value.fields["disable-model-invocation"],
	);
	return {
		fields: {
			...(frontmatterName === undefined ? {} : { frontmatterName }),
			...(description === undefined ? {} : { description }),
			...(disableModelInvocation === undefined ? {} : { disableModelInvocation }),
		},
		warnings: [],
	};
}

function parseOptionalBoolean(value: string | undefined): boolean | undefined {
	if (value === "true") return true;
	if (value === "false") return false;
	return undefined;
}

function nonEmpty(value: string | undefined): string | undefined {
	if (value === undefined) return undefined;
	return value.length === 0 ? undefined : value;
}

function buildSkillFindCandidates(
	skills: readonly AregSkillFindSkillInspection[],
	query: string,
	limit: number,
): Array<{ name: string; roots: AregSkillFindRoot[] }> {
	const rootByName = new Map<string, Set<AregSkillFindRoot>>();
	for (const skill of skills) {
		const roots = rootByName.get(skill.name) ?? new Set<AregSkillFindRoot>();
		roots.add(skill.root);
		rootByName.set(skill.name, roots);
	}
	const names = [...rootByName.keys()].toSorted();
	const lowerQuery = query.toLocaleLowerCase();
	const rankedNames = [
		...names.filter((name) => name.toLocaleLowerCase().startsWith(lowerQuery)),
		...names.filter(
			(name) =>
				!name.toLocaleLowerCase().startsWith(lowerQuery) &&
				name.toLocaleLowerCase().includes(lowerQuery),
		),
	];
	return rankedNames.slice(0, limit).map((name) => ({
		name,
		roots: orderedRoots(rootByName.get(name) ?? new Set()),
	}));
}

function orderedRoots(roots: ReadonlySet<AregSkillFindRoot>): AregSkillFindRoot[] {
	return SKILL_FIND_ROOTS.map((root) => root.root).filter((root) => roots.has(root));
}

function compareSkillFindInspection(
	left: AregSkillFindSkillInspection,
	right: AregSkillFindSkillInspection,
): number {
	return rootRank(left.root) - rootRank(right.root) || left.name.localeCompare(right.name);
}

function rootRank(root: AregSkillFindRoot): number {
	const index = SKILL_FIND_ROOTS.findIndex((candidate) => candidate.root === root);
	return index === -1 ? SKILL_FIND_ROOTS.length : index;
}

function renderSkillFindSuccess(result: SkillFindSuccessResult): string {
	const lines = [result.query];
	const hasDuplicates = result.matches.length > 1;
	for (const match of result.matches) {
		const marker = hasDuplicates ? (match.isPreferred ? "* " : "  ") : "";
		lines.push(`  ${marker}${match.skillFileRelativePath}`);
	}
	return lines.join("\n");
}

function renderSkillFindMiss(result: SkillFindMissResult): string {
	const lines = [`Skill not found: ${result.query}`, "Searched:"];
	for (const root of result.searchedRoots) lines.push(`  ${root.searchedRelativePath}`);
	if (result.candidates.length > 0) {
		lines.push("", "Did you mean:");
		for (const candidate of result.candidates) lines.push(`  ${candidate.name}`);
	}
	return lines.join("\n");
}

async function inspectResolvedProjectDir(
	ctx: AregCliContext,
	requestPath: string,
): Promise<
	{ type: "ok"; projectDir: string } | { type: "error"; message: string; projectDir: string }
> {
	const targetInspection = await ctx.project.inspectProjectBase({
		cwd: ctx.cwd,
		projectPath: requestPath,
		env: ctx.env,
	});
	if (targetInspection.projectPathState.type === "missing")
		return {
			type: "error",
			message: `Target ${targetInspection.projectDir} does not exist.`,
			projectDir: targetInspection.projectDir,
		};
	if (targetInspection.projectPathState.type !== "directory")
		return {
			type: "error",
			message: `${targetInspection.projectDir} is not a directory.`,
			projectDir: targetInspection.projectDir,
		};
	const repoRoot = await ctx.git.optionalRepoRoot({ cwd: targetInspection.projectDir });
	if (repoRoot.type === "error")
		return {
			type: "error",
			message: repoRoot.error.message,
			projectDir: targetInspection.projectDir,
		};
	if (repoRoot.type === "missing")
		return {
			type: "error",
			message: `No Git root found containing ${targetInspection.projectDir}.`,
			projectDir: targetInspection.projectDir,
		};
	return { type: "ok", projectDir: repoRoot.value };
}

async function inspectResolvedProject(
	ctx: AregCliContext,
	requestPath: string,
): Promise<
	| { type: "ok"; value: ResolvedProjectInspection }
	| { type: "error"; message: string; projectDir: string }
> {
	const targetInspection = await inspectSkillKindProject(ctx, requestPath);
	if (targetInspection.projectPathState.type === "missing")
		return {
			type: "error",
			message: `Target ${targetInspection.projectDir} does not exist.`,
			projectDir: targetInspection.projectDir,
		};
	if (targetInspection.projectPathState.type !== "directory")
		return {
			type: "error",
			message: `${targetInspection.projectDir} is not a directory.`,
			projectDir: targetInspection.projectDir,
		};
	const repoRoot = await ctx.git.optionalRepoRoot({ cwd: targetInspection.projectDir });
	if (repoRoot.type === "error")
		return {
			type: "error",
			message: repoRoot.error.message,
			projectDir: targetInspection.projectDir,
		};
	if (repoRoot.type === "missing")
		return {
			type: "error",
			message: `No Git root found containing ${targetInspection.projectDir}.`,
			projectDir: targetInspection.projectDir,
		};
	if (repoRoot.value === targetInspection.projectDir)
		return {
			type: "ok",
			value: { projectDir: targetInspection.projectDir, inspection: targetInspection },
		};
	const rootInspection = await inspectSkillKindProject(ctx, repoRoot.value);
	return { type: "ok", value: { projectDir: repoRoot.value, inspection: rootInspection } };
}

function toSkillKindRecordResult(record: SkillKindRecord): SkillKindRecordResult {
	return {
		skill: record.skill,
		kind: record.kind,
		modelInvocation: record.modelInvocation,
		nativeDirect: record.nativeDirect,
		piExtension: record.piExtension,
		artifacts: {
			disableModelInvocation: record.artifacts.isModelInvocationDisabled,
			codexSidecar: record.artifacts.hasCodexSidecar,
			userInvocableKeyPresent: record.artifacts.hasUserInvocableKey,
			userInvocableFalse: record.artifacts.isUserInvocableFalse,
			piExcluded: record.artifacts.isPiExcluded,
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

function renderApplyOperation(
	operation: SkillKindApplyResult["skills"][number]["operations"][number],
	dryRun: boolean,
): string | undefined {
	if (!("isApplied" in operation)) return undefined;
	switch (operation.type) {
		case "write":
			return `${dryRun ? "Would write" : "Wrote"} ${operation.path}`;
		case "skip":
			return `${dryRun ? "Would skip" : "Skipped"} ${operation.path}: ${operation.reason ?? "already current"}`;
		case "delete":
			return `${dryRun ? "Would delete" : "Deleted"} ${operation.path}`;
		case "remove-empty-dir":
			if (dryRun) return `Would remove ${operation.path} if empty`;
			return operation.isApplied ? `Removed ${operation.path}` : undefined;
	}
}

function presence(value: boolean): "present" | "absent" {
	return value ? "present" : "absent";
}

function emptyShowResult(projectDir: string, skillName: string): SkillKindShowResult {
	return {
		projectDir: projectDir,
		skill: {
			skill: skillName,
			kind: "inconsistent",
			modelInvocation: "enabled",
			nativeDirect: "enabled",
			piExtension: "n/a",
			artifacts: {
				disableModelInvocation: false,
				codexSidecar: false,
				userInvocableKeyPresent: false,
				userInvocableFalse: false,
				piExcluded: false,
			},
			replacement: { verified: false, label: "replacement-missing" },
			notes: [],
		},
	};
}
