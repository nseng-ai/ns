import { failure, negative, ok, type ClinkrExit, ClinkrGroup } from "@asdl/clinkr";
import { z } from "zod";

import type { AregCliContext } from "../context.ts";
import type { AregSkillxInstalledSkill } from "../gateways.ts";

const SKILLX_FORMAT_VALUES = ["url", "skill_flag", "plain", "repo_only"] as const;
const REPO_PATTERN = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;

export const skillxParseRequestSchema = z.object({
	inputText: z.string().describe("GitHub URL, owner/repo, or owner/repo plus skill selector."),
});

export const skillxListRequestSchema = z.object({
	repo: z.string().describe("GitHub repository in owner/repo form."),
});

export const skillxFetchRequestSchema = z.object({
	repo: z.string().describe("GitHub repository in owner/repo form."),
	skill: z.string().optional().describe("Specific skill name to select after installation."),
});

export const skillxCleanupRequestSchema = z.object({
	dir: z.string().describe("Transient skillx workspace directory to remove."),
});

const skillxFormatSchema = z.enum(SKILLX_FORMAT_VALUES);

const parseSuccessSchema = z.object({
	success: z.literal(true),
	repo: z.string(),
	skill: z.string().nullable(),
	format: skillxFormatSchema,
});

const parseFailureSchema = z.object({
	success: z.literal(false),
	error: z.string(),
});

export const skillxParseResultSchema = z.union([parseSuccessSchema, parseFailureSchema]);

const listSuccessSchema = z.object({
	success: z.literal(true),
	repo: z.string(),
	skills: z.array(z.string()),
});

const listFailureSchema = z.object({
	success: z.literal(false),
	error: z.string(),
	hint: z.string().optional(),
});

export const skillxListResultSchema = z.union([listSuccessSchema, listFailureSchema]);

const fetchSelectedSuccessSchema = z.object({
	success: z.literal(true),
	repo: z.string(),
	skill: z.string(),
	tmp_dir: z.string(),
	skill_dir: z.string(),
	skill_md: z.string(),
	files: z.array(z.string()),
	needs_selection: z.literal(false).optional(),
});

const fetchSelectionSuccessSchema = z.object({
	success: z.literal(true),
	repo: z.string(),
	skill: z.null(),
	tmp_dir: z.string(),
	skill_dir: z.null(),
	skill_md: z.null(),
	files: z.null(),
	needs_selection: z.literal(true),
	available_skills: z.array(z.string()),
});

const fetchFailureSchema = z.object({
	success: z.literal(false),
	error: z.string(),
	tmp_dir: z.null(),
});

export const skillxFetchResultSchema = z.union([fetchSelectedSuccessSchema, fetchSelectionSuccessSchema, fetchFailureSchema]);

const cleanupSuccessSchema = z.object({
	success: z.literal(true),
	removed: z.string(),
});

const cleanupFailureSchema = z.object({
	success: z.literal(false),
	error: z.string(),
});

export const skillxCleanupResultSchema = z.union([cleanupSuccessSchema, cleanupFailureSchema]);

export type SkillxParseRequest = z.infer<typeof skillxParseRequestSchema>;
export type SkillxListRequest = z.infer<typeof skillxListRequestSchema>;
export type SkillxFetchRequest = z.infer<typeof skillxFetchRequestSchema>;
export type SkillxCleanupRequest = z.infer<typeof skillxCleanupRequestSchema>;
export type SkillxParseResult = z.infer<typeof skillxParseResultSchema>;
export type SkillxListResult = z.infer<typeof skillxListResultSchema>;
export type SkillxFetchResult = z.infer<typeof skillxFetchResultSchema>;
export type SkillxCleanupResult = z.infer<typeof skillxCleanupResultSchema>;

interface ParseSuccess {
	type: "ok";
	data: z.infer<typeof parseSuccessSchema>;
}

interface ParseError {
	type: "error";
	data: z.infer<typeof parseFailureSchema>;
}

type ParseResult = ParseSuccess | ParseError;

export function buildSkillxGroup(): ClinkrGroup<AregCliContext> {
	const group = new ClinkrGroup<AregCliContext>({
		name: "skillx",
		description: "Skillx helper operations.",
	});
	group.command({
		name: "parse",
		description: "Parse a skill source selector.",
		schema: skillxParseRequestSchema,
		positionals: { inputText: { position: 0 } },
		resultSchema: skillxParseResultSchema,
		handler: runSkillxParse,
	});
	group.command({
		name: "list",
		description: "List skills in a GitHub repository skills/ directory.",
		schema: skillxListRequestSchema,
		resultSchema: skillxListResultSchema,
		handler: runSkillxList,
	});
	group.command({
		name: "fetch",
		description: "Fetch skills into a transient workspace for agent reading.",
		schema: skillxFetchRequestSchema,
		resultSchema: skillxFetchResultSchema,
		handler: runSkillxFetch,
	});
	group.command({
		name: "cleanup",
		description: "Remove a transient skillx workspace.",
		schema: skillxCleanupRequestSchema,
		resultSchema: skillxCleanupResultSchema,
		handler: runSkillxCleanup,
	});
	return group;
}

export function parseSkillInput(raw: string): ParseResult {
	const input = raw.trim();
	if (input.length === 0) return parseError("Empty input");
	const urlResult = parseGithubUrl(input);
	if (urlResult !== undefined) return { type: "ok", data: urlResult };
	const parts = input.split(/\s+/u);
	const [repo, second, third, ...rest] = parts;
	if (repo === undefined || !isRepo(repo)) return parseError(`Could not extract owner/repo from input: ${JSON.stringify(input)}`);
	if ((second === "--skill" || second === "-s") && third !== undefined && rest.length === 0) {
		return { type: "ok", data: { success: true, repo, skill: third, format: "skill_flag" } };
	}
	if (second === undefined) return { type: "ok", data: { success: true, repo, skill: null, format: "repo_only" } };
	if (third === undefined && isSkillName(second)) return { type: "ok", data: { success: true, repo, skill: second, format: "plain" } };
	return parseError(`Could not extract owner/repo from input: ${JSON.stringify(input)}`);
}

export async function runSkillxParse(_ctx: AregCliContext, request: SkillxParseRequest): Promise<ClinkrExit<SkillxParseResult>> {
	const result = parseSkillInput(request.inputText);
	if (result.type === "ok") return ok(result.data);
	return negative(result.data.error, result.data);
}

export async function runSkillxList(ctx: AregCliContext, request: SkillxListRequest): Promise<ClinkrExit<SkillxListResult>> {
	const tool = await ctx.host.checkTool({ tool: "gh", cwd: ctx.cwd, env: ctx.env });
	if (tool.type === "missing") return failure("missing-tool", tool.message);
	const result = await ctx.github.listSkillDirectoryNames({ repo: request.repo, env: ctx.env });
	if (result.type === "ok") {
		return ok({ success: true, repo: request.repo, skills: sortedStrings(result.skillNames) });
	}
	if (result.type === "missing") {
		const error = `No skills directory found in ${request.repo}`;
		return negative(error, {
			success: false,
			error,
			hint: "Check that the repo exists and has a skills/ directory",
		});
	}
	if (result.type === "auth-error") {
		const error = `Authentication error accessing ${request.repo}`;
		return negative(error, {
			success: false,
			error,
			hint: "Run 'gh auth status' to check authentication issues",
		});
	}
	return negative(result.error.message, { success: false, error: result.error.message });
}

export async function runSkillxFetch(ctx: AregCliContext, request: SkillxFetchRequest): Promise<ClinkrExit<SkillxFetchResult>> {
	const tool = await ctx.host.checkTool({ tool: "npx", cwd: ctx.cwd, env: ctx.env });
	if (tool.type === "missing") return failure("missing-tool", tool.message);
	const install = await ctx.skillxWorkspace.installIntoWorkspace({
		sourceRepo: request.repo,
		skillName: request.skill,
		cwd: ctx.cwd,
		env: ctx.env,
	});
	if (install.type === "error") return fetchNegative(install.error.message);
	const workspaceRoot = install.workspace.workspaceRoot;
	const installedSkills = sortedInstalledSkills(install.workspace.installedSkills);
	if (installedSkills.length === 0) return fetchNegative("No skills were installed");
	if (request.skill === undefined && installedSkills.length > 1) {
		return ok({
			success: true,
			repo: request.repo,
			skill: null,
			tmp_dir: workspaceRoot,
			skill_dir: null,
			skill_md: null,
			files: null,
			needs_selection: true,
			available_skills: installedSkills.map((skill) => skill.name),
		});
	}
	const selected = request.skill === undefined ? installedSkills[0] : installedSkills.find((skill) => skill.name === request.skill);
	if (selected === undefined) {
		const cleanup = await ctx.skillxWorkspace.cleanupWorkspace({ workspaceRoot, cwd: ctx.cwd, env: ctx.env });
		const base = `Skill '${request.skill}' was not found in installed skills`;
		const error = cleanup.ok ? base : `${base}; cleanup failed: ${cleanup.error.message}`;
		return fetchNegative(error);
	}
	return ok({
		success: true,
		repo: request.repo,
		skill: selected.name,
		tmp_dir: workspaceRoot,
		skill_dir: selected.directory,
		skill_md: selected.skillFile,
		files: sortedStrings(selected.relativeFiles),
		needs_selection: false,
	});
}

export async function runSkillxCleanup(ctx: AregCliContext, request: SkillxCleanupRequest): Promise<ClinkrExit<SkillxCleanupResult>> {
	const cleanup = await ctx.skillxWorkspace.cleanupWorkspace({ workspaceRoot: request.dir, cwd: ctx.cwd, env: ctx.env });
	if (cleanup.ok) return ok({ success: true, removed: request.dir });
	return negative(cleanup.error.message, { success: false, error: cleanup.error.message });
}

function parseGithubUrl(input: string): z.infer<typeof parseSuccessSchema> | undefined {
	let url: URL;
	try {
		url = new URL(input);
	} catch {
		return undefined;
	}
	if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
	if (url.hostname !== "github.com" && url.hostname !== "www.github.com") return undefined;
	const segments = url.pathname.split("/").filter((part) => part.length > 0);
	const owner = segments[0];
	const repoName = segments[1];
	if (owner === undefined || repoName === undefined || !isRepo(`${owner}/${repoName}`)) return undefined;
	const skillsIndex = segments.indexOf("skills");
	const skill = skillsIndex === -1 ? null : (segments[skillsIndex + 1] ?? null);
	return { success: true, repo: `${owner}/${repoName}`, skill, format: "url" };
}

function isRepo(value: string): boolean {
	return REPO_PATTERN.test(value);
}

function isSkillName(value: string): boolean {
	return value.length > 0 && !value.includes("/") && !value.includes("@") && !value.startsWith("-");
}

function parseError(error: string): ParseError {
	return { type: "error", data: { success: false, error } };
}

function fetchNegative(error: string): ClinkrExit<SkillxFetchResult> {
	return negative(error, { success: false, error, tmp_dir: null });
}

function sortedStrings(values: readonly string[]): string[] {
	return [...values].sort();
}

function sortedInstalledSkills(skills: readonly AregSkillxInstalledSkill[]): AregSkillxInstalledSkill[] {
	return skills
		.map((skill) => ({ ...skill, relativeFiles: sortedStrings(skill.relativeFiles) }))
		.sort((left, right) => left.name.localeCompare(right.name));
}
