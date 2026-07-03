import { failure, negative, ok, type ClinkrExit } from "@sdl/clinkr";
import {
	SKILL_LOOKUP_ROOT_DESCRIPTORS,
	SKILL_LOOKUP_ROOTS,
	SKILL_LOOKUP_SOURCE_TYPES,
	skillLookupFileRelativePath,
	skillLookupRootRank,
	type SkillLookupRoot,
} from "@sdl/pi/skills/lookup";
import { z } from "zod";

import type { AregCliContext } from "../context.ts";
import type { AregSkillFindSkillInspection } from "../gateways.ts";
import { toProjectPath } from "../gateways/project-fs.ts";
import { parseSkillFrontmatterBlock } from "./frontmatter.ts";
import { inspectResolvedProjectGitRoot } from "./project-resolution.ts";

const skillFindRootSchema = z.enum(SKILL_LOOKUP_ROOTS);
const skillFindSourceTypeSchema = z.enum(SKILL_LOOKUP_SOURCE_TYPES);

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
	shouldDisableModelInvocation: z.boolean().optional(),
	warnings: z.array(skillFindWarningSchema).optional(),
});

const skillFindSearchedRootSchema = z.object({
	root: skillFindRootSchema,
	sourceType: skillFindSourceTypeSchema,
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

export type SkillFindRequest = z.infer<typeof skillFindRequestSchema>;
export type SkillFindMatch = z.infer<typeof skillFindMatchSchema>;
export type SkillFindSearchedRoot = z.infer<typeof skillFindSearchedRootSchema>;
export type SkillFindSuccessResult = z.infer<typeof skillFindSuccessResultSchema>;
export type SkillFindMissResult = z.infer<typeof skillFindMissResultSchema>;
export type SkillFindResult = z.infer<typeof skillFindResultSchema>;

export async function runSkillFind(
	ctx: AregCliContext,
	request: SkillFindRequest,
): Promise<ClinkrExit<SkillFindResult>> {
	const resolved = await inspectResolvedProjectGitRoot(ctx, request.path, (context, projectPath) =>
		context.project.inspectProjectBase({
			cwd: context.cwd,
			projectPath,
			env: context.env,
		}),
	);
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

export function renderSkillFind(result: SkillFindResult): string {
	if ("preferred" in result) return renderSkillFindSuccess(result);
	return renderSkillFindMiss(result);
}

function buildSkillFindSearchedRoots(projectDir: string, query: string): SkillFindSearchedRoot[] {
	return SKILL_LOOKUP_ROOT_DESCRIPTORS.map((descriptor) => {
		const searchedRelativePath = skillLookupFileRelativePath(descriptor.root, query);
		return {
			root: descriptor.root,
			sourceType: descriptor.sourceType,
			searchedRelativePath,
			searchedPath: toProjectPath(projectDir, searchedRelativePath),
		};
	});
}

function toSkillFindMatch(
	projectDir: string,
	skill: AregSkillFindSkillInspection,
	isPreferred: boolean,
): SkillFindMatch {
	const skillFileRelativePath = `${skill.baseRelativePath}/SKILL.md`;
	const skillFilePath = toProjectPath(projectDir, skillFileRelativePath);
	const frontmatter = parseSkillFindFrontmatter(skillFileRelativePath, skill.skillMd);
	return {
		name: skill.name,
		root: skill.root,
		sourceType: skill.sourceType,
		isPreferred,
		baseRelativePath: skill.baseRelativePath,
		skillFileRelativePath,
		basePath: toProjectPath(projectDir, skill.baseRelativePath),
		skillFilePath,
		...frontmatter.fields,
		...(frontmatter.warnings.length === 0 ? {} : { warnings: frontmatter.warnings }),
	};
}

function parseSkillFindFrontmatter(
	skillFileRelativePath: string,
	skillMd: AregSkillFindSkillInspection["skillMd"],
): {
	fields: Pick<SkillFindMatch, "frontmatterName" | "description" | "shouldDisableModelInvocation">;
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
	const shouldDisableModelInvocation = parseOptionalBoolean(
		parsed.value.fields["disable-model-invocation"],
	);
	return {
		fields: {
			...(frontmatterName === undefined ? {} : { frontmatterName }),
			...(description === undefined ? {} : { description }),
			...(shouldDisableModelInvocation === undefined ? {} : { shouldDisableModelInvocation }),
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
): Array<{ name: string; roots: SkillLookupRoot[] }> {
	const rootByName = new Map<string, Set<SkillLookupRoot>>();
	for (const skill of skills) {
		const roots = rootByName.get(skill.name) ?? new Set<SkillLookupRoot>();
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

function orderedRoots(roots: ReadonlySet<SkillLookupRoot>): SkillLookupRoot[] {
	return SKILL_LOOKUP_ROOT_DESCRIPTORS.map((descriptor) => descriptor.root).filter((root) =>
		roots.has(root),
	);
}

function compareSkillFindInspection(
	left: AregSkillFindSkillInspection,
	right: AregSkillFindSkillInspection,
): number {
	return (
		skillLookupRootRank(left.root) - skillLookupRootRank(right.root) ||
		left.name.localeCompare(right.name)
	);
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
