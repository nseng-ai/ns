import path from "node:path";

import { failure, negative, ok, type ClinkrExit } from "@sdl/clinkr";
import { z } from "zod";

import type { AregCliContext } from "../context.ts";
import {
	AREG_SKILL_FIND_ROOT_DESCRIPTORS,
	AREG_SKILL_FIND_ROOTS,
	AREG_SKILL_FIND_SOURCE_TYPES,
	type AregSkillFindRoot,
	type AregSkillFindSkillInspection,
} from "../gateways.ts";
import { parseSkillFrontmatterBlock } from "./frontmatter.ts";

const skillFindRootSchema = z.enum(AREG_SKILL_FIND_ROOTS);
const skillFindSourceTypeSchema = z.enum(AREG_SKILL_FIND_SOURCE_TYPES);

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

export function renderSkillFind(result: SkillFindResult): string {
	if ("preferred" in result) return renderSkillFindSuccess(result);
	return renderSkillFindMiss(result);
}

function buildSkillFindSearchedRoots(projectDir: string, query: string): SkillFindSearchedRoot[] {
	return AREG_SKILL_FIND_ROOT_DESCRIPTORS.map((descriptor) => {
		const searchedRelativePath = `${descriptor.root}/${query}/SKILL.md`;
		return {
			root: descriptor.root,
			sourceType: descriptor.sourceType,
			rootRelativePath: descriptor.root,
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
	return AREG_SKILL_FIND_ROOT_DESCRIPTORS.map((descriptor) => descriptor.root).filter((root) =>
		roots.has(root),
	);
}

function compareSkillFindInspection(
	left: AregSkillFindSkillInspection,
	right: AregSkillFindSkillInspection,
): number {
	return rootRank(left.root) - rootRank(right.root) || left.name.localeCompare(right.name);
}

function rootRank(root: AregSkillFindRoot): number {
	const index = AREG_SKILL_FIND_ROOT_DESCRIPTORS.findIndex(
		(descriptor) => descriptor.root === root,
	);
	return index === -1 ? AREG_SKILL_FIND_ROOT_DESCRIPTORS.length : index;
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
