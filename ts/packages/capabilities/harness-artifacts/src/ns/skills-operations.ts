import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { failure, negative, ok, usageError, type ClinkrExit } from "@nseng-ai/clinkr";
import { z } from "zod";

import {
	applyHarnessArtifactProvision,
	findFirstPartySkillArtifact,
	listFirstPartySkillArtifacts,
	previewHarnessArtifactProvision,
	resolveHarnessArtifactPath,
	type HarnessArtifactProvisionErrorInfo,
	type HarnessPathErrorInfo,
	type ProvisionDecisionSet,
	type ProvisionPlan,
} from "../api.ts";

export const skillsListRequestSchema = z.object({});
export const skillsPathRequestSchema = z.object({
	skill: z.string().min(1),
	harness: z.string().min(1),
	scope: z.enum(["user", "project"]).default("project"),
});
export const skillsInstallRequestSchema = skillsPathRequestSchema.extend({
	dryRun: z.boolean().default(false),
	force: z.boolean().default(false),
});

export const skillsListResultSchema = z.object({
	catalogId: z.string(),
	skills: z.array(
		z.object({
			id: z.string(),
			name: z.string(),
			description: z.string(),
			skillName: z.string(),
			sourcePackage: z.string(),
			sourceRelativePath: z.string(),
		}),
	),
});
export type SkillsListResult = z.infer<typeof skillsListResultSchema>;

export const skillsPathResultSchema = z.object({
	skill: z.string(),
	artifactId: z.string(),
	harness: z.enum(["claude-code", "codex", "pi"]),
	scope: z.enum(["user", "project"]),
	targetRoot: z.string(),
	targetArtifactPath: z.string(),
});
export type SkillsPathResult = z.infer<typeof skillsPathResultSchema>;

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

export const skillsInstallResultSchema = z.object({
	mode: z.enum(["dry-run", "applied"]),
	skill: z.string(),
	artifactId: z.string(),
	harness: z.enum(["claude-code", "codex", "pi"]),
	scope: z.enum(["user", "project"]),
	targetRoot: z.string(),
	targetArtifactPath: z.string(),
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

export interface SkillsCommandContext {
	cwd: string;
	homeDir?: string;
	env: Record<string, string | undefined>;
}

export function runSkillsList(): ClinkrExit<SkillsListResult> {
	return ok({
		catalogId: "ns-first-party",
		skills: listFirstPartySkillArtifacts().map((artifact) => ({
			id: artifact.id,
			name: artifact.name,
			description: artifact.description,
			skillName: artifact.skillName,
			sourcePackage: artifact.source.packageName,
			sourceRelativePath: artifact.source.relativePath,
		})),
	});
}

export function runSkillsPath(
	context: SkillsCommandContext,
	request: z.output<typeof skillsPathRequestSchema>,
): ClinkrExit<SkillsPathResult> {
	const artifact = findFirstPartySkillArtifact(request.skill);
	if (artifact === undefined) return unknownSkillExit(request.skill);
	const resolvedPath = resolveHarnessArtifactPath({
		harness: request.harness,
		scope: request.scope,
		kind: artifact.kind,
		artifactName: artifact.skillName,
		context: pathContext(context),
	});
	if (!resolvedPath.ok) return harnessPathErrorExit(resolvedPath.error);
	return ok({
		skill: artifact.skillName,
		artifactId: artifact.id,
		harness: resolvedPath.value.harness,
		scope: resolvedPath.value.scope,
		targetRoot: resolvedPath.value.rootPath,
		targetArtifactPath: resolvedPath.value.artifactPath,
	});
}

export async function runSkillsInstall(
	context: SkillsCommandContext,
	request: z.output<typeof skillsInstallRequestSchema>,
): Promise<ClinkrExit<SkillsInstallCommandResult>> {
	const sourceRoot = resolveFirstPartyCatalogSourceRoot();
	if (sourceRoot === undefined) {
		return failure(
			"catalog-source-unavailable",
			"Could not locate the first-party ns skill catalog source root for provisioning.",
		);
	}
	const artifact = findFirstPartySkillArtifact(request.skill);
	if (artifact === undefined) return unknownSkillExit(request.skill);
	const baseRequest = {
		artifact,
		harness: request.harness,
		scope: request.scope,
		context: pathContext(context),
		sourceRoot,
		sourceVersion: "static-catalog-v1",
	};
	if (request.dryRun) {
		const preview = await previewHarnessArtifactProvision(baseRequest);
		if (!preview.ok) return provisionErrorExit(preview.error);
		return ok(
			installResultFromPlan({
				mode: "dry-run",
				plan: preview.value.plan,
				decisions: preview.value.decisions,
				manifestPath: preview.value.manifestPath,
				writtenFiles: [],
			}),
		);
	}
	const applied = await applyHarnessArtifactProvision({ ...baseRequest, force: request.force });
	if (!applied.ok) return installProvisionErrorExit(applied.error);
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

export function renderSkillsListHuman(result: SkillsListResult): string {
	const lines = [`ns first-party skills (${result.catalogId})`];
	for (const skill of result.skills) {
		lines.push(`- ${skill.skillName} (${skill.id}) — ${skill.description}`);
	}
	return `${lines.join("\n")}\n`;
}

export function renderSkillsPathHuman(result: SkillsPathResult): string {
	return [
		`skill: ${result.skill}`,
		`artifact: ${result.artifactId}`,
		`harness: ${result.harness}`,
		`scope: ${result.scope}`,
		`target root: ${result.targetRoot}`,
		`target path: ${result.targetArtifactPath}`,
		"",
	].join("\n");
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

function pathContext(context: SkillsCommandContext) {
	const claudeConfigDir = context.env.CLAUDE_CONFIG_DIR;
	return {
		projectRoot: context.cwd,
		homeDir: context.homeDir ?? context.env.HOME ?? "",
		env: claudeConfigDir === undefined ? {} : { CLAUDE_CONFIG_DIR: claudeConfigDir },
	};
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
			...(decision.currentHash === undefined ? {} : { currentHash: decision.currentHash }),
			...(decision.manifestHash === undefined ? {} : { manifestHash: decision.manifestHash }),
		})),
		writtenFiles: [...input.writtenFiles],
	};
}

function unknownSkillExit<T>(skill: string): ClinkrExit<T> {
	return negative(`Unknown first-party ns skill ${JSON.stringify(skill)}.`);
}

function provisionErrorExit<T>(error: HarnessArtifactProvisionErrorInfo): ClinkrExit<T> {
	if (error.code === "unknown_harness") return harnessPathErrorExit(error);
	return failure(error.code.replaceAll("_", "-"), error.message, error.details);
}

function harnessPathErrorExit<T>(error: HarnessPathErrorInfo): ClinkrExit<T> {
	if (error.code === "unknown_harness") {
		return usageError(error.message, { field: "harness", ...error.details });
	}
	return failure(error.code.replaceAll("_", "-"), error.message, error.details);
}

function installProvisionErrorExit(
	error: HarnessArtifactProvisionErrorInfo,
): ClinkrExit<SkillsInstallCommandResult> {
	if (error.code === "locally_edited_conflict") {
		return negative(error.message, {
			data: { ...error.details, conflictingFiles: [...error.details.conflictingFiles] },
		});
	}
	return provisionErrorExit(error);
}

function resolveFirstPartyCatalogSourceRoot(): string | undefined {
	let current = dirname(fileURLToPath(import.meta.url));
	for (let index = 0; index < 12; index += 1) {
		if (existsSync(join(current, "skills", "objective", "SKILL.md"))) return current;
		const parent = dirname(current);
		if (parent === current) break;
		current = parent;
	}
	return undefined;
}
