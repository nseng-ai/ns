import { failure, negative, ok, type ClinkrExit } from "@nseng-ai/clinkr";
import { optionalEntry } from "@nseng-ai/foundation/primitives";
import { z } from "zod";

import {
	provisionFileDecisionSchema,
	provisionFirstPartySkill,
	type ProvisionDecisionSet,
	type ProvisionFirstPartySkillOutcome,
	type ProvisionPlan,
} from "../api.ts";
import {
	provisionErrorExit,
	skillsResolvedArtifactLocationSchema,
	skillsTargetRequestSchema,
	unknownSkillExit,
	type SkillsCommandContext,
} from "./skills-shared.ts";

export const skillsInstallRequestSchema = skillsTargetRequestSchema.extend({
	dryRun: z.boolean().default(false),
	force: z.boolean().default(false),
});

export const skillsInstallResultSchema = skillsResolvedArtifactLocationSchema.extend({
	mode: z.enum(["dry-run", "applied"]),
	manifestPath: z.string(),
	isForceRequired: z.boolean(),
	decisions: z.array(provisionFileDecisionSchema),
	writtenFiles: z.array(z.string()),
});
export type SkillsInstallResult = z.infer<typeof skillsInstallResultSchema>;

export const skillsInstallConflictResultSchema = z.object({
	manifestPath: z.string(),
	conflictingFiles: z.array(z.string()),
});
export type SkillsInstallConflictResult = z.infer<typeof skillsInstallConflictResultSchema>;

export const skillsInstallCommandResultSchema = z.union([
	skillsInstallResultSchema,
	skillsInstallConflictResultSchema,
]);
export type SkillsInstallCommandResult = z.infer<typeof skillsInstallCommandResultSchema>;

export async function runSkillsInstall(
	context: SkillsCommandContext,
	request: z.output<typeof skillsInstallRequestSchema>,
): Promise<ClinkrExit<SkillsInstallCommandResult>> {
	const outcome = await provisionFirstPartySkill({
		skill: request.skill,
		harness: request.harness,
		scope: request.scope,
		projectRoot: context.projectRoot,
		...optionalEntry("homeDir", context.homeDir),
		env: context.env,
		isDryRun: request.dryRun,
		shouldForce: request.force,
	});
	switch (outcome.type) {
		case "catalog-source-unavailable":
			return failure("catalog-source-unavailable", outcome.message);
		case "unknown-skill":
			return unknownSkillExit(outcome.skill);
		case "error":
			return provisionErrorExit(outcome.error);
		case "conflicted":
			return installProvisionConflictExit(outcome);
		case "provisioned":
			return ok(
				installResultFromPlan({
					mode: outcome.mode,
					plan: outcome.plan,
					decisions: outcome.decisions,
					manifestPath: outcome.manifestPath,
					writtenFiles: outcome.writtenFiles,
				}),
			);
	}
}

export function renderSkillsInstallHuman(result: SkillsInstallCommandResult): string {
	if (!("mode" in result)) {
		return `Provision refused: ${result.conflictingFiles.length} locally edited target file(s).\n`;
	}
	const lines = [
		result.mode === "dry-run" ? "Provision preview" : "Provision applied",
		`skill: ${result.skill}`,
		`harness: ${result.harness}`,
		`scope: ${result.scope}`,
		`target path: ${result.targetArtifactPath}`,
		`manifest: ${result.manifestPath}`,
		`requires force: ${result.isForceRequired ? "yes" : "no"}`,
		"decisions:",
	];
	for (const decision of result.decisions) {
		lines.push(`- ${decision.type}: ${decision.file.relativePath} -> ${decision.file.targetPath}`);
	}
	if (result.mode === "applied") {
		lines.push("written files:");
		for (const file of result.writtenFiles) lines.push(`- ${file}`);
	}
	lines.push("");
	return lines.join("\n");
}

function installResultFromPlan(input: {
	mode: SkillsInstallResult["mode"];
	plan: ProvisionPlan;
	decisions: ProvisionDecisionSet;
	manifestPath: string;
	writtenFiles: readonly string[];
}): SkillsInstallResult {
	return {
		mode: input.mode,
		skill: input.plan.provisionName,
		artifactId: input.plan.artifactId,
		harness: input.plan.harness,
		scope: input.plan.scope,
		targetRoot: input.plan.targetRoot,
		targetArtifactPath: input.plan.targetArtifactPath,
		manifestPath: input.manifestPath,
		isForceRequired: input.decisions.isForceRequired,
		decisions: [...input.decisions.files],
		writtenFiles: [...input.writtenFiles],
	};
}

function installProvisionConflictExit(
	outcome: Extract<ProvisionFirstPartySkillOutcome, { type: "conflicted" }>,
): ClinkrExit<SkillsInstallCommandResult> {
	return negative(
		`Provision refused: ${outcome.conflictingFiles.length} locally edited target file(s). Re-run with --force to overwrite them.`,
		{
			data: {
				manifestPath: outcome.manifestPath,
				conflictingFiles: [...outcome.conflictingFiles],
			},
		},
	);
}
