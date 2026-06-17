import { formatErrorMessage, formatZodIssue } from "@asdl/core/primitives";
import { resultErr, type Result } from "@asdl/core/result";
import { z } from "zod";

import type { AregTextFileState } from "../gateways.ts";
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

export function parseLockfileData(data: unknown): Result<SkillsLockfile> {
	const result = skillsLockfileSchema.safeParse(data);
	if (!result.success) return invalidLockfile(formatZodIssue(result.error.issues[0], { rootPath: "$", pathPrefix: "$.", fallback: "invalid lockfile" }));
	const lockfileData = result.data as SkillsLockfileData;
	const skills: LockfileSkill[] = [];
	for (const name of sortStrings(Object.keys(lockfileData.skills))) {
		const skill = lockfileData.skills[name];
		if (skill === undefined) continue;
		skills.push({ name, source: skill.source, sourceType: skill.sourceType, computedHash: skill.computedHash, skillPath: skill.skillPath });
	}
	return { ok: true, value: { version: 1, skills } };
}

export function parseLockfileText(text: string): Result<SkillsLockfile> {
	let data: unknown;
	try {
		data = JSON.parse(text);
	} catch (error) {
		return resultErr({ code: "lockfile_invalid_json", message: `Invalid JSON in skills-lock.json: ${formatErrorMessage(error)}` });
	}
	return parseLockfileData(data);
}

export function parseInspectedLockfile(input: {
	projectDir: string;
	lockfile: AregTextFileState;
}): Result<SkillsLockfile> {
	if (input.lockfile.type !== "file") return resultErr({ code: "lockfile_missing", message: `skills-lock.json not found in ${input.projectDir}. Is this an areg project?` });
	return parseLockfileText(input.lockfile.text);
}

function invalidLockfile(reason: string): Result<SkillsLockfile> {
	return resultErr({ code: "lockfile_invalid", message: `Invalid skills-lock.json: ${reason}.` });
}
