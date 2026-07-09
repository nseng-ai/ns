import { failure, negative, ok, usageError, type ClinkrExit } from "@nseng-ai/clinkr";
import { optionalEntry } from "@nseng-ai/foundation/primitives";
import { z } from "zod";

import {
	reconcileReportSchema,
	runHarnessArtifactReconcile,
	type ReconcileErrorInfo,
} from "../api.ts";
import type { SkillsCommandContext } from "./skills-shared.ts";

const nsUpdateModeSchema = z.enum(["self", "extensions", "all"]);

export const nsUpdateRequestSchema = z.object({
	mode: nsUpdateModeSchema.default("self"),
	dryRun: z.boolean().default(false),
	force: z.boolean().default(false),
	target: z.string().optional(),
});

export const nsUpdateCliRequestSchema = z.object({
	extensions: z.boolean().default(false),
	self: z.boolean().default(false),
	all: z.boolean().default(false),
	dryRun: z.boolean().default(false),
	force: z.boolean().default(false),
	target: z.string().optional(),
});

export const nsUpdateResultSchema = reconcileReportSchema;
export type NsUpdateRequest = z.output<typeof nsUpdateRequestSchema>;
export type NsUpdateCliRequest = z.output<typeof nsUpdateCliRequestSchema>;
export type NsUpdateResult = z.output<typeof nsUpdateResultSchema>;

export async function runNsUpdateCli(
	context: SkillsCommandContext,
	request: NsUpdateCliRequest,
): Promise<ClinkrExit<NsUpdateResult>> {
	const modeResult = modeFromCliFlags(request);
	if (modeResult.type === "error") return modeResult.exit;
	return await runNsUpdate(context, { ...request, mode: modeResult.mode });
}

export async function runNsUpdate(
	context: SkillsCommandContext,
	request: NsUpdateRequest,
): Promise<ClinkrExit<NsUpdateResult>> {
	if (request.mode !== "extensions") {
		if (request.target !== undefined) {
			return usageError("Extension targets require ns update --extensions.", {
				argument: "target",
				target: request.target,
			});
		}
		return selfUpdateNotImplemented();
	}
	const baseRequest = {
		projectRoot: context.projectRoot,
		...optionalEntry("homeDir", context.homeDir),
		env: context.env,
		shouldForce: request.force,
		...optionalEntry("extensionTarget", request.target),
	};
	if (request.dryRun) {
		const preview = await runHarnessArtifactReconcile({ ...baseRequest, mode: "preview" });
		if (!preview.ok) return reconcileFailureExit(preview.error);
		return ok(preview.value);
	}
	if (!request.force) {
		const preview = await runHarnessArtifactReconcile({ ...baseRequest, mode: "check-force" });
		if (!preview.ok) return reconcileFailureExit(preview.error);
		if (preview.value.isForceRequired) {
			return negative("Update refused: locally edited target files require --force.", {
				data: preview.value,
			});
		}
	}
	const result = await runHarnessArtifactReconcile({ ...baseRequest, mode: "apply" });
	if (!result.ok) return reconcileFailureExit(result.error);
	if (result.value.skippedCollisions.length > 0) {
		return negative("Update skipped colliding harness artifacts.", { data: result.value });
	}
	return ok(result.value);
}

export function renderNsUpdateHuman(result: NsUpdateResult): string {
	const lines = [
		result.mode === "dry-run" ? "Extension update preview" : "Extension update applied",
	];
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
	if (result.diagnostics.length > 0) {
		lines.push("", "diagnostics:");
		for (const diagnostic of result.diagnostics) {
			lines.push(`- ${diagnostic.code}: ${diagnostic.message}`);
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
	if (result.skippedCollisions.length > 0) {
		lines.push("", "skipped collisions:");
		for (const collision of result.skippedCollisions) {
			lines.push(`- ${collision.kind} ${collision.value}: ${collision.packages.join(", ")}`);
		}
	}
	if (result.isForceRequired) lines.push("", "Conflicts found; re-run with --force to overwrite.");
	lines.push(
		"",
		`summary: ${countArtifacts(result, "installed")} installed, ${countArtifacts(result, "refreshed")} refreshed, ${countArtifacts(result, "unchanged")} unchanged, ${countArtifacts(result, "conflicted")} conflicted, ${countArtifacts(result, "skipped")} skipped, ${result.orphans.length} orphaned, ${result.diagnostics.length} diagnostic(s)`,
		"",
	);
	return lines.join("\n");
}

function modeFromCliFlags(
	request: NsUpdateCliRequest,
):
	| { type: "ok"; mode: NsUpdateRequest["mode"] }
	| { type: "error"; exit: ClinkrExit<NsUpdateResult> } {
	const selectedModes = [request.extensions, request.self, request.all].filter(Boolean).length;
	if (selectedModes > 1) {
		return {
			type: "error",
			exit: usageError("Choose exactly one update mode: --extensions, --self, or --all.", {
				modes: { extensions: request.extensions, self: request.self, all: request.all },
			}),
		};
	}
	if (request.extensions) return { type: "ok", mode: "extensions" };
	if (request.all) return { type: "ok", mode: "all" };
	return { type: "ok", mode: "self" };
}

function reconcileFailureExit<T>(error: ReconcileErrorInfo): ClinkrExit<T> {
	return failure(error.code.replaceAll("_", "-"), error.message, error.details);
}

function selfUpdateNotImplemented<T>(): ClinkrExit<T> {
	return failure(
		"self-update-not-implemented",
		"ns self-update is not implemented yet; run ns update --extensions to update extension artifacts.",
		{ availableMode: "extensions" },
	);
}

function countArtifacts(
	result: NsUpdateResult,
	action: NsUpdateResult["artifacts"][number]["action"],
): number {
	return result.artifacts.filter((artifact) => artifact.action === action).length;
}
