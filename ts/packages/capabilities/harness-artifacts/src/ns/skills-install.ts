import { failure, negative, ok, type ClinkrExit } from "@nseng-ai/clinkr";
import { optionalEntry } from "@nseng-ai/foundation/primitives";
import { z } from "zod";

import {
	applyPreparedProvision,
	FIRST_PARTY_SKILL_CATALOG_SOURCE_UNAVAILABLE_MESSAGE,
	FIRST_PARTY_SKILL_CATALOG_SOURCE_VERSION,
	findFirstPartySkillArtifact,
	prepareProvision,
	resolveFirstPartyCatalogSourceRoot,
	type HarnessArtifactProvisionConflictOutcome,
	type ProvisionDecisionSet,
	type ProvisionPlan,
} from "../api.ts";
import {
	harnessResolutionContext,
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

const provisionFileSchema = z.object({
	relativePath: z.string(),
	sourcePath: z.string(),
	targetPath: z.string(),
	contentHash: z.string(),
});

const provisionDecisionSchema = z.object({
	type: z.enum(["fresh-write", "unchanged", "locally-edited-conflict"]),
	file: provisionFileSchema,
	currentHash: z.string().optional(),
	manifestHash: z.string().optional(),
});

export const skillsInstallResultSchema = skillsResolvedArtifactLocationSchema.extend({
	mode: z.enum(["dry-run", "applied"]),
	manifestPath: z.string(),
	needsForce: z.boolean(),
	decisions: z.array(provisionDecisionSchema),
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
	const sourceRoot = resolveFirstPartyCatalogSourceRoot();
	if (sourceRoot === undefined) {
		return failure(
			"catalog-source-unavailable",
			FIRST_PARTY_SKILL_CATALOG_SOURCE_UNAVAILABLE_MESSAGE,
		);
	}
	const artifact = findFirstPartySkillArtifact(request.skill);
	if (artifact === undefined) return unknownSkillExit(request.skill);
	const baseRequest = {
		artifact,
		harness: request.harness,
		scope: request.scope,
		context: harnessResolutionContext(context),
		sourceRoot,
		sourceVersion: FIRST_PARTY_SKILL_CATALOG_SOURCE_VERSION,
	};
	const prepared = await prepareProvision(baseRequest);
	if (!prepared.ok) return provisionErrorExit(prepared.error);
	if (request.dryRun) {
		return ok(
			installResultFromPlan({
				mode: "dry-run",
				plan: prepared.value.plan,
				decisions: prepared.value.decisions,
				manifestPath: prepared.value.manifestPath,
				writtenFiles: [],
			}),
		);
	}
	const applied = await applyPreparedProvision(prepared.value, { force: request.force });
	if (!applied.ok) return provisionErrorExit(applied.error);
	if (applied.value.outcome === "conflicted") return installProvisionConflictExit(applied.value);
	return ok(
		installResultFromPlan({
			mode: "applied",
			plan: applied.value.plan,
			decisions: applied.value.decisions,
			manifestPath: applied.value.manifestPath,
			writtenFiles: applied.value.writtenFiles,
		}),
	);
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
		`needs force: ${result.needsForce ? "yes" : "no"}`,
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
		needsForce: input.decisions.needsForce,
		decisions: input.decisions.files.map((decision) => ({
			type: decision.type,
			file: decision.file,
			...optionalEntry("currentHash", decision.currentHash),
			...optionalEntry("manifestHash", decision.manifestHash),
		})),
		writtenFiles: [...input.writtenFiles],
	};
}

function installProvisionConflictExit(
	outcome: HarnessArtifactProvisionConflictOutcome,
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
