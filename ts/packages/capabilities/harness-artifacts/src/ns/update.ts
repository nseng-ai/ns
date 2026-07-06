import { failure, negative, ok, type ClinkrExit } from "@nseng-ai/clinkr";
import { z } from "zod";

import {
	ALL_HARNESS_IDS,
	runHarnessArtifactReconcile,
	type ModuleArtifactDiscoveryDiagnostic,
	type ReconcileErrorInfo,
	type ReconcileReport,
} from "../api.ts";
import type { SkillsCommandContext } from "./skills-shared.ts";

export const nsUpdateRequestSchema = z.object({
	dryRun: z.boolean().default(false),
	force: z.boolean().default(false),
});

const harnessSchema = z.enum(ALL_HARNESS_IDS);
const scopeSchema = z.enum(["project", "user"]);

const harnessSelectionSchema = z.discriminatedUnion("type", [
	z.object({ type: z.literal("ns-toml"), harnesses: z.array(harnessSchema) }),
	z.object({ type: z.literal("missing") }),
]);

const diagnosticCodeSchema = z.enum([
	"module_artifact_package_json_invalid",
	"module_artifact_package_name_invalid",
	"module_artifact_declarations_not_array",
	"module_artifact_declaration_invalid",
	"module_artifact_kind_unsupported",
	"module_artifact_name_invalid",
	"module_artifact_path_invalid",
	"module_artifact_duplicate_name",
	"module_artifact_extension_root_unavailable",
	"module_artifact_extension_root_not_directory",
	"module_artifact_extension_root_unreadable",
	"module_artifact_skill_path_escapes",
	"module_artifact_skill_entry_missing",
	"module_artifact_skill_entry_not_directory",
	"module_artifact_duplicate_id",
	"module_artifact_duplicate_target_name",
]);

const diagnosticSchema: z.ZodType<ModuleArtifactDiscoveryDiagnostic> = z
	.object({
		code: diagnosticCodeSchema,
		message: z.string(),
		path: z.string().optional(),
		packageName: z.string().optional(),
		artifactId: z.string().optional(),
		artifactName: z.string().optional(),
	})
	.transform((diagnostic) => ({
		code: diagnostic.code,
		message: diagnostic.message,
		...(diagnostic.path === undefined ? {} : { path: diagnostic.path }),
		...(diagnostic.packageName === undefined ? {} : { packageName: diagnostic.packageName }),
		...(diagnostic.artifactId === undefined ? {} : { artifactId: diagnostic.artifactId }),
		...(diagnostic.artifactName === undefined ? {} : { artifactName: diagnostic.artifactName }),
	}));

const reconcileArtifactOutcomeSchema = z.object({
	action: z.enum(["installed", "refreshed", "unchanged", "conflicted"]),
	artifactId: z.string(),
	skillName: z.string(),
	harness: harnessSchema,
	scope: scopeSchema,
	origin: z.enum(["declared", "manifest"]),
	sourceType: z.enum(["first-party", "npm-module"]),
	packageName: z.string(),
	targetArtifactPath: z.string(),
	manifestPath: z.string(),
	writtenFiles: z.array(z.string()),
	conflictingFiles: z.array(z.string()),
});

const orphanedManifestEntrySchema = z.object({
	artifactId: z.string(),
	harness: harnessSchema,
	scope: scopeSchema,
	targetRoot: z.string(),
	packageName: z.string(),
	sourceType: z.enum(["first-party", "npm-module"]),
});

export const nsUpdateResultSchema: z.ZodType<ReconcileReport> = z.object({
	mode: z.enum(["dry-run", "applied"]),
	harnessSelection: harnessSelectionSchema,
	artifacts: z.array(reconcileArtifactOutcomeSchema),
	orphans: z.array(orphanedManifestEntrySchema),
	diagnostics: z.array(diagnosticSchema),
	needsForce: z.boolean(),
});
export type NsUpdateRequest = z.output<typeof nsUpdateRequestSchema>;
export type NsUpdateResult = z.output<typeof nsUpdateResultSchema>;

export async function runNsUpdate(
	context: SkillsCommandContext,
	request: NsUpdateRequest,
): Promise<ClinkrExit<NsUpdateResult>> {
	const result = await runHarnessArtifactReconcile({
		projectRoot: context.projectRoot,
		homeDir: context.homeDir ?? context.env.HOME ?? "",
		env: context.env,
		dryRun: request.dryRun,
		force: request.force,
	});
	if (!result.ok) return reconcileFailureExit(result.error);
	if (request.dryRun) return ok(result.value);
	if (result.value.needsForce) {
		return negative("Update refused: locally edited target files require --force.", {
			data: result.value,
		});
	}
	return ok(result.value);
}

export function renderNsUpdateHuman(result: NsUpdateResult): string {
	const lines = [result.mode === "dry-run" ? "Update preview" : "Update applied"];
	if (result.harnessSelection.type === "missing") {
		lines.push(
			"",
			"No harness selection found in ns.toml — run `ns init` to select harnesses; refreshed manifest-tracked artifacts only.",
		);
	}
	lines.push("", "artifacts:");
	if (result.artifacts.length === 0) {
		lines.push("- none");
	} else {
		for (const artifact of result.artifacts) {
			lines.push(
				`- ${artifact.action} ${artifact.skillName} (${artifact.harness}) -> ${artifact.targetArtifactPath}`,
			);
		}
	}
	if (result.orphans.length > 0) {
		lines.push("", "orphans:");
		for (const orphan of result.orphans) {
			lines.push(
				`- orphaned — source missing, files left in place: ${orphan.artifactId} (${orphan.harness})`,
			);
		}
	}
	if (result.needsForce) lines.push("", "Conflicts found; re-run with --force to overwrite.");
	lines.push(
		"",
		`summary: ${countArtifacts(result, "installed")} installed, ${countArtifacts(result, "refreshed")} refreshed, ${countArtifacts(result, "unchanged")} unchanged, ${countArtifacts(result, "conflicted")} conflicted, ${result.orphans.length} orphaned, ${result.diagnostics.length} diagnostic(s)`,
		"",
	);
	return lines.join("\n");
}

function reconcileFailureExit<T>(error: ReconcileErrorInfo): ClinkrExit<T> {
	if (error.code === "artifact_collision") {
		return failure("artifact-collision", error.message, {
			collisions: error.details.collisions.map((collision) => ({
				...collision,
				packages: [...collision.packages],
			})),
		});
	}
	return failure(error.code.replaceAll("_", "-"), error.message, error.details);
}

function countArtifacts(
	result: NsUpdateResult,
	action: NsUpdateResult["artifacts"][number]["action"],
): number {
	return result.artifacts.filter((artifact) => artifact.action === action).length;
}
