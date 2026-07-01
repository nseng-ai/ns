import { failure, negative, ok, usageError, type ClinkrExit } from "@sdl/clinkr";
import { z } from "zod";

import type { ObjectiveCliContext } from "../../context.ts";
import { isValidObjectiveSlug } from "../../storage.ts";
import { pythonStringRepr, removeOneTrailingNewline } from "../format.ts";
import { readObjectiveRecord } from "../read-objective.ts";

export const autopilotPreflightRequestSchema = z.object({
	slug: z.string().optional().describe("Objective slug to preflight-check for autopilot."),
});

export const autopilotPreflightViolationSchema = z.enum([
	"worktree-dirty",
	"objective-not-found",
	"objective-closed",
	"on-trunk",
]);

export const autopilotPreflightResultSchema = z.object({
	ok: z.boolean(),
	slug: z.string(),
	startBranch: z.string().nullable(),
	trunk: z.string(),
	violations: z.array(autopilotPreflightViolationSchema),
});

export type AutopilotPreflightRequest = z.infer<typeof autopilotPreflightRequestSchema>;
export type AutopilotPreflightViolation = z.infer<typeof autopilotPreflightViolationSchema>;
export type AutopilotPreflightResult = z.infer<typeof autopilotPreflightResultSchema>;

export async function runAutopilotPreflight(
	ctx: ObjectiveCliContext,
	request: AutopilotPreflightRequest,
): Promise<ClinkrExit<AutopilotPreflightResult>> {
	if (request.slug === undefined) {
		return usageError("Objective slug is required.", { argument: "slug" });
	}
	if (!isValidObjectiveSlug(request.slug)) {
		return usageError(`Invalid Objective slug: ${pythonStringRepr(request.slug)}.`, {
			argument: "slug",
		});
	}

	const violations: AutopilotPreflightViolation[] = [];

	const dirty = await ctx.git.hasUncommittedChangesUnder({ cwd: ctx.repoRoot, relativePath: "." });
	if (!dirty.ok) return failure(dirty.error.code, dirty.error.message);
	if (dirty.value) violations.push("worktree-dirty");

	const record = await readObjectiveRecord(ctx.storage, request.slug);
	if (record.type === "storage-error") return failure(record.error.code, record.error.message);
	if (record.value.status === "not-found") {
		violations.push("objective-not-found");
	} else if (record.value.status === "ok" && record.value.closed) {
		violations.push("objective-closed");
	}

	const currentBranch = await ctx.git.currentBranch({ cwd: ctx.repoRoot });
	if (currentBranch.type === "failure") {
		return failure(currentBranch.error.code, currentBranch.error.message);
	}
	const startBranch = currentBranch.type === "branch" ? currentBranch.branch : null;
	if (startBranch === ctx.trunkBranch) violations.push("on-trunk");

	const result: AutopilotPreflightResult = {
		ok: violations.length === 0,
		slug: request.slug,
		startBranch,
		trunk: ctx.trunkBranch,
		violations,
	};
	if (!result.ok) {
		return negative(
			`Objective autopilot preflight failed for ${pythonStringRepr(request.slug)}: ${violations.join(", ")}.`,
			{ data: result },
		);
	}
	return ok(result);
}

export function renderAutopilotPreflight(result: AutopilotPreflightResult): string {
	const lines = [
		`# Objective Autopilot Preflight \`${result.slug}\``,
		"",
		`Ready: ${result.ok ? "yes" : "no"}`,
		`Start branch: ${result.startBranch ?? "detached HEAD"}`,
		`Trunk: \`${result.trunk}\``,
	];
	if (result.violations.length > 0) {
		lines.push("", "## Violations");
		for (const violation of result.violations) lines.push(`- ${violation}`);
	}
	return removeOneTrailingNewline(lines.join("\n"));
}
