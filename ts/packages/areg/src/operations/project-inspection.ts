import type { AregCliContext } from "../context.ts";
import type {
	AregCheckSkillInspection,
	AregGenericReplacementInspection,
	AregPathState,
	AregSkillKindSkillInspection,
	AregSkillNameInventory,
	AregTextFileState,
} from "../gateways.ts";

export interface AregProjectInspectionFacts {
	projectDir: string;
	projectPathState: AregPathState;
	lockfile: AregTextFileState;
	asdlToml: AregTextFileState;
	aregJson: AregTextFileState;
	piDir: AregPathState;
	piSettings: AregTextFileState;
	genericReplacement: AregGenericReplacementInspection;
	skillInventory: AregSkillNameInventory;
}

export async function collectProjectInspectionFacts(ctx: AregCliContext, projectPath: string): Promise<AregProjectInspectionFacts> {
	const base = await ctx.project.inspectProjectBase({ cwd: ctx.cwd, projectPath, env: ctx.env });
	const piArtifacts = await ctx.project.inspectPiArtifacts({ projectDir: base.projectDir, env: ctx.env });
	const skillInventory = await ctx.project.inspectSkillNameInventory({ projectDir: base.projectDir, env: ctx.env });
	return {
		projectDir: base.projectDir,
		projectPathState: base.projectPathState,
		lockfile: base.lockfile,
		asdlToml: base.asdlToml,
		aregJson: base.aregJson,
		piDir: piArtifacts.piDir,
		piSettings: piArtifacts.piSettings,
		genericReplacement: piArtifacts.genericReplacement,
		skillInventory,
	};
}

export async function collectCheckSkillInspections(ctx: AregCliContext, projectDir: string, skillNames: readonly string[]): Promise<readonly AregCheckSkillInspection[]> {
	const skills: AregCheckSkillInspection[] = [];
	for (const skillName of skillNames) {
		skills.push(await ctx.project.inspectCheckSkill({ projectDir, skillName, env: ctx.env }));
	}
	return skills;
}

export async function collectLocalSkillKindInspections(ctx: AregCliContext, projectDir: string, skillNames: readonly string[]): Promise<readonly AregSkillKindSkillInspection[]> {
	const skills: AregSkillKindSkillInspection[] = [];
	for (const skillName of skillNames) {
		skills.push(await ctx.project.inspectLocalSkill({ projectDir, skillName, env: ctx.env }));
	}
	return skills;
}
