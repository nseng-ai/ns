import type { PathState, TextFileState } from "@nseng-ai/harness-artifacts/api";

import type { AregCliContext } from "../context.ts";
import type {
	AregCheckPairingDirectory,
	AregCheckSkillInspection,
	AregProjectBaseInspection,
	AregReplacementInspection,
	AregSkillKindSkillInspection,
	AregSkillNameInventory,
} from "../gateways.ts";
import {
	manifestSkillKindNames,
	type AregManifestSkillSourcesInspection,
} from "./manifest-sources.ts";
import { uniqueSortedStrings } from "../sort.ts";
import { parseInspectedLockfile } from "@nseng-ai/harness-artifacts/api";

export interface AregProjectInspectionFacts extends AregProjectBaseInspection {
	piDir: PathState;
	piSettings: TextFileState;
	replacement: AregReplacementInspection;
	skillInventory: AregSkillNameInventory;
	manifestSkillSources: AregManifestSkillSourcesInspection;
}

export interface AregCheckProjectInspection {
	projectDir: string;
	projectPathState: PathState;
	lockfile: TextFileState;
	skillsDirectoryNames: readonly string[];
	agentsSkillNames: readonly string[];
	excludedSkillNames: readonly string[];
	piDir: PathState;
	piSettings: TextFileState;
	replacement: AregReplacementInspection;
	manifestSkillSources: AregManifestSkillSourcesInspection;
	skills: readonly AregCheckSkillInspection[];
	pairingDirectories: readonly AregCheckPairingDirectory[];
}

export interface AregSkillKindProjectInspection {
	projectDir: string;
	projectPathState: PathState;
	piDir: PathState;
	piSettings: TextFileState;
	replacement: AregReplacementInspection;
	manifestSkillSources: AregManifestSkillSourcesInspection;
	skills: readonly AregSkillKindSkillInspection[];
}

export async function collectProjectInspectionFacts(
	ctx: AregCliContext,
	projectPath: string,
): Promise<AregProjectInspectionFacts> {
	const base = await ctx.project.inspectProjectBase({ cwd: ctx.cwd, projectPath, env: ctx.env });
	const piArtifacts = await ctx.project.inspectPiArtifacts({
		projectDir: base.projectDir,
		env: ctx.env,
	});
	const skillInventory = await ctx.project.inspectSkillNameInventory({
		projectDir: base.projectDir,
		env: ctx.env,
	});
	const manifestSkillSources = await ctx.project.inspectManifestSkillSources({
		projectDir: base.projectDir,
		env: ctx.env,
	});
	return {
		...base,
		piDir: piArtifacts.piDir,
		piSettings: piArtifacts.piSettings,
		replacement: piArtifacts.replacement,
		skillInventory,
		manifestSkillSources,
	};
}

export async function inspectCheckProject(
	ctx: AregCliContext,
	projectPath: string,
): Promise<AregCheckProjectInspection> {
	const facts = await collectProjectInspectionFacts(ctx, projectPath);
	const excludedSkillNames = await ctx.project.readLocallyExcludedSkillNames({
		projectDir: facts.projectDir,
		env: ctx.env,
	});
	const lockfileResult = parseInspectedLockfile(facts);
	const lockfileSkillNames = lockfileResult.ok
		? lockfileResult.value.skills.map((skill) => skill.name)
		: [];
	const manifestSkillNames = facts.manifestSkillSources.sources.map((source) => source.skillName);
	const skillNames = uniqueSortedStrings([
		...lockfileSkillNames,
		...facts.skillInventory.skillsDirectoryNames,
		...facts.skillInventory.agentsSkillNames,
		...facts.skillInventory.claudeSkillNames,
		...manifestSkillNames,
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
		manifestSkillSources: facts.manifestSkillSources,
		skills: await collectCheckSkillInspections(ctx, facts.projectDir, skillNames),
		pairingDirectories: await ctx.project.inspectPairingDirectories({
			projectDir: facts.projectDir,
			env: ctx.env,
		}),
	};
}

export async function inspectSkillKindProject(
	ctx: AregCliContext,
	projectPath: string,
): Promise<AregSkillKindProjectInspection> {
	const facts = await collectProjectInspectionFacts(ctx, projectPath);
	return {
		projectDir: facts.projectDir,
		projectPathState: facts.projectPathState,
		piDir: facts.piDir,
		piSettings: facts.piSettings,
		replacement: facts.replacement,
		manifestSkillSources: facts.manifestSkillSources,
		skills: await collectSkillKindInspections(
			ctx,
			facts.projectDir,
			uniqueSortedStrings([
				...facts.skillInventory.skillKindNames,
				...manifestSkillKindNames(facts.manifestSkillSources.sources),
			]),
		),
	};
}

export async function collectCheckSkillInspections(
	ctx: AregCliContext,
	projectDir: string,
	skillNames: readonly string[],
): Promise<readonly AregCheckSkillInspection[]> {
	return await collectSkillInspections(skillNames, (skillName) =>
		ctx.project.inspectCheckSkill({ projectDir, skillName, env: ctx.env }),
	);
}

export async function collectSkillKindInspections(
	ctx: AregCliContext,
	projectDir: string,
	skillNames: readonly string[],
): Promise<readonly AregSkillKindSkillInspection[]> {
	return await collectSkillInspections(skillNames, (skillName) =>
		ctx.project.inspectSkillKindSkill({ projectDir, skillName, env: ctx.env }),
	);
}

async function collectSkillInspections<T>(
	skillNames: readonly string[],
	inspect: (skillName: string) => Promise<T>,
): Promise<readonly T[]> {
	const skills: T[] = [];
	for (const skillName of skillNames) skills.push(await inspect(skillName));
	return skills;
}
