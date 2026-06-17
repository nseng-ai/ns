import type { AregCliContext } from "../context.ts";
import type {
	AregCheckPairingDirectory,
	AregCheckSkillInspection,
	AregInstructionFilesInspection,
	AregPathState,
	AregProjectBaseInspection,
	AregReplacementInspection,
	AregSkillKindSkillInspection,
	AregSkillNameInventory,
	AregTextFileState,
} from "../gateways.ts";
import { uniqueSortedStrings } from "../sort.ts";
import { parseInspectedLockfile } from "./lockfile.ts";

export interface AregProjectInspectionFacts extends AregProjectBaseInspection {
	piDir: AregPathState;
	piSettings: AregTextFileState;
	replacement: AregReplacementInspection;
	skillInventory: AregSkillNameInventory;
}

export interface AregCheckProjectInspection {
	projectDir: string;
	projectPathState: AregPathState;
	lockfile: AregTextFileState;
	skillsDirectoryNames: readonly string[];
	agentsSkillNames: readonly string[];
	excludedSkillNames: readonly string[];
	piDir: AregPathState;
	piSettings: AregTextFileState;
	replacement: AregReplacementInspection;
	skills: readonly AregCheckSkillInspection[];
	pairingDirectories: readonly AregCheckPairingDirectory[];
}

export interface AregSkillKindProjectInspection {
	projectDir: string;
	projectPathState: AregPathState;
	piDir: AregPathState;
	piSettings: AregTextFileState;
	replacement: AregReplacementInspection;
	skills: readonly AregSkillKindSkillInspection[];
}

export interface AregInitProjectInspection extends AregProjectBaseInspection, AregInstructionFilesInspection {}

export async function inspectInitProject(ctx: AregCliContext, projectPath: string): Promise<AregInitProjectInspection> {
	const base = await ctx.project.inspectProjectBase({ cwd: ctx.cwd, projectPath, env: ctx.env });
	const instructionFiles = await ctx.project.inspectInstructionFiles({ projectDir: base.projectDir, env: ctx.env });
	return { ...base, ...instructionFiles };
}

export async function collectProjectInspectionFacts(ctx: AregCliContext, projectPath: string): Promise<AregProjectInspectionFacts> {
	const base = await ctx.project.inspectProjectBase({ cwd: ctx.cwd, projectPath, env: ctx.env });
	const piArtifacts = await ctx.project.inspectPiArtifacts({ projectDir: base.projectDir, env: ctx.env });
	const skillInventory = await ctx.project.inspectSkillNameInventory({ projectDir: base.projectDir, env: ctx.env });
	return {
		...base,
		piDir: piArtifacts.piDir,
		piSettings: piArtifacts.piSettings,
		replacement: piArtifacts.replacement,
		skillInventory,
	};
}

export async function inspectCheckProject(ctx: AregCliContext, projectPath: string): Promise<AregCheckProjectInspection> {
	const facts = await collectProjectInspectionFacts(ctx, projectPath);
	const excludedSkillNames = await ctx.project.readLocallyExcludedSkillNames({ projectDir: facts.projectDir, env: ctx.env });
	const lockfileResult = parseInspectedLockfile(facts);
	const lockfileSkillNames = lockfileResult.ok ? lockfileResult.value.skills.map((skill) => skill.name) : [];
	const skillNames = uniqueSortedStrings([
		...lockfileSkillNames,
		...facts.skillInventory.skillsDirectoryNames,
		...facts.skillInventory.agentsSkillNames,
		...facts.skillInventory.claudeSkillNames,
	]);
	return {
		projectDir: facts.projectDir,
		projectPathState: facts.projectPathState,
		lockfile: facts.lockfile,
		skillsDirectoryNames: facts.skillInventory.skillsDirectoryNames,
		agentsSkillNames: facts.skillInventory.agentsSkillNames,
		excludedSkillNames,
		piDir: facts.piDir,
		piSettings: facts.piSettings,
		replacement: facts.replacement,
		skills: await collectCheckSkillInspections(ctx, facts.projectDir, skillNames),
		pairingDirectories: await ctx.project.inspectPairingDirectories({ projectDir: facts.projectDir, env: ctx.env }),
	};
}

export async function inspectSkillKindProject(ctx: AregCliContext, projectPath: string): Promise<AregSkillKindProjectInspection> {
	const facts = await collectProjectInspectionFacts(ctx, projectPath);
	return {
		projectDir: facts.projectDir,
		projectPathState: facts.projectPathState,
		piDir: facts.piDir,
		piSettings: facts.piSettings,
		replacement: facts.replacement,
		skills: await collectLocalSkillKindInspections(ctx, facts.projectDir, facts.skillInventory.localSkillKindNames),
	};
}

export async function collectCheckSkillInspections(ctx: AregCliContext, projectDir: string, skillNames: readonly string[]): Promise<readonly AregCheckSkillInspection[]> {
	return await collectSkillInspections(skillNames, (skillName) => ctx.project.inspectCheckSkill({ projectDir, skillName, env: ctx.env }));
}

export async function collectLocalSkillKindInspections(ctx: AregCliContext, projectDir: string, skillNames: readonly string[]): Promise<readonly AregSkillKindSkillInspection[]> {
	return await collectSkillInspections(skillNames, (skillName) => ctx.project.inspectLocalSkill({ projectDir, skillName, env: ctx.env }));
}

async function collectSkillInspections<T>(skillNames: readonly string[], inspect: (skillName: string) => Promise<T>): Promise<readonly T[]> {
	const skills: T[] = [];
	for (const skillName of skillNames) skills.push(await inspect(skillName));
	return skills;
}
