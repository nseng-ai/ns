import { failure, negative, ok, type ClinkrExit } from "@nseng-ai/clinkr";
import { z } from "zod";

import {
	ALL_HARNESS_IDS,
	nodeHarnessArtifactModuleDiscoveryGateway,
	resolveGitProjectRoot,
	runHarnessArtifactReconcile,
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

const diagnosticSchema = z
	.object({
		code: z.string(),
		message: z.string(),
	})
	.passthrough();

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

export const nsUpdateResultSchema = z.object({
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
	const projectRoot = await resolveGitProjectRoot({
		startDir: context.cwd,
		pathState: nodeHarnessArtifactModuleDiscoveryGateway.pathState,
	});
	if (!projectRoot.ok) return reconcileFailureExit(projectRoot.error);

	const result = await runHarnessArtifactReconcile({
		projectRoot: projectRoot.value,
		homeDir: context.homeDir ?? context.env.HOME ?? "",
		env: context.env,
		dryRun: request.dryRun,
		force: request.force,
	});
	if (!result.ok) return reconcileFailureExit(result.error);
	const report = mutableReconcileReport(result.value);
	if (request.dryRun) return ok(report);
	if (report.needsForce) {
		return negative("Update refused: locally edited target files require --force.", {
			data: report,
		});
	}
	return ok(report);
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

function mutableReconcileReport(report: ReconcileReport): NsUpdateResult {
	return {
		mode: report.mode,
		harnessSelection:
			report.harnessSelection.type === "ns-toml"
				? { type: "ns-toml", harnesses: [...report.harnessSelection.harnesses] }
				: { type: "missing" },
		artifacts: report.artifacts.map((artifact) => ({
			...artifact,
			writtenFiles: [...artifact.writtenFiles],
			conflictingFiles: [...artifact.conflictingFiles],
		})),
		orphans: report.orphans.map((orphan) => ({ ...orphan })),
		diagnostics: report.diagnostics.map((diagnostic) => ({ ...diagnostic })),
		needsForce: report.needsForce,
	};
}

function countArtifacts(
	result: NsUpdateResult,
	action: NsUpdateResult["artifacts"][number]["action"],
): number {
	return result.artifacts.filter((artifact) => artifact.action === action).length;
}
