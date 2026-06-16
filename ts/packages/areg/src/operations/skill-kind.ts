import { failure, negative, ok, type ClinkrExit, ClinkrGroup } from "@asdl/clinkr";
import { z } from "zod";

import type { AregCliContext } from "../context.ts";
import type {
	AregGenericReplacementInspection,
	AregPathState,
	AregSkillKindDeletePlan,
	AregSkillKindRemoveEmptyDirPlan,
	AregSkillKindSkillInspection,
	AregSkillKindTextFileState,
	AregSkillKindTextWritePlan,
} from "../gateways.ts";
import { sortStrings } from "../sort.ts";
import { parseSkillFrontmatterBlock, transformSkillFrontmatter, type SkillFrontmatterData } from "./frontmatter.ts";
import type { OperationResult } from "./operation-result.ts";
import { formatReplacementLabel, replacementAdvice, verifyPiReplacement, type PiReplacementVerification } from "./pi-replacement.ts";
import { parsePiSettings, type PiSettingsData } from "./pi-settings.ts";
import { collectLocalSkillKindInspections, collectProjectInspectionFacts } from "./project-inspection.ts";
import { applyProjectMutationPlan } from "./project-mutations.ts";

const SKILL_INVOCATION_KINDS = ["normal", "invoke-only", "command-backed", "ambient-only"] as const;
const INFERRED_SKILL_INVOCATION_KINDS = [...SKILL_INVOCATION_KINDS, "mixed", "inconsistent"] as const;
const MODEL_INVOCATION_STATUSES = ["enabled", "disabled", "mixed"] as const;
const NATIVE_DIRECT_STATUSES = ["enabled", "partial", "mixed"] as const;
const PI_EXTENSION_STATUSES = ["n/a", "enabled", "missing"] as const;
const APPLY_OPERATION_TYPES = ["write", "skip", "delete", "remove_empty_dir"] as const;
const DISABLE_MODEL_INVOCATION_KEY = "disable-model-invocation";
const USER_INVOCABLE_KEY = "user-invocable";
const MANAGED_OPENAI_POLICY = "policy:\n  allow_implicit_invocation: false\n";

export type SkillInvocationKind = (typeof SKILL_INVOCATION_KINDS)[number];
export type InferredSkillInvocationKind = (typeof INFERRED_SKILL_INVOCATION_KINDS)[number];
export type ModelInvocationStatus = (typeof MODEL_INVOCATION_STATUSES)[number];
export type NativeDirectStatus = (typeof NATIVE_DIRECT_STATUSES)[number];
export type PiExtensionStatus = (typeof PI_EXTENSION_STATUSES)[number];

type ApplyOperationType = (typeof APPLY_OPERATION_TYPES)[number];

export interface SkillKindArtifactFacts {
	isModelInvocationDisabled: boolean;
	hasCodexSidecar: boolean;
	hasUserInvocableKey: boolean;
	isUserInvocableFalse: boolean;
	isPiExcluded: boolean;
}

export interface SkillKindReplacementInfo {
	verified: boolean;
	surface?: string | undefined;
	label: string;
	evidence?: string | undefined;
	advice?: string | undefined;
}

export interface SkillKindRecord {
	skill: string;
	kind: InferredSkillInvocationKind;
	modelInvocation: ModelInvocationStatus;
	nativeDirect: NativeDirectStatus;
	piExtension: PiExtensionStatus;
	artifacts: SkillKindArtifactFacts;
	replacement: SkillKindReplacementInfo;
	notes: readonly string[];
}

type FrontmatterInspection = SkillFrontmatterData;

interface ResolvedProjectInspection {
	projectDir: string;
	inspection: SkillKindProjectInspection;
}

interface SkillKindProjectInspection {
	projectDir: string;
	projectPathState: AregPathState;
	piDir: AregPathState;
	piSettings: AregSkillKindTextFileState;
	genericReplacement: AregGenericReplacementInspection;
	skills: readonly AregSkillKindSkillInspection[];
}

interface PlannedApplyOperationBase {
	type: ApplyOperationType;
	relativePath: string;
	description: string;
}

interface PlannedWriteOperation extends PlannedApplyOperationBase {
	type: "write";
	content: string;
	createParent: boolean;
}

interface PlannedSkipOperation extends PlannedApplyOperationBase {
	type: "skip";
	reason: string;
}

interface PlannedDeleteOperation extends PlannedApplyOperationBase {
	type: "delete";
}

interface PlannedRemoveEmptyDirOperation extends PlannedApplyOperationBase {
	type: "remove_empty_dir";
}

type PlannedApplyOperation = PlannedWriteOperation | PlannedSkipOperation | PlannedDeleteOperation | PlannedRemoveEmptyDirOperation;

interface SkillKindApplyPlan {
	skill: string;
	kind: SkillInvocationKind;
	operations: readonly PlannedApplyOperation[];
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

const skillKindApplySkillResultSchema = z.object({
	skill: z.string(),
	operations: z.array(skillKindApplyOperationResultSchema),
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
	if (records.type === "error") return failure("skill_records_invalid", records.message);
	return ok({ project_dir: resolved.value.projectDir, skills: records.value.map(toSkillKindRecordResult) });
}

export async function runSkillKindShow(ctx: AregCliContext, request: SkillKindShowRequest): Promise<ClinkrExit<SkillKindShowResult>> {
	const resolved = await inspectResolvedProject(ctx, request.path);
	if (resolved.type === "error") return failure("project_inspection_failed", resolved.message);
	const resolvedSkill = await ctx.project.resolveLocalSkillSpec({ projectDir: resolved.value.projectDir, spec: request.skill, cwd: ctx.cwd, env: ctx.env });
	if (resolvedSkill.type === "error") return failure("skill_resolution_failed", resolvedSkill.error.message);
	const records = buildSkillKindRecords(resolved.value.inspection);
	if (records.type === "error") return failure("skill_records_invalid", records.message);
	const record = records.value.find((candidate) => candidate.skill === resolvedSkill.skillName);
	if (record === undefined) {
		return negative(`Local skill not found: ${request.skill}`, emptyShowResult(resolved.value.projectDir, resolvedSkill.skillName));
	}
	return ok({ project_dir: resolved.value.projectDir, skill: toSkillKindRecordResult(record) });
}

export async function runSkillKindApply(ctx: AregCliContext, request: SkillKindApplyRequest): Promise<ClinkrExit<SkillKindApplyResult>> {
	const firstResolved = await inspectResolvedProject(ctx, request.path);
	if (firstResolved.type === "error") return failure("project_inspection_failed", firstResolved.message);
	const projectDir = firstResolved.value.projectDir;
	const skillResults: SkillKindApplyResult["skills"] = [];
	for (const spec of request.skills) {
		const resolved = await inspectResolvedProject(ctx, projectDir);
		if (resolved.type === "error") return failure("project_inspection_failed", resolved.message);
		const resolvedSkill = await ctx.project.resolveLocalSkillSpec({ projectDir, spec, cwd: ctx.cwd, env: ctx.env });
		if (resolvedSkill.type === "error") return failure("skill_resolution_failed", resolvedSkill.error.message);
		const plan = buildSkillKindApplyPlan(resolved.value.inspection, resolvedSkill.skillName, request.kind);
		if (plan.type === "error") return failure("skill_plan_failed", plan.message);
		if (!request.dry_run && !request.yes && hasDeletionPrompt(plan.value)) {
			const confirmed = await ctx.prompt.confirm({ message: deletionPrompt(plan.value), defaultValue: false });
			if (!confirmed) return negative(`Declined to apply ${request.kind} to ${plan.value.skill}.`, { project_dir: projectDir, kind: request.kind, dry_run: request.dry_run, skills: skillResults });
		}
		if (request.dry_run) {
			skillResults.push({ skill: plan.value.skill, operations: plan.value.operations.map((operation) => toApplyOperationResult(operation, false, false)) });
			continue;
		}
		const applyResult = await applyProjectMutationPlan({
			ctx,
			projectDir,
			policy: "skill-kind",
			writes: plannedWrites(plan.value),
			deletes: plannedDeletes(plan.value),
			removeEmptyDirs: plannedRemoveEmptyDirs(plan.value),
		});
		if (!applyResult.ok) return failure("write_failed", applyResult.error.message);
		skillResults.push({
			skill: plan.value.skill,
			operations: plan.value.operations.map((operation) => toApplyOperationResult(operation, true, applyResult.removedEmptyDirRelativePaths.includes(operation.relativePath))),
		});
	}
	return ok({ project_dir: projectDir, kind: request.kind, dry_run: request.dry_run, skills: skillResults });
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

export function inspectSkillFrontmatter(text: string, pathLabel: string): OperationResult<FrontmatterInspection> {
	const parsed = parseSkillFrontmatterBlock(text);
	if (parsed.type === "error") return { type: "error", message: `${pathLabel} ${parsed.message}` };
	return parsed;
}

export function inferSkillKindRecord(options: {
	skillName: string;
	frontmatter: FrontmatterInspection;
	hasCodexSidecar: boolean;
	isPiExcluded: boolean;
	replacement: PiReplacementVerification;
}): SkillKindRecord {
	const isModelInvocationDisabled = truthyFrontmatterValue(options.frontmatter.fields[DISABLE_MODEL_INVOCATION_KEY]);
	const hasUserInvocableKey = options.frontmatter.keys.has(USER_INVOCABLE_KEY);
	const isUserInvocableFalse = falsyFrontmatterValue(options.frontmatter.fields[USER_INVOCABLE_KEY]);
	const artifacts: SkillKindArtifactFacts = {
		isModelInvocationDisabled,
		hasCodexSidecar: options.hasCodexSidecar,
		hasUserInvocableKey,
		isUserInvocableFalse,
		isPiExcluded: options.isPiExcluded,
	};
	const kind = inferKind(artifacts, options.replacement);
	const replacement: SkillKindReplacementInfo = {
		verified: options.replacement.verified,
		surface: options.replacement.surface,
		label: formatReplacementLabel(options.replacement),
		evidence: options.replacement.verified ? replacementEvidence(options.replacement) : undefined,
		advice: options.replacement.verified ? undefined : replacementAdvice(options.skillName, options.replacement.surface),
	};
	return {
		skill: options.skillName,
		kind,
		modelInvocation: modelInvocationStatus(artifacts),
		nativeDirect: nativeDirectStatus(kind, artifacts),
		piExtension: piExtensionStatus(artifacts, options.replacement),
		artifacts,
		replacement,
		notes: buildNotes({
			kind,
			artifacts,
			userInvocableValue: options.frontmatter.fields[USER_INVOCABLE_KEY],
			replacement: options.replacement,
		}),
	};
}

function buildSkillKindRecords(inspection: SkillKindProjectInspection): OperationResult<readonly SkillKindRecord[]> {
	const piSettings = parsePiSettings(inspection.piDir, inspection.piSettings);
	if (piSettings.type === "error") return piSettings;
	const records: SkillKindRecord[] = [];
	for (const skill of sortSkills(inspection.skills)) {
		const readiness = validateInspectableSkill(skill);
		if (readiness.type === "error") return readiness;
		if (skill.skillMd.type !== "file") return { type: "error", message: `skills/${skill.name}/SKILL.md does not exist` };
		const frontmatter = inspectSkillFrontmatter(skill.skillMd.text, `skills/${skill.name}/SKILL.md`);
		if (frontmatter.type === "error") return frontmatter;
		const replacement = verifyPiReplacement(skill.name, inspection.genericReplacement);
		records.push(inferSkillKindRecord({
			skillName: skill.name,
			frontmatter: frontmatter.value,
			hasCodexSidecar: skill.openaiPolicy.type === "file",
			isPiExcluded: piSettings.value.exclusions.includes(`-skills/${skill.name}`),
			replacement,
		}));
	}
	return { type: "ok", value: records };
}

function buildSkillKindApplyPlan(inspection: SkillKindProjectInspection, skillName: string, kind: SkillInvocationKind): OperationResult<SkillKindApplyPlan> {
	const skill = inspection.skills.find((candidate) => candidate.name === skillName);
	if (skill === undefined) return { type: "error", message: `Local skill not found: ${skillName}` };
	const readiness = validateInspectableSkill(skill);
	if (readiness.type === "error") return readiness;
	if (skill.skillMd.type !== "file") return { type: "error", message: `skills/${skill.name}/SKILL.md does not exist` };
	if (kind === "command-backed") {
		const replacement = verifyPiReplacement(skill.name, inspection.genericReplacement);
		if (!replacement.verified) return { type: "error", message: replacementAdvice(skill.name, replacement.surface) };
	}
	const piSettings = parsePiSettings(inspection.piDir, inspection.piSettings);
	if (piSettings.type === "error") return piSettings;
	const frontmatter = planFrontmatterOperation(skill.name, skill.skillMd.text, kind);
	if (frontmatter.type === "error") return frontmatter;
	const sidecar = planSidecarOperations(skill, kind);
	if (sidecar.type === "error") return sidecar;
	const pi = planPiSettingsOperation(skill.name, kind, piSettings.value);
	if (pi.type === "error") return pi;
	return { type: "ok", value: { skill: skill.name, kind, operations: [frontmatter.value, ...sidecar.value, pi.value] } };
}

async function inspectResolvedProject(ctx: AregCliContext, requestPath: string): Promise<{ type: "ok"; value: ResolvedProjectInspection } | { type: "error"; message: string; projectDir: string }> {
	const targetInspection = await collectSkillKindProjectInspection(ctx, requestPath);
	if (targetInspection.projectPathState.type === "missing") return { type: "error", message: `Target ${targetInspection.projectDir} does not exist.`, projectDir: targetInspection.projectDir };
	if (targetInspection.projectPathState.type !== "directory") return { type: "error", message: `${targetInspection.projectDir} is not a directory.`, projectDir: targetInspection.projectDir };
	const repoRoot = await ctx.git.optionalRepoRoot({ cwd: targetInspection.projectDir });
	if (repoRoot.type === "error") return { type: "error", message: repoRoot.error.message, projectDir: targetInspection.projectDir };
	if (repoRoot.type === "missing") return { type: "error", message: `No Git root found containing ${targetInspection.projectDir}.`, projectDir: targetInspection.projectDir };
	if (repoRoot.value === targetInspection.projectDir) return { type: "ok", value: { projectDir: targetInspection.projectDir, inspection: targetInspection } };
	const rootInspection = await collectSkillKindProjectInspection(ctx, repoRoot.value);
	return { type: "ok", value: { projectDir: repoRoot.value, inspection: rootInspection } };
}

async function collectSkillKindProjectInspection(ctx: AregCliContext, projectPath: string): Promise<SkillKindProjectInspection> {
	const facts = await collectProjectInspectionFacts(ctx, projectPath);
	return {
		projectDir: facts.projectDir,
		projectPathState: facts.projectPathState,
		piDir: facts.piDir,
		piSettings: facts.piSettings,
		genericReplacement: facts.genericReplacement,
		skills: await collectLocalSkillKindInspections(ctx, facts.projectDir, facts.skillInventory.localSkillKindNames),
	};
}

function validateInspectableSkill(skill: AregSkillKindSkillInspection): { type: "ok" } | { type: "error"; message: string } {
	if (skill.skillDir.type === "symlink") return { type: "error", message: `skills/${skill.name} is a symlink but should be a real directory (canonical source)` };
	if (skill.skillDir.type !== "directory") return { type: "error", message: `Local skill missing canonical source: skills/${skill.name}/ does not exist` };
	if (skill.skillMd.type === "symlink") return { type: "error", message: `skills/${skill.name}/SKILL.md is a symlink but should be a real file (canonical source)` };
	if (skill.skillMd.type !== "file") return { type: "error", message: `skills/${skill.name}/SKILL.md does not exist` };
	return { type: "ok" };
}


function planFrontmatterOperation(skillName: string, text: string, kind: SkillInvocationKind): OperationResult<PlannedApplyOperation> {
	const relativePath = `skills/${skillName}/SKILL.md`;
	const transformed = transformSkillFrontmatter(text, relativePath, desiredFrontmatter(kind));
	if (transformed.type === "error") return transformed;
	if (transformed.value === text) return { type: "ok", value: { type: "skip", relativePath, description: "SKILL.md", reason: "SKILL.md frontmatter already current" } };
	return { type: "ok", value: { type: "write", relativePath, description: "SKILL.md", content: transformed.value, createParent: false } };
}

function planSidecarOperations(skill: AregSkillKindSkillInspection, kind: SkillInvocationKind): OperationResult<readonly PlannedApplyOperation[]> {
	const relativePath = `skills/${skill.name}/agents/openai.yaml`;
	const agentsDir = `skills/${skill.name}/agents`;
	const shouldExist = kind === "invoke-only" || kind === "command-backed";
	if (shouldExist) {
		if (skill.openaiPolicy.type === "symlink") return { type: "error", message: `${relativePath} is a symlink; refusing to manage it.` };
		if (skill.openaiPolicy.type === "file") {
			if (skill.openaiPolicy.text !== MANAGED_OPENAI_POLICY) return { type: "error", message: `${relativePath} exists with non-managed content; resolve it manually before applying ${kind}.` };
			return { type: "ok", value: [{ type: "skip", relativePath, description: "Codex openai.yaml", reason: "Codex openai.yaml already current" }] };
		}
		if (skill.openaiPolicy.type !== "missing") return { type: "error", message: `${relativePath} exists but is not a file.` };
		return { type: "ok", value: [{ type: "write", relativePath, description: "Codex openai.yaml", content: MANAGED_OPENAI_POLICY, createParent: true }] };
	}
	if (skill.openaiPolicy.type === "missing") return { type: "ok", value: [{ type: "skip", relativePath, description: "Codex openai.yaml", reason: "Codex openai.yaml absent" }] };
	if (skill.openaiPolicy.type === "symlink") return { type: "error", message: `${relativePath} is a symlink; refusing to delete it.` };
	if (skill.openaiPolicy.type !== "file") return { type: "error", message: `${relativePath} exists but is not a file.` };
	if (skill.openaiPolicy.text !== MANAGED_OPENAI_POLICY) return { type: "error", message: `${relativePath} exists with non-managed content; resolve it manually before applying ${kind}.` };
	return { type: "ok", value: [
		{ type: "delete", relativePath, description: "Codex openai.yaml" },
		{ type: "remove_empty_dir", relativePath: agentsDir, description: "empty skill agents directory" },
	] };
}

function planPiSettingsOperation(skillName: string, kind: SkillInvocationKind, settings: PiSettingsData): OperationResult<PlannedApplyOperation> {
	const relativePath = ".pi/settings.json";
	const entry = `-skills/${skillName}`;
	const shouldExclude = kind === "command-backed";
	const currentExclusions = settings.exclusions;
	const hasEntry = currentExclusions.includes(entry);
	if (shouldExclude && hasEntry) return { type: "ok", value: { type: "skip", relativePath, description: "Pi settings", reason: `${entry} already present` } };
	if (!shouldExclude && !hasEntry) return { type: "ok", value: { type: "skip", relativePath, description: "Pi settings", reason: `${entry} absent` } };
	const nextData: Record<string, unknown> = settings.data === undefined ? {} : { ...settings.data };
	const nextSkills = shouldExclude ? [...currentExclusions, entry] : currentExclusions.filter((candidate) => candidate !== entry);
	nextData.skills = nextSkills;
	return { type: "ok", value: { type: "write", relativePath, description: "Pi settings", content: `${JSON.stringify(nextData, null, 2)}\n`, createParent: settings.text === undefined } };
}

function desiredFrontmatter(kind: SkillInvocationKind): Readonly<Record<string, string | undefined>> {
	return {
		[DISABLE_MODEL_INVOCATION_KEY]: kind === "invoke-only" || kind === "command-backed" ? "true" : undefined,
		[USER_INVOCABLE_KEY]: kind === "ambient-only" ? "false" : undefined,
	};
}

function hasDeletionPrompt(plan: SkillKindApplyPlan): boolean {
	return plan.operations.some((operation) => operation.type === "delete" || operation.type === "remove_empty_dir");
}

function deletionPrompt(plan: SkillKindApplyPlan): string {
	const paths = plan.operations.filter((operation) => operation.type === "delete" || operation.type === "remove_empty_dir").map((operation) => `- ${operation.relativePath}`).join("\n");
	return `Apply ${plan.kind} to ${plan.skill} will delete managed artifacts:\n${paths}\nContinue?`;
}

function plannedWrites(plan: SkillKindApplyPlan): readonly AregSkillKindTextWritePlan[] {
	return plan.operations.flatMap((operation) => operation.type === "write" ? [{ relativePath: operation.relativePath, content: operation.content, description: operation.description, createParent: operation.createParent }] : []);
}

function plannedDeletes(plan: SkillKindApplyPlan): readonly AregSkillKindDeletePlan[] {
	return plan.operations.flatMap((operation) => operation.type === "delete" ? [{ relativePath: operation.relativePath, description: operation.description }] : []);
}

function plannedRemoveEmptyDirs(plan: SkillKindApplyPlan): readonly AregSkillKindRemoveEmptyDirPlan[] {
	return plan.operations.flatMap((operation) => operation.type === "remove_empty_dir" ? [{ relativePath: operation.relativePath, description: operation.description }] : []);
}

function toApplyOperationResult(operation: PlannedApplyOperation, didApply: boolean, removedEmptyDir: boolean): SkillKindApplyResult["skills"][number]["operations"][number] {
	return {
		type: operation.type,
		path: operation.relativePath,
		reason: operation.type === "skip" ? operation.reason : undefined,
		applied: operation.type === "skip" ? false : operation.type === "remove_empty_dir" ? removedEmptyDir : didApply,
	};
}

function renderApplyOperation(operation: SkillKindApplyResult["skills"][number]["operations"][number], dryRun: boolean): string | undefined {
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

function inferKind(artifacts: SkillKindArtifactFacts, replacement: PiReplacementVerification): InferredSkillInvocationKind {
	if (artifacts.isModelInvocationDisabled && artifacts.hasCodexSidecar && artifacts.isPiExcluded && replacement.verified && !artifacts.hasUserInvocableKey) return "command-backed";
	if (artifacts.isModelInvocationDisabled && artifacts.hasCodexSidecar && !artifacts.isPiExcluded && !artifacts.hasUserInvocableKey) return "invoke-only";
	if (artifacts.isUserInvocableFalse && !artifacts.isModelInvocationDisabled && !artifacts.hasCodexSidecar && !artifacts.isPiExcluded) return "ambient-only";
	if (!artifacts.isModelInvocationDisabled && !artifacts.hasCodexSidecar && !artifacts.hasUserInvocableKey && !artifacts.isPiExcluded) return "normal";
	if (artifacts.hasUserInvocableKey && (artifacts.isModelInvocationDisabled || artifacts.hasCodexSidecar || artifacts.isPiExcluded)) return "mixed";
	return "inconsistent";
}

function modelInvocationStatus(artifacts: SkillKindArtifactFacts): ModelInvocationStatus {
	if (artifacts.isModelInvocationDisabled && artifacts.hasCodexSidecar) return "disabled";
	if (artifacts.isModelInvocationDisabled || artifacts.hasCodexSidecar) return "mixed";
	return "enabled";
}

function nativeDirectStatus(kind: InferredSkillInvocationKind, artifacts: SkillKindArtifactFacts): NativeDirectStatus {
	if (kind === "normal" || kind === "invoke-only") return "enabled";
	if (kind === "command-backed" || kind === "ambient-only") return "partial";
	if (artifacts.hasUserInvocableKey || artifacts.isPiExcluded) return "mixed";
	return "enabled";
}

function piExtensionStatus(artifacts: SkillKindArtifactFacts, replacement: PiReplacementVerification): PiExtensionStatus {
	if (!artifacts.isPiExcluded) return "n/a";
	return replacement.verified ? "enabled" : "missing";
}

function buildNotes(options: {
	kind: InferredSkillInvocationKind;
	artifacts: SkillKindArtifactFacts;
	userInvocableValue: string | undefined;
	replacement: PiReplacementVerification;
}): readonly string[] {
	const notes: string[] = [];
	if (options.artifacts.isModelInvocationDisabled && !options.artifacts.hasCodexSidecar) notes.push("disable-model-invocation is present but agents/openai.yaml is missing.");
	if (options.artifacts.hasCodexSidecar && !options.artifacts.isModelInvocationDisabled) notes.push("agents/openai.yaml is present but disable-model-invocation is absent.");
	if (options.artifacts.hasUserInvocableKey && !options.artifacts.isUserInvocableFalse) notes.push(`user-invocable is present with value ${JSON.stringify(options.userInvocableValue ?? "")}, not false.`);
	if (options.artifacts.isUserInvocableFalse && (options.artifacts.isModelInvocationDisabled || options.artifacts.hasCodexSidecar || options.artifacts.isPiExcluded)) {
		notes.push("user-invocable:false is mixed with explicit-only or Pi-exclusion artifacts.");
	}
	if (options.artifacts.isPiExcluded && !options.replacement.verified) notes.push("Pi skill exclusion is present without a verified replacement command.");
	if (options.kind === "ambient-only") notes.push("ambient-only disables Claude native direct invocation; Pi and Codex native direct invocation are not enforced.");
	return notes;
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

function truthyFrontmatterValue(value: string | undefined): boolean {
	return value?.trim().toLowerCase() === "true";
}

function falsyFrontmatterValue(value: string | undefined): boolean {
	return value?.trim().toLowerCase() === "false";
}

function replacementEvidence(replacement: PiReplacementVerification): string | undefined {
	return replacement.surface === undefined ? "replacement verified" : `/${replacement.surface}`;
}

function presence(value: boolean): "present" | "absent" {
	return value ? "present" : "absent";
}

function sortSkills(skills: readonly AregSkillKindSkillInspection[]): readonly AregSkillKindSkillInspection[] {
	const byName = new Map(skills.map((skill) => [skill.name, skill]));
	return sortStrings([...byName.keys()]).map((name) => byName.get(name)).filter((skill): skill is AregSkillKindSkillInspection => skill !== undefined);
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

