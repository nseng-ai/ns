import { failure, negative, ok, type ClinkrExit } from "@nseng-ai/clinkr";
import { z } from "zod";

import {
	reconcileReportSchema,
	runHarnessArtifactReconcile,
	type ReconcileErrorInfo,
} from "../api.ts";
import type { SkillsCommandContext } from "./skills-shared.ts";

export const nsUpdateRequestSchema = z.object({
	dryRun: z.boolean().default(false),
	force: z.boolean().default(false),
});

export const nsUpdateResultSchema = reconcileReportSchema;
export type NsUpdateRequest = z.output<typeof nsUpdateRequestSchema>;
export type NsUpdateResult = z.output<typeof nsUpdateResultSchema>;

export async function runNsUpdate(
	context: SkillsCommandContext,
	request: NsUpdateRequest,
): Promise<ClinkrExit<NsUpdateResult>> {
	const baseRequest = {
		projectRoot: context.projectRoot,
		...homeDirEntry(context),
		env: context.env,
		force: request.force,
	};
	if (request.dryRun || !request.force) {
		const preview = await runHarnessArtifactReconcile({ ...baseRequest, dryRun: true });
		if (!preview.ok) return reconcileFailureExit(preview.error);
		if (request.dryRun) return ok(preview.value);
		if (preview.value.needsForce) {
			return negative("Update refused: locally edited target files require --force.", {
				data: preview.value,
			});
		}
	}
	const result = await runHarnessArtifactReconcile({ ...baseRequest, dryRun: false });
	if (!result.ok) return reconcileFailureExit(result.error);
	return ok(result.value);
}

function homeDirEntry(context: SkillsCommandContext): { homeDir: string } | {} {
	return context.homeDir === undefined ? {} : { homeDir: context.homeDir };
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
