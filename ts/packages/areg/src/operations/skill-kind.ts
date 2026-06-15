import path from "node:path";

import { negative, ok, type ClinkrExit, ClinkrGroup } from "@asdl/clinkr";
import { formatErrorMessage, isRecord } from "@asdl/core/primitives";
import { z } from "zod";

import type { AregCliContext } from "../context.ts";
import type { AregSkillKindProjectInspectionResult, AregSkillKindSkillInspection, AregSkillKindTextFileState } from "../gateways.ts";
import { sortStrings } from "../sort.ts";
import { formatReplacementLabel, replacementAdvice, verifyPiReplacement, type PiReplacementVerification } from "./pi-replacement.ts";

const SKILL_INVOCATION_KINDS = ["normal", "invoke-only", "command-backed", "ambient-only"] as const;
const INFERRED_SKILL_INVOCATION_KINDS = [...SKILL_INVOCATION_KINDS, "mixed", "inconsistent"] as const;
const MODEL_INVOCATION_STATUSES = ["enabled", "disabled", "mixed"] as const;
const NATIVE_DIRECT_STATUSES = ["enabled", "partial", "mixed"] as const;
const PI_EXTENSION_STATUSES = ["n/a", "enabled", "missing"] as const;
const FRONTMATTER_KEY_RE = /^(?<key>[A-Za-z0-9_-]+):(?<value>.*)$/u;
const DISABLE_MODEL_INVOCATION_KEY = "disable-model-invocation";
const USER_INVOCABLE_KEY = "user-invocable";

export type SkillInvocationKind = (typeof SKILL_INVOCATION_KINDS)[number];
export type InferredSkillInvocationKind = (typeof INFERRED_SKILL_INVOCATION_KINDS)[number];
export type ModelInvocationStatus = (typeof MODEL_INVOCATION_STATUSES)[number];
export type NativeDirectStatus = (typeof NATIVE_DIRECT_STATUSES)[number];
export type PiExtensionStatus = (typeof PI_EXTENSION_STATUSES)[number];

export interface SkillKindArtifactFacts {
	disableModelInvocation: boolean;
	codexSidecar: boolean;
	userInvocableKeyPresent: boolean;
	userInvocableFalse: boolean;
	piExcluded: boolean;
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

interface FrontmatterInspection {
	fields: Readonly<Record<string, string>>;
	keys: ReadonlySet<string>;
}

interface ResolvedProjectInspection {
	projectDir: string;
	inspection: AregSkillKindProjectInspectionResult;
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

export const skillKindListRequestSchema = z.object({
	path: z.string().default(".").describe("Project directory or subdirectory to inspect (default: current directory)."),
});

export const skillKindShowRequestSchema = z.object({
	path: z.string().default(".").describe("Project directory or subdirectory to inspect (default: current directory)."),
	skill: z.string().describe("Local skill name or path-like skill spec."),
});

export const skillKindListResultSchema = z.object({
	project_dir: z.string(),
	skills: z.array(skillKindRecordSchema),
});

export const skillKindShowResultSchema = z.object({
	project_dir: z.string(),
	skill: skillKindRecordSchema,
});

export type SkillKindListRequest = z.infer<typeof skillKindListRequestSchema>;
export type SkillKindShowRequest = z.infer<typeof skillKindShowRequestSchema>;
export type SkillKindRecordResult = z.infer<typeof skillKindRecordSchema>;
export type SkillKindListResult = z.infer<typeof skillKindListResultSchema>;
export type SkillKindShowResult = z.infer<typeof skillKindShowResultSchema>;

export function buildSkillGroup(): ClinkrGroup<AregCliContext> {
	const skillGroup = new ClinkrGroup<AregCliContext>({
		name: "skill",
		description: "Manage local skill metadata.",
	});
	const kindGroup = new ClinkrGroup<AregCliContext>({
		name: "kind",
		description: "Inspect skill invocation kinds.",
	});
	kindGroup.command({
		name: "list",
		description: "List inferred invocation kinds for local skills.",
		schema: skillKindListRequestSchema,
		resultSchema: skillKindListResultSchema,
		handler: runSkillKindList,
		renderHuman: renderSkillKindList,
	});
	kindGroup.command({
		name: "show",
		description: "Show the inferred invocation kind for one local skill.",
		schema: skillKindShowRequestSchema,
		positionals: { skill: { position: 0 } },
		resultSchema: skillKindShowResultSchema,
		handler: runSkillKindShow,
		renderHuman: renderSkillKindShow,
	});
	skillGroup.group(kindGroup);
	return skillGroup;
}

export async function runSkillKindList(ctx: AregCliContext, request: SkillKindListRequest): Promise<ClinkrExit<SkillKindListResult>> {
	const resolved = await inspectResolvedProject(ctx, request.path);
	if (resolved.type === "error") return negative(resolved.message, emptyListResult(resolved.projectDir));
	const records = buildSkillKindRecords(resolved.value.inspection);
	if (records.type === "error") return negative(records.message, emptyListResult(resolved.value.projectDir));
	return ok({ project_dir: resolved.value.projectDir, skills: records.value.map(toSkillKindRecordResult) });
}

export async function runSkillKindShow(ctx: AregCliContext, request: SkillKindShowRequest): Promise<ClinkrExit<SkillKindShowResult>> {
	const resolved = await inspectResolvedProject(ctx, request.path);
	if (resolved.type === "error") return negative(resolved.message, emptyShowResult(resolved.projectDir, request.skill));
	const resolvedSkill = await ctx.skillKindProject.resolveLocalSkillSpec({ projectDir: resolved.value.projectDir, spec: request.skill, cwd: ctx.cwd, env: ctx.env });
	if (resolvedSkill.type === "error") return negative(resolvedSkill.error.message, emptyShowResult(resolved.value.projectDir, request.skill));
	const records = buildSkillKindRecords(resolved.value.inspection);
	if (records.type === "error") return negative(records.message, emptyShowResult(resolved.value.projectDir, resolvedSkill.skillName));
	const record = records.value.find((candidate) => candidate.skill === resolvedSkill.skillName);
	if (record === undefined) {
		return negative(`Local skill not found: ${request.skill}`, emptyShowResult(resolved.value.projectDir, resolvedSkill.skillName));
	}
	return ok({ project_dir: resolved.value.projectDir, skill: toSkillKindRecordResult(record) });
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

export function inspectSkillFrontmatter(text: string, pathLabel: string): { type: "ok"; value: FrontmatterInspection } | { type: "error"; message: string } {
	const lines = text.split(/\r?\n/u);
	if (lines.at(-1) === "") lines.pop();
	if (lines.length === 0 || lines[0] !== "---") return { type: "error", message: `${pathLabel} missing opening frontmatter delimiter '---'` };
	const endIndex = lines.indexOf("---", 1);
	if (endIndex === -1) return { type: "error", message: `${pathLabel} missing closing frontmatter delimiter '---'` };
	const fields: Record<string, string> = {};
	const keys = new Set<string>();
	let currentKey: string | undefined;
	let currentValues: string[] = [];
	function flushCurrent(): void {
		if (currentKey === undefined) return;
		let rawValue = currentValues.filter((value) => value.length > 0).join(" ").trim();
		if (rawValue.length >= 2 && rawValue[0] === rawValue.at(-1) && (rawValue[0] === "\"" || rawValue[0] === "'")) rawValue = rawValue.slice(1, -1);
		fields[currentKey] = rawValue;
	}
	for (const line of lines.slice(1, endIndex)) {
		const stripped = line.trim();
		if (stripped.length === 0) continue;
		if (stripped.startsWith("#")) continue;
		if (!line.startsWith(" ") && !line.startsWith("\t")) {
			flushCurrent();
			const match = FRONTMATTER_KEY_RE.exec(line);
			if (match?.groups === undefined) return { type: "error", message: `${pathLabel} invalid frontmatter line: ${JSON.stringify(line)}` };
			currentKey = match.groups.key ?? "";
			keys.add(currentKey);
			currentValues = [];
			const inlineValue = (match.groups.value ?? "").trim();
			if (inlineValue.length > 0) currentValues.push(inlineValue);
			continue;
		}
		if (currentKey === undefined) return { type: "error", message: `${pathLabel} invalid frontmatter line: ${JSON.stringify(line)}` };
		currentValues.push(line.trim());
	}
	flushCurrent();
	return { type: "ok", value: { fields, keys } };
}

export function inferSkillKindRecord(options: {
	skillName: string;
	frontmatter: FrontmatterInspection;
	codexSidecar: boolean;
	piExcluded: boolean;
	replacement: PiReplacementVerification;
}): SkillKindRecord {
	const disableModelInvocation = truthyFrontmatterValue(options.frontmatter.fields[DISABLE_MODEL_INVOCATION_KEY]);
	const userInvocableKeyPresent = options.frontmatter.keys.has(USER_INVOCABLE_KEY);
	const userInvocableFalse = falsyFrontmatterValue(options.frontmatter.fields[USER_INVOCABLE_KEY]);
	const artifacts: SkillKindArtifactFacts = {
		disableModelInvocation,
		codexSidecar: options.codexSidecar,
		userInvocableKeyPresent,
		userInvocableFalse,
		piExcluded: options.piExcluded,
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
		notes: buildNotes(kind, artifacts, options.frontmatter.fields[USER_INVOCABLE_KEY], options.replacement),
	};
}

function buildSkillKindRecords(inspection: AregSkillKindProjectInspectionResult): { type: "ok"; value: readonly SkillKindRecord[] } | { type: "error"; message: string } {
	const piExclusions = parsePiExclusions(inspection.piDir, inspection.piSettings);
	if (piExclusions.type === "error") return piExclusions;
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
			codexSidecar: skill.openaiPolicy.type === "file",
			piExcluded: piExclusions.exclusions.includes(`-skills/${skill.name}`),
			replacement,
		}));
	}
	return { type: "ok", value: records };
}

async function inspectResolvedProject(ctx: AregCliContext, requestPath: string): Promise<{ type: "ok"; value: ResolvedProjectInspection } | { type: "error"; message: string; projectDir: string }> {
	const targetInspection = await ctx.skillKindProject.inspectProjectForSkillKinds({ cwd: ctx.cwd, projectPath: requestPath, env: ctx.env });
	if (targetInspection.projectPathState.type === "missing") return { type: "error", message: `Target ${targetInspection.projectDir} does not exist.`, projectDir: targetInspection.projectDir };
	if (targetInspection.projectPathState.type !== "directory") return { type: "error", message: `${targetInspection.projectDir} is not a directory.`, projectDir: targetInspection.projectDir };
	const repoRoot = await ctx.git.optionalRepoRoot({ cwd: targetInspection.projectDir });
	if (repoRoot.type === "error") return { type: "error", message: repoRoot.error.message, projectDir: targetInspection.projectDir };
	if (repoRoot.type === "missing") return { type: "error", message: `No Git root found containing ${targetInspection.projectDir}.`, projectDir: targetInspection.projectDir };
	if (repoRoot.value === targetInspection.projectDir) return { type: "ok", value: { projectDir: targetInspection.projectDir, inspection: targetInspection } };
	const rootInspection = await ctx.skillKindProject.inspectProjectForSkillKinds({ cwd: ctx.cwd, projectPath: repoRoot.value, env: ctx.env });
	return { type: "ok", value: { projectDir: repoRoot.value, inspection: rootInspection } };
}

function validateInspectableSkill(skill: AregSkillKindSkillInspection): { type: "ok" } | { type: "error"; message: string } {
	if (skill.skillDir.type === "symlink") return { type: "error", message: `skills/${skill.name} is a symlink but should be a real directory (canonical source)` };
	if (skill.skillDir.type !== "directory") return { type: "error", message: `Local skill missing canonical source: skills/${skill.name}/ does not exist` };
	if (skill.skillMd.type === "symlink") return { type: "error", message: `skills/${skill.name}/SKILL.md is a symlink but should be a real file (canonical source)` };
	if (skill.skillMd.type !== "file") return { type: "error", message: `skills/${skill.name}/SKILL.md does not exist` };
	return { type: "ok" };
}

function parsePiExclusions(piDir: { type: string }, settings: AregSkillKindTextFileState): { type: "ok"; exclusions: readonly string[] } | { type: "error"; message: string } {
	if (piDir.type === "symlink") return { type: "error", message: ".pi is a symlink; refusing to inspect Pi settings." };
	if (settings.type === "missing") return { type: "ok", exclusions: [] };
	if (settings.type === "symlink") return { type: "error", message: ".pi/settings.json is a symlink; refusing to inspect Pi settings." };
	if (settings.type !== "file") return { type: "error", message: ".pi/settings.json exists but is not a file." };
	let data: unknown;
	try {
		data = JSON.parse(settings.text);
	} catch (error) {
		return { type: "error", message: `Invalid JSON in .pi/settings.json: ${formatErrorMessage(error)}.` };
	}
	if (!isRecord(data)) return { type: "error", message: ".pi/settings.json must contain a JSON object." };
	if (data.skills === undefined) return { type: "ok", exclusions: [] };
	if (!Array.isArray(data.skills) || data.skills.some((value) => typeof value !== "string")) return { type: "error", message: ".pi/settings.json field 'skills' must be an array of strings." };
	return { type: "ok", exclusions: data.skills };
}

function inferKind(artifacts: SkillKindArtifactFacts, replacement: PiReplacementVerification): InferredSkillInvocationKind {
	if (artifacts.disableModelInvocation && artifacts.codexSidecar && artifacts.piExcluded && replacement.verified && !artifacts.userInvocableKeyPresent) return "command-backed";
	if (artifacts.disableModelInvocation && artifacts.codexSidecar && !artifacts.piExcluded && !artifacts.userInvocableKeyPresent) return "invoke-only";
	if (artifacts.userInvocableFalse && !artifacts.disableModelInvocation && !artifacts.codexSidecar && !artifacts.piExcluded) return "ambient-only";
	if (!artifacts.disableModelInvocation && !artifacts.codexSidecar && !artifacts.userInvocableKeyPresent && !artifacts.piExcluded) return "normal";
	if (artifacts.userInvocableKeyPresent && (artifacts.disableModelInvocation || artifacts.codexSidecar || artifacts.piExcluded)) return "mixed";
	return "inconsistent";
}

function modelInvocationStatus(artifacts: SkillKindArtifactFacts): ModelInvocationStatus {
	if (artifacts.disableModelInvocation && artifacts.codexSidecar) return "disabled";
	if (artifacts.disableModelInvocation || artifacts.codexSidecar) return "mixed";
	return "enabled";
}

function nativeDirectStatus(kind: InferredSkillInvocationKind, artifacts: SkillKindArtifactFacts): NativeDirectStatus {
	if (kind === "normal" || kind === "invoke-only") return "enabled";
	if (kind === "command-backed" || kind === "ambient-only") return "partial";
	if (artifacts.userInvocableKeyPresent || artifacts.piExcluded) return "mixed";
	return "enabled";
}

function piExtensionStatus(artifacts: SkillKindArtifactFacts, replacement: PiReplacementVerification): PiExtensionStatus {
	if (!artifacts.piExcluded) return "n/a";
	return replacement.verified ? "enabled" : "missing";
}

function buildNotes(kind: InferredSkillInvocationKind, artifacts: SkillKindArtifactFacts, userInvocableValue: string | undefined, replacement: PiReplacementVerification): readonly string[] {
	const notes: string[] = [];
	if (artifacts.disableModelInvocation && !artifacts.codexSidecar) notes.push("disable-model-invocation is present but agents/openai.yaml is missing.");
	if (artifacts.codexSidecar && !artifacts.disableModelInvocation) notes.push("agents/openai.yaml is present but disable-model-invocation is absent.");
	if (artifacts.userInvocableKeyPresent && !artifacts.userInvocableFalse) notes.push(`user-invocable is present with value ${JSON.stringify(userInvocableValue ?? "")}, not false.`);
	if (artifacts.userInvocableFalse && (artifacts.disableModelInvocation || artifacts.codexSidecar || artifacts.piExcluded)) {
		notes.push("user-invocable:false is mixed with explicit-only or Pi-exclusion artifacts.");
	}
	if (artifacts.piExcluded && !replacement.verified) notes.push("Pi skill exclusion is present without a verified replacement command.");
	if (kind === "ambient-only") notes.push("ambient-only disables Claude native direct invocation; Pi and Codex native direct invocation are not enforced.");
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
			disable_model_invocation: record.artifacts.disableModelInvocation,
			codex_sidecar: record.artifacts.codexSidecar,
			user_invocable_key_present: record.artifacts.userInvocableKeyPresent,
			user_invocable_false: record.artifacts.userInvocableFalse,
			pi_excluded: record.artifacts.piExcluded,
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

function emptyListResult(projectDir = ""): SkillKindListResult {
	return { project_dir: projectDir, skills: [] };
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
