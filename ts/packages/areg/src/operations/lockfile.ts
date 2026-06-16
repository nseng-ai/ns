import { formatErrorMessage, formatZodIssue } from "@asdl/core/primitives";
import { z } from "zod";

import type { AregCheckTextFileState } from "../gateways.ts";
import { sortStrings } from "../sort.ts";

export const SOURCE_TYPES = ["local", "github", "git", "gitlab"] as const;

export type SourceType = (typeof SOURCE_TYPES)[number];

export interface LockfileSkillData {
	source: string;
	sourceType: SourceType;
	computedHash: string;
	skillPath?: string | undefined;
}

export interface LockfileSkill extends LockfileSkillData {
	name: string;
}

export interface SkillsLockfileData {
	version: 1;
	skills: Record<string, LockfileSkillData>;
}

export interface SkillsLockfile {
	version: 1;
	skills: readonly LockfileSkill[];
}

const lockfileSkillSchema: z.ZodType<LockfileSkillData> = z.object({
	source: z.string(),
	sourceType: z.enum(SOURCE_TYPES),
	computedHash: z.string(),
	skillPath: z.string().optional(),
});

const skillsLockfileSchema: z.ZodType<SkillsLockfileData> = z.object({
	version: z.literal(1),
	skills: z.record(z.string(), lockfileSkillSchema),
});

export function parseLockfileData(data: unknown): { type: "ok"; lockfile: SkillsLockfile } | { type: "error"; message: string } {
	const result = skillsLockfileSchema.safeParse(data);
	if (!result.success) return invalidLockfile(formatZodIssue(result.error.issues[0], { rootPath: "$", pathPrefix: "$.", fallback: "invalid lockfile" }));
	const lockfileData = result.data as SkillsLockfileData;
	const skills: LockfileSkill[] = [];
	for (const name of sortStrings(Object.keys(lockfileData.skills))) {
		const skill = lockfileData.skills[name];
		if (skill === undefined) continue;
		skills.push({ name, source: skill.source, sourceType: skill.sourceType, computedHash: skill.computedHash, skillPath: skill.skillPath });
	}
	return { type: "ok", lockfile: { version: 1, skills } };
}

export function parseLockfileText(text: string): { type: "ok"; lockfile: SkillsLockfile } | { type: "error"; message: string } {
	let data: unknown;
	try {
		data = JSON.parse(text);
	} catch (error) {
		return { type: "error", message: `Invalid JSON in skills-lock.json: ${formatErrorMessage(error)}` };
	}
	return parseLockfileData(data);
}

export function parseInspectedLockfile(input: {
	projectDir: string;
	lockfile: AregCheckTextFileState;
}): { type: "ok"; lockfile: SkillsLockfile } | { type: "error"; message: string } {
	if (input.lockfile.type !== "file") return { type: "error", message: `skills-lock.json not found in ${input.projectDir}. Is this an areg project?` };
	return parseLockfileText(input.lockfile.text);
}

function invalidLockfile(reason: string): { type: "error"; message: string } {
	return { type: "error", message: `Invalid skills-lock.json: ${reason}.` };
}
